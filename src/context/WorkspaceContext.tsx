import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { LocalEntry } from '../types';
import { useProject } from './ProjectContext';
import { listEntries, listPhotos, removeEntry, saveEntry, savePhoto, workspaceId } from '../lib/workspace';
import { photoFilename, photoUrlToPath, processPhoto, randomSuffix } from '../lib/photos';
import { fetchDeployInfo, fetchRunForCommit, fetchTreeShas } from '../lib/github';
import { runSync, SyncConflictError, type Conflict } from '../lib/sync';
import { deriveStatus, type StatusKind } from '../lib/status';

type LastSync = { sha: string; at: number };
type Run = { status: string; conclusion: string | null; url: string };
type Deploy = { exists: boolean; active: boolean };

interface WorkspaceValue {
  entries: LocalEntry[];
  refresh: () => Promise<void>;
  pendingCount: number;
  syncing: boolean;
  status: { kind: StatusKind; text: string };
  runUrl: string | null;
  syncError: string;
  conflicts: Conflict[];
  // Goes up after every successful Sync, so pages showing GitHub's files can reload
  syncCount: number;
  sync: () => Promise<void>;
  resolveConflict: (key: string, choice: 'mine' | 'theirs') => Promise<void>;
  dismissConflicts: () => void;
  addPhotos: (files: File[], slug: string, folder: string, prefix?: string) => Promise<{ urls: string[]; errors: string[] }>;
  photoSrc: (url: string, folder: string, prefix?: string) => string;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

const POLL_MS = 15_000;
const lastSyncKey = (projectId: string) => `marksman:lastSync:${projectId}`;

function loadLastSync(projectId: string): LastSync | null {
  try {
    const raw = localStorage.getItem(lastSyncKey(projectId));
    return raw ? (JSON.parse(raw) as LastSync) : null;
  } catch {
    return null;
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { project, config, repoInfo } = useProject();
  const [entries, setEntries] = useState<LocalEntry[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [lastSync, setLastSync] = useState<LastSync | null>(null);
  const [syncCount, setSyncCount] = useState(0);
  const [deploy, setDeploy] = useState<Deploy | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [now, setNow] = useState(Date.now());
  // Object URLs for photos that only exist in this browser so far
  const [localSrc, setLocalSrc] = useState<Map<string, string>>(new Map());

  const projectId = project ? workspaceId(project) : null;
  const workflow = config?.deployWorkflow;

  const refresh = useCallback(async () => {
    setEntries(projectId ? await listEntries(projectId) : []);
  }, [projectId]);

  useEffect(() => {
    refresh();
    setLastSync(projectId ? loadLastSync(projectId) : null);
    setRun(null);
    setDeploy(null);
    setConflicts([]);
    setSyncError('');
  }, [projectId, refresh]);

  useEffect(() => {
    let urls = new Map<string, string>();
    let cancelled = false;
    (projectId ? listPhotos(projectId) : Promise.resolve([])).then(photos => {
      if (cancelled) return;
      urls = new Map(photos.map(p => [p.url, URL.createObjectURL(p.blob)]));
      setLocalSrc(urls);
    });
    return () => {
      cancelled = true;
      urls.forEach(u => URL.revokeObjectURL(u));
    };
  }, [projectId]);

  const addPhotos = useCallback(async (files: File[], slug: string, folder: string, prefix?: string) => {
    const urls: string[] = [];
    const errors: string[] = [];
    if (!projectId) return { urls, errors };
    const used = [...localSrc.keys()]
      .map(url => url.split('/').pop()?.match(new RegExp(`^${slug}-(\\d+)-`))?.[1])
      .filter(Boolean)
      .map(Number);
    let n = used.length > 0 ? Math.max(...used) : 0;
    const added = new Map<string, string>();
    for (const file of files) {
      try {
        const blob = await processPhoto(file);
        const name = photoFilename(slug, ++n, randomSuffix());
        const url = prefix ? `${prefix}/${name}` : `/${folder}/${name}`;
        await savePhoto({ key: '', projectId, url, path: `${folder}/${name}`, blob });
        added.set(url, URL.createObjectURL(blob));
        urls.push(url);
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    setLocalSrc(prev => new Map([...prev, ...added]));
    return { urls, errors };
  }, [projectId, localSrc]);

  const photoSrc = useCallback((url: string, folder: string, prefix?: string) => {
    const local = localSrc.get(url);
    if (local || !project || !repoInfo || !url.startsWith('/')) return local ?? url;
    const path = photoUrlToPath(url, folder, prefix);
    return `https://raw.githubusercontent.com/${project.owner}/${project.repo}/${repoInfo.defaultBranch}/${path}`;
  }, [localSrc, project, repoInfo]);

  const loadDeploy = useCallback(async () => {
    if (!project || !workflow) return setDeploy(null);
    try {
      setDeploy(await fetchDeployInfo(project.pat, project.owner, project.repo, workflow));
    } catch {
      setDeploy(null);
    }
  }, [project, workflow]);

  useEffect(() => {
    loadDeploy();
  }, [loadDeploy]);

  const loadRun = useCallback(async () => {
    setNow(Date.now());
    if (!project || !workflow || !lastSync) return;
    try {
      setRun(await fetchRunForCommit(project.pat, project.owner, project.repo, workflow, lastSync.sha));
    } catch {
      // Keep the last known run; the next poll tries again
    }
  }, [project, workflow, lastSync]);

  useEffect(() => {
    loadRun();
  }, [loadRun]);

  const pendingCount = entries.filter(e => e.state !== 'draft').length;
  const status = deriveStatus({ syncing, pending: pendingCount, lastSync, run, deploy, now });

  useEffect(() => {
    if (pendingCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pendingCount]);

  // Only poll GitHub while a deploy is actually in flight
  useEffect(() => {
    if (status.kind !== 'updating') return;
    const id = setInterval(loadRun, POLL_MS);
    return () => clearInterval(id);
  }, [status.kind, loadRun]);

  const sync = useCallback(async () => {
    if (!project || !config || !repoInfo) return;
    setSyncing(true);
    setSyncError('');
    setConflicts([]);
    try {
      const { commitSha } = await runSync({
        pat: project.pat,
        owner: project.owner,
        repo: project.repo,
        branch: repoInfo.defaultBranch,
        projectId: workspaceId(project),
        config,
      });
      const next = { sha: commitSha, at: Date.now() };
      localStorage.setItem(lastSyncKey(workspaceId(project)), JSON.stringify(next));
      setLastSync(next);
      setSyncCount(c => c + 1);
      setRun(null);
      await loadDeploy();
    } catch (err) {
      if (err instanceof SyncConflictError) setConflicts(err.conflicts);
      else setSyncError(`Sync failed: ${err instanceof Error ? err.message : String(err)}. Nothing was lost — try again.`);
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [project, config, repoInfo, loadDeploy, refresh]);

  const resolveConflict = useCallback(async (key: string, choice: 'mine' | 'theirs') => {
    const entry = entries.find(e => e.key === key);
    if (!entry || !project || !repoInfo) return;
    if (choice === 'theirs') {
      await removeEntry(key);
    } else {
      // Keep my version: start from whatever is on GitHub now
      const { shas } = await fetchTreeShas(project.pat, project.owner, project.repo, repoInfo.defaultBranch);
      await saveEntry({ ...entry, baseSha: shas.get(entry.path) ?? null });
    }
    setConflicts(cs => cs.filter(c => c.key !== key));
    await refresh();
  }, [entries, project, repoInfo, refresh]);

  const value = useMemo<WorkspaceValue>(() => ({
    entries,
    refresh,
    pendingCount,
    syncing,
    status,
    runUrl: run?.url ?? null,
    syncError,
    conflicts,
    syncCount,
    sync,
    resolveConflict,
    dismissConflicts: () => setConflicts([]),
    addPhotos,
    photoSrc,
  }), [entries, refresh, pendingCount, syncing, status, run, syncError, conflicts, syncCount, sync, resolveConflict, addPhotos, photoSrc]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
