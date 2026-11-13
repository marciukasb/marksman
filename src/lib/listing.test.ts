import { describe, it, expect } from 'vitest';
import type { LocalEntry } from '../types';
import { mergeListing } from './listing';

const entry = (path: string, state: LocalEntry['state'], title: string, date = '2026-11-10'): LocalEntry => ({
  key: `p:${path}`, projectId: 'p', kind: 'post', scope: 'Įrašai', path, slug: path.split('/').pop()!.replace('.md', ''),
  state, baseSha: null, livePhotos: [], data: { title, date }, body: '', updatedAt: 1,
});

const live = [
  { path: 'b/old.md', title: 'Senas', date: '2025-05-01' },
  { path: 'b/edited.md', title: 'Prieš', date: '2026-01-01' },
];

describe('mergeListing', () => {
  it('labels untouched posts as Live', () => {
    expect(mergeListing(live, []).map(r => r.label)).toEqual(['Live', 'Live']);
  });

  it('shows a submitted edit with its new title as Waiting to sync', () => {
    const rows = mergeListing(live, [entry('b/edited.md', 'submitted', 'Po', '2026-01-01')]);
    expect(rows.find(r => r.path === 'b/edited.md')).toMatchObject({ label: 'Waiting to sync', title: 'Po', entryKey: 'p:b/edited.md' });
  });

  it('includes new local posts', () => {
    const rows = mergeListing(live, [entry('b/new.md', 'submitted', 'Naujas'), entry('b/draft.md', 'draft', 'Juodraštis', '2026-11-11')]);
    expect(rows.map(r => [r.title, r.label])).toEqual([
      ['Juodraštis', 'Draft'],
      ['Naujas', 'Waiting to sync'],
      ['Prieš', 'Live'],
      ['Senas', 'Live'],
    ]);
  });

  it('marks a live post that will be deleted', () => {
    const rows = mergeListing(live, [entry('b/old.md', 'deleted', 'Senas', '2025-05-01')]);
    expect(rows.find(r => r.path === 'b/old.md')?.label).toBe('Will be deleted');
  });

  it('sorts undated posts last', () => {
    const rows = mergeListing([{ path: 'b/x.md', title: 'Be datos', date: '' }, ...live], []);
    expect(rows[rows.length - 1].title).toBe('Be datos');
  });
});
