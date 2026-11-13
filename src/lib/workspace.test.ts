import { describe, it, expect, beforeEach } from 'vitest';
import { clear, createStore } from 'idb-keyval';
import type { LocalEntry } from '../types';
import {
  entryKey, getEntry, listEntries, removeEntry, saveEntry,
  getPhoto, listPhotos, removePhoto, savePhoto,
} from './workspace';

const entry = (projectId: string, path: string): LocalEntry => ({
  key: entryKey(projectId, path),
  projectId,
  kind: 'post',
  scope: 'Įrašai',
  path,
  slug: 'medus',
  state: 'draft',
  baseSha: null,
  livePhotos: [],
  data: { title: 'Medus' },
  body: 'Tekstas',
  updatedAt: 1,
});

beforeEach(async () => {
  await clear(createStore('marksman-entries', 'entries'));
  await clear(createStore('marksman-photos', 'photos'));
});

describe('entries', () => {
  it('saves and reads back an entry', async () => {
    const e = entry('a', 'posts/medus.md');
    await saveEntry(e);
    expect(await getEntry(e.key)).toEqual(e);
  });

  it('lists only the given project', async () => {
    await saveEntry(entry('a', 'posts/one.md'));
    await saveEntry(entry('b', 'posts/two.md'));
    expect((await listEntries('a')).map(e => e.path)).toEqual(['posts/one.md']);
  });

  it('removes an entry', async () => {
    const e = entry('a', 'posts/medus.md');
    await saveEntry(e);
    await removeEntry(e.key);
    expect(await getEntry(e.key)).toBeUndefined();
  });
});

describe('photos', () => {
  it('saves a photo blob and reads it back', async () => {
    const blob = new Blob(['x'.repeat(500)], { type: 'image/jpeg' });
    await savePhoto({ key: '', projectId: 'a', url: '/images/a.jpg', path: 'public/images/a.jpg', blob });
    const photo = await getPhoto('a', '/images/a.jpg');
    expect(photo?.path).toBe('public/images/a.jpg');
    expect(photo?.blob.size).toBe(500);
  });

  it('lists and removes photos per project', async () => {
    const blob = new Blob(['x']);
    await savePhoto({ key: '', projectId: 'a', url: '/images/a.jpg', path: 'p/a.jpg', blob });
    await savePhoto({ key: '', projectId: 'b', url: '/images/b.jpg', path: 'p/b.jpg', blob });
    expect((await listPhotos('a')).map(p => p.url)).toEqual(['/images/a.jpg']);
    await removePhoto('a', '/images/a.jpg');
    expect(await listPhotos('a')).toEqual([]);
  });
});
