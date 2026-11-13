import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { LocalEntry } from '../types';
import { useProject } from './ProjectContext';
import { listEntries, removeEntry, saveEntry } from '../lib/workspace';
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
  sync: () => Promise<void>;
  resolveConflict: (key: string, choice: 'mine' | 'theirs') => Promise<void>;
  dismissConflicts: () => void;
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
  const [deploy, setDeploy] = useState<Deploy | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [now, setNow] = useState(Date.now());

  const projectId = project?.id ?? null;
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
        projectId: project.id,
        config,
      });
      const next = { sha: commitSha, at: Date.now() };
      localStorage.setItem(lastSyncKey(project.id), JSON.stringify(next));
      setLastSync(next);
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
    sync,
    resolveConflict,
    dismissConflicts: () => setConflicts([]),
  }), [entries, refresh, pendingCount, syncing, status, run, syncError, conflicts, sync, resolveConflict]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
