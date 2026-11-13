import type { LocalEntry } from '../types';

export type ListingLabel = 'Live' | 'Draft' | 'Waiting to sync' | 'Will be deleted';

export interface ListingRow {
  path: string;
  title: string;
  date: string;
  label: ListingLabel;
  entryKey: string | null;
  isLive: boolean;
}

const LABELS: Record<LocalEntry['state'], ListingLabel> = {
  draft: 'Draft',
  submitted: 'Waiting to sync',
  deleted: 'Will be deleted',
};

// Live posts from GitHub merged with this browser's unsynced entries, newest first
export function mergeListing(live: { path: string; title: string; date: string }[], entries: LocalEntry[]): ListingRow[] {
  const byPath = new Map(entries.map(e => [e.path, e]));
  const rows: ListingRow[] = live.map(post => {
    const entry = byPath.get(post.path);
    if (!entry) return { ...post, label: 'Live', entryKey: null, isLive: true };
    const local = entry.state !== 'deleted';
    return {
      path: post.path,
      title: local ? String(entry.data.title ?? '') || post.title : post.title,
      date: local ? String(entry.data.date ?? '') : post.date,
      label: LABELS[entry.state],
      entryKey: entry.key,
      isLive: true,
    };
  });
  const livePaths = new Set(live.map(p => p.path));
  for (const entry of entries) {
    if (livePaths.has(entry.path) || entry.state === 'deleted') continue;
    rows.push({
      path: entry.path,
      title: String(entry.data.title ?? '') || entry.slug || entry.path,
      date: String(entry.data.date ?? ''),
      label: LABELS[entry.state],
      entryKey: entry.key,
      isLive: false,
    });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
