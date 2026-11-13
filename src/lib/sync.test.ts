import { describe, it, expect, vi, beforeEach } from 'vitest';
import { clear, createStore } from 'idb-keyval';
import type { CmsConfig, LocalEntry, LocalPhoto } from '../types';
import { planSync, runSync, SyncConflictError } from './sync';
import * as github from './github';
import { entryKey, listEntries, listPhotos, saveEntry, savePhoto } from './workspace';

vi.mock('./github', async importOriginal => {
  const actual = await importOriginal<typeof import('./github')>();
  return {
    ...actual,
    fetchTreeShas: vi.fn(),
    commitChanges: vi.fn(),
    fetchDeployInfo: vi.fn(),
    dispatchDeploy: vi.fn(),
    listFiles: vi.fn().mockResolvedValue([]),
    fetchFile: vi.fn(),
  };
});

const config: CmsConfig = {
  deployWorkflow: 'main.yml',
  collections: [{
    name: 'Įrašai',
    folder: 'app/_data/_blog',
    imageFolder: 'public/images',
    imageUrlPrefix: '/images',
    fields: [
      { name: 'title', type: 'text' },
      { name: 'photos', type: 'gallery' },
      { name: 'body', type: 'markdown' },
    ],
  }],
};

const entry = (over: Partial<LocalEntry>): LocalEntry => ({
  key: entryKey('p', over.path ?? 'app/_data/_blog/medus.md'),
  projectId: 'p',
  kind: 'post',
  scope: 'Įrašai',
  path: 'app/_data/_blog/medus.md',
  slug: 'medus',
  state: 'submitted',
  baseSha: null,
  livePhotos: [],
  data: { title: 'Medus', photos: [] },
  body: 'Tekstas',
  updatedAt: 1,
  ...over,
});

const photo = (url: string): LocalPhoto => ({
  key: '', projectId: 'p', url, path: `public/images/${url.split('/').pop()}`, blob: new Blob(['jpg'], { type: 'image/jpeg' }),
});

const plan = (entries: LocalEntry[], opts: { photos?: LocalPhoto[]; repo?: [string, string][]; refs?: [string, string[]][] } = {}) =>
  planSync({
    entries,
    photos: opts.photos ?? [],
    repoShas: new Map(opts.repo ?? []),
    liveRefs: new Map(opts.refs ?? []),
    config,
  });

describe('planSync', () => {
  it('publishes a new post with its local photos', () => {
    const e = entry({ data: { title: 'Medus', photos: ['/images/a.jpg', '/images/b.jpg'] } });
    const result = plan([e], { photos: [photo('/images/a.jpg'), photo('/images/b.jpg')] });
    expect(result.conflicts).toEqual([]);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ path: 'app/_data/_blog/medus.md', encoding: 'utf-8' });
    expect(result.photoUploads.map(p => p.path)).toEqual(['public/images/a.jpg', 'public/images/b.jpg']);
    expect(result.message).toBe('cms: publish "Medus"');
    expect(result.syncedKeys).toEqual([e.key]);
  });

  it('leaves drafts behind', () => {
    const result = plan([entry({ state: 'draft' })]);
    expect(result.changes).toEqual([]);
    expect(result.syncedKeys).toEqual([]);
  });

  it('reports a conflict when the file changed on GitHub', () => {
    const result = plan([entry({ baseSha: 'abc' })], { repo: [['app/_data/_blog/medus.md', 'def']] });
    expect(result.conflicts).toEqual([{ key: entryKey('p', 'app/_data/_blog/medus.md'), title: 'Medus', reason: 'changed' }]);
    expect(result.changes).toEqual([]);
  });

  it('reports a conflict when a new post path already exists', () => {
    const result = plan([entry({})], { repo: [['app/_data/_blog/medus.md', 'x']] });
    expect(result.conflicts[0].reason).toBe('exists');
  });

  it('keeps a removed photo that another post still uses', () => {
    const e = entry({ baseSha: 's', livePhotos: ['/images/x.jpg'], data: { title: 'Medus', photos: [] } });
    const result = plan([e], {
      repo: [['app/_data/_blog/medus.md', 's'], ['public/images/x.jpg', 'px']],
      refs: [['app/_data/_blog/other.md', ['/images/x.jpg']]],
    });
    expect(result.changes.some(c => c.path === 'public/images/x.jpg')).toBe(false);
    expect(result.message).toBe('cms: update "Medus"');
  });

  it('deletes a removed photo nothing else uses', () => {
    const e = entry({ baseSha: 's', livePhotos: ['/images/y.jpg'], data: { title: 'Medus', photos: [] } });
    const result = plan([e], { repo: [['app/_data/_blog/medus.md', 's'], ['public/images/y.jpg', 'py']] });
    expect(result.changes).toContainEqual({ path: 'public/images/y.jpg', delete: true });
  });

  it('deletes a post and its unused photos', () => {
    const e = entry({ state: 'deleted', baseSha: 's', livePhotos: ['/images/y.jpg'], data: { title: 'Senas' } });
    const result = plan([e], { repo: [['app/_data/_blog/medus.md', 's'], ['public/images/y.jpg', 'py']] });
    expect(result.changes).toEqual([
      { path: 'app/_data/_blog/medus.md', delete: true },
      { path: 'public/images/y.jpg', delete: true },
    ]);
    expect(result.message).toBe('cms: delete "Senas"');
  });

  it('summarises several changes in one message', () => {
    const result = plan([
      entry({ path: 'app/_data/_blog/a.md', data: { title: 'A' } }),
      entry({ path: 'app/_data/_blog/b.md', baseSha: 'sb', data: { title: 'B' } }),
    ], { repo: [['app/_data/_blog/b.md', 'sb']] });
    expect(result.message).toBe('cms: publish "A", update "B"');
  });
});

describe('runSync', () => {
  const deps = { pat: 't', owner: 'o', repo: 'r', branch: 'master', projectId: 'p', config };

  beforeEach(async () => {
    vi.clearAllMocks();
    await clear(createStore('marksman-entries', 'entries'));
    await clear(createStore('marksman-photos', 'photos'));
    vi.mocked(github.fetchTreeShas).mockResolvedValue({ commitSha: 'h1', treeSha: 't1', shas: new Map() });
    vi.mocked(github.fetchDeployInfo).mockResolvedValue({ exists: true, active: true, runsOnPush: true });
  });

  it('retries once when the branch moved, then clears synced work', async () => {
    await saveEntry(entry({ data: { title: 'Medus', photos: ['/images/a.jpg'] } }));
    await savePhoto(photo('/images/a.jpg'));
    vi.mocked(github.commitChanges).mockRejectedValueOnce(new github.RefMovedError()).mockResolvedValueOnce('c2');
    expect(await runSync(deps)).toEqual({ commitSha: 'c2' });
    expect(github.commitChanges).toHaveBeenCalledTimes(2);
    const changes = vi.mocked(github.commitChanges).mock.calls[1][5];
    expect(changes).toContainEqual({ path: 'public/images/a.jpg', content: btoa('jpg'), encoding: 'base64' });
    expect(await listEntries('p')).toEqual([]);
    expect(await listPhotos('p')).toEqual([]);
  });

  it('keeps all local work when the commit fails', async () => {
    await saveEntry(entry({}));
    vi.mocked(github.commitChanges).mockRejectedValue(new Error('network'));
    await expect(runSync(deps)).rejects.toThrow('network');
    expect(await listEntries('p')).toHaveLength(1);
  });

  it('throws conflicts without committing', async () => {
    await saveEntry(entry({}));
    vi.mocked(github.fetchTreeShas).mockResolvedValue({ commitSha: 'h1', treeSha: 't1', shas: new Map([['app/_data/_blog/medus.md', 'x']]) });
    await expect(runSync(deps)).rejects.toBeInstanceOf(SyncConflictError);
    expect(github.commitChanges).not.toHaveBeenCalled();
  });

  it.each([
    [{ exists: true, active: true, runsOnPush: true }, 0],
    [{ exists: true, active: true, runsOnPush: false }, 1],
    [{ exists: true, active: false, runsOnPush: false }, 0],
    [{ exists: false, active: false, runsOnPush: false }, 0],
  ])('dispatches the deploy only when the push will not (%o)', async (info, calls) => {
    await saveEntry(entry({}));
    vi.mocked(github.commitChanges).mockResolvedValue('c1');
    vi.mocked(github.fetchDeployInfo).mockResolvedValue(info);
    await runSync(deps);
    expect(github.dispatchDeploy).toHaveBeenCalledTimes(calls);
  });

  it('still reports success when checking the deploy fails after the commit', async () => {
    await saveEntry(entry({}));
    vi.mocked(github.commitChanges).mockResolvedValue('c1');
    vi.mocked(github.fetchDeployInfo).mockRejectedValue(new Error('network'));
    expect(await runSync(deps)).toEqual({ commitSha: 'c1' });
  });

  it('keeps drafts after syncing', async () => {
    await saveEntry(entry({ path: 'app/_data/_blog/draft.md', state: 'draft' }));
    await saveEntry(entry({}));
    vi.mocked(github.commitChanges).mockResolvedValue('c1');
    await runSync(deps);
    expect((await listEntries('p')).map(e => e.state)).toEqual(['draft']);
  });
});
