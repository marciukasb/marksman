import type { CmsConfig, FieldConfig, LocalEntry, LocalPhoto } from '../types';
import { parsePost, serializePost } from './frontmatter';
import {
  commitChanges, dispatchDeploy, fetchDeployInfo, fetchFile, fetchTreeShas, listFiles, RefMovedError, type TreeChange,
} from './github';
import { blobToBase64, isMarksmanPhoto, photoUrlToPath, referencedPhotos } from './photos';
import { getEntry, listEntries, listPhotos, removeEntry, removePhoto, saveEntry } from './workspace';

export type Conflict = { key: string; title: string; reason: 'changed' | 'exists' | 'deleted' };

export class SyncConflictError extends Error {
  constructor(public conflicts: Conflict[]) {
    super('Some posts changed on GitHub since you started editing them');
    this.name = 'SyncConflictError';
  }
}

export interface SyncPlan {
  changes: TreeChange[];
  photoUploads: LocalPhoto[];
  conflicts: Conflict[];
  message: string;
  syncedKeys: string[];
}

interface EntryScope {
  fields: FieldConfig[];
  imageFolder: string;
  imageUrlPrefix?: string;
}

function scopeFor(entry: LocalEntry, config: CmsConfig): EntryScope {
  if (entry.kind === 'single') {
    const single = config.singles?.find(s => s.name === entry.scope);
    return { fields: single?.fields ?? [], imageFolder: single?.imageFolder ?? '', imageUrlPrefix: single?.imageUrlPrefix };
  }
  const collection = config.collections.find(c => c.name === entry.scope);
  return {
    fields: collection?.fields ?? [],
    imageFolder: collection?.imageFolder ?? '',
    imageUrlPrefix: collection?.imageUrlPrefix,
  };
}

const titleOf = (entry: LocalEntry) => (entry.kind === 'single' ? entry.scope : String(entry.data.title ?? '') || entry.slug || entry.path);

function conflictFor(entry: LocalEntry, current: string | undefined): Conflict['reason'] | null {
  if (entry.baseSha === null) return current ? 'exists' : null;
  if (!current) return 'deleted';
  return current === entry.baseSha ? null : 'changed';
}

export function planSync(input: {
  entries: LocalEntry[];
  photos: LocalPhoto[];
  repoShas: Map<string, string>;
  liveRefs: Map<string, string[]>;
  config: CmsConfig;
}): SyncPlan {
  const { entries, photos, repoShas, liveRefs, config } = input;
  const outgoing = entries.filter(e => e.state !== 'draft');
  const conflicts: Conflict[] = [];
  for (const entry of outgoing) {
    const reason = conflictFor(entry, repoShas.get(entry.path));
    if (reason) conflicts.push({ key: entry.key, title: titleOf(entry), reason });
  }
  if (conflicts.length > 0) return { changes: [], photoUploads: [], conflicts, message: '', syncedKeys: [] };

  const localPhotos = new Map(photos.map(p => [p.url, p]));
  const newRefs = new Map(
    outgoing.filter(e => e.state === 'submitted').map(e => [e.path, referencedPhotos(e.data, e.body, scopeFor(e, config).fields)]),
  );
  // A photo is still in use if any other live post or any outgoing post references it
  const usedElsewhere = (url: string, ownPath: string) =>
    [...liveRefs].some(([path, refs]) => path !== ownPath && refs.includes(url)) ||
    [...newRefs].some(([path, refs]) => path !== ownPath && refs.includes(url));

  const changes: TreeChange[] = [];
  const photoUploads: LocalPhoto[] = [];
  const verbs: string[] = [];
  for (const entry of outgoing) {
    const scope = scopeFor(entry, config);
    const refs = newRefs.get(entry.path) ?? [];
    if (entry.state === 'deleted') {
      changes.push({ path: entry.path, delete: true });
      verbs.push(`delete "${titleOf(entry)}"`);
    } else {
      changes.push({ path: entry.path, content: serializePost(entry.data, entry.body), encoding: 'utf-8' });
      verbs.push(`${entry.baseSha === null ? 'publish' : 'update'} "${titleOf(entry)}"`);
      for (const url of refs) {
        const local = localPhotos.get(url);
        if (local && !photoUploads.includes(local)) photoUploads.push(local);
      }
    }
    for (const url of entry.livePhotos) {
      if (!isMarksmanPhoto(url) || refs.includes(url) || usedElsewhere(url, entry.path)) continue;
      const path = photoUrlToPath(url, scope.imageFolder, scope.imageUrlPrefix);
      if (repoShas.has(path) && !changes.some(c => c.path === path)) changes.push({ path, delete: true });
    }
  }
  return {
    changes,
    photoUploads,
    conflicts: [],
    message: `cms: ${verbs.join(', ')}`,
    syncedKeys: outgoing.map(e => e.key),
  };
}

export interface SyncTarget {
  pat: string;
  owner: string;
  repo: string;
  branch: string;
  projectId: string;
  config: CmsConfig;
}

// Photo references of every live post, so Sync never deletes a photo another post still shows
async function loadLiveRefs(target: SyncTarget): Promise<Map<string, string[]>> {
  const { pat, owner, repo, branch, config } = target;
  const refs = new Map<string, string[]>();
  for (const collection of config.collections) {
    const files = await listFiles(pat, owner, repo, collection.folder);
    for (const file of files) {
      const { content } = await fetchFile(pat, owner, repo, file.path, branch);
      const { data, body } = parsePost(content);
      refs.set(file.path, referencedPhotos(data, body, collection.fields));
    }
  }
  return refs;
}

export async function runSync(target: SyncTarget): Promise<{ commitSha: string }> {
  const { pat, owner, repo, branch, projectId, config } = target;
  const entries = await listEntries(projectId);
  const photos = await listPhotos(projectId);
  const needsRefs = entries.some(e => e.state !== 'draft' && e.livePhotos.length > 0);
  const liveRefs = needsRefs ? await loadLiveRefs(target) : new Map<string, string[]>();

  const attempt = async () => {
    const head = await fetchTreeShas(pat, owner, repo, branch);
    const plan = planSync({ entries, photos, repoShas: head.shas, liveRefs, config });
    if (plan.conflicts.length > 0) throw new SyncConflictError(plan.conflicts);
    const uploads: TreeChange[] = await Promise.all(
      plan.photoUploads.map(async p => ({ path: p.path, content: await blobToBase64(p.blob), encoding: 'base64' as const })),
    );
    const commitSha = await commitChanges(pat, owner, repo, branch, head.commitSha, [...plan.changes, ...uploads], plan.message);
    return { commitSha, plan };
  };

  let result;
  try {
    result = await attempt();
  } catch (err) {
    if (!(err instanceof RefMovedError)) throw err;
    result = await attempt();
  }

  // An entry edited while Sync ran is newer than what went out: keep it, now based on the synced file
  const synced = new Map(entries.map(e => [e.key, e]));
  const kept = [];
  for (const key of result.plan.syncedKeys) {
    const current = await getEntry(key);
    if (current && current.updatedAt !== synced.get(key)?.updatedAt) kept.push(current);
    else await removeEntry(key);
  }
  if (kept.length > 0) {
    const { shas } = await fetchTreeShas(pat, owner, repo, branch);
    for (const entry of kept) {
      const sent = synced.get(entry.key)!;
      const fields = scopeFor(sent, config).fields;
      await saveEntry({
        ...entry,
        baseSha: sent.state === 'deleted' ? null : shas.get(entry.path) ?? null,
        livePhotos: sent.state === 'deleted' ? [] : referencedPhotos(sent.data, sent.body, fields),
      });
    }
  }
  for (const photo of result.plan.photoUploads) await removePhoto(projectId, photo.url);

  // The commit already landed; a failure here must not make the Sync look failed
  if (config.deployWorkflow) {
    try {
      const deploy = await fetchDeployInfo(pat, owner, repo, config.deployWorkflow);
      if (deploy.exists && deploy.active && !deploy.runsOnPush) {
        await dispatchDeploy(pat, owner, repo, config.deployWorkflow, branch);
      }
    } catch (err) {
      console.warn('Could not check or start the deploy:', err);
    }
  }
  return { commitSha: result.commitSha };
}
