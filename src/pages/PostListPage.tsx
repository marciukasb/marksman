import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { useWorkspace } from '../context/WorkspaceContext';
import { listFiles, fetchFile } from '../lib/github';
import { parsePost } from '../lib/frontmatter';
import { referencedPhotos } from '../lib/photos';
import { mergeListing, type ListingRow } from '../lib/listing';
import { entryKey, removeEntry, removePhoto, saveEntry } from '../lib/workspace';
import Button from '../components/ui/Button';
import Loader from '../components/ui/Loader';
import styles from './PostListPage.module.scss';

interface LivePost {
  path: string;
  sha: string;
  title: string;
  date: string;
  photos: string[];
}

export default function PostListPage() {
  const { project, repoInfo, activeCollection } = useProject();
  const { entries, refresh, syncCount } = useWorkspace();
  const navigate = useNavigate();
  const [live, setLive] = useState<LivePost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // syncCount is a dependency so the list reloads from GitHub after every Sync
  const loadPosts = useCallback(async () => {
    if (!project || !repoInfo || !activeCollection) return;
    setLoading(true);
    setError('');
    try {
      const files = await listFiles(project.pat, project.owner, project.repo, activeCollection.folder);
      const results = await Promise.allSettled(files.map(async file => {
        const { content } = await fetchFile(project.pat, project.owner, project.repo, file.path, repoInfo.defaultBranch);
        const { data, body } = parsePost(content);
        return {
          path: file.path,
          sha: file.sha,
          title: String(data.title ?? '') || file.name,
          date: String(data.date ?? ''),
          photos: referencedPhotos(data, body, activeCollection.fields),
        };
      }));
      setLive(results.filter((r): r is PromiseFulfilledResult<LivePost> => r.status === 'fulfilled').map(r => r.value));
    } catch {
      setError('Failed to load posts from GitHub.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, repoInfo, activeCollection, syncCount]);

  useEffect(() => {
    if (!project || !activeCollection) navigate('/');
    else loadPosts();
  }, [project, activeCollection, navigate, loadPosts]);

  if (!project || !activeCollection) return null;

  const scoped = entries.filter(e => e.kind === 'post' && e.scope === activeCollection.name);
  const rows = mergeListing(live, scoped);
  const base = `/${project.owner}/${project.repo}/${encodeURIComponent(activeCollection.name)}`;
  const slugOf = (row: ListingRow) => row.path.split('/').pop()!.replace(/\.md$/, '');

  async function markDeleted(row: ListingRow) {
    if (!confirm(`Delete "${row.title}"? It will be removed from the site at the next Sync.`)) return;
    const post = live.find(p => p.path === row.path)!;
    const existing = scoped.find(e => e.path === row.path);
    await saveEntry({
      key: entryKey(project!.id, row.path),
      projectId: project!.id,
      kind: 'post',
      scope: activeCollection!.name,
      path: row.path,
      slug: slugOf(row),
      state: 'deleted',
      baseSha: existing?.baseSha ?? post.sha,
      livePhotos: existing?.livePhotos ?? post.photos,
      data: existing?.data ?? { title: post.title },
      body: existing?.body ?? '',
      updatedAt: Date.now(),
    });
    await refresh();
  }

  // Drops this browser's version: an unsynced new post disappears, a live post goes back to what's on GitHub
  async function discard(row: ListingRow, question: string | null) {
    if (question && !confirm(question)) return;
    const entry = scoped.find(e => e.key === row.entryKey);
    if (!entry) return;
    await removeEntry(entry.key);
    const stillUsed = new Set(
      scoped.filter(e => e.key !== entry.key).flatMap(e => referencedPhotos(e.data, e.body, activeCollection!.fields)),
    );
    for (const url of referencedPhotos(entry.data, entry.body, activeCollection!.fields)) {
      if (!stillUsed.has(url) && !entry.livePhotos.includes(url)) await removePhoto(project!.id, url);
    }
    await refresh();
  }

  function actions(row: ListingRow) {
    if (row.label === 'Will be deleted') {
      return <Button variant="secondary" onClick={() => discard(row, null)}>Undo</Button>;
    }
    const edit = <Button variant="secondary" onClick={() => navigate(`${base}/edit/${slugOf(row)}`)}>Edit</Button>;
    if (!row.isLive) {
      return <>{edit}<Button variant="danger" onClick={() => discard(row, `Delete "${row.title}"? It was never synced and can't be recovered.`)}>Delete</Button></>;
    }
    return (
      <>
        {edit}
        {row.entryKey && (
          <Button variant="secondary" onClick={() => discard(row, `Discard your unsynced changes to "${row.title}"?`)}>Discard changes</Button>
        )}
        <Button variant="danger" onClick={() => markDeleted(row)}>Delete</Button>
      </>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Button onClick={() => navigate(`${base}/new`)}>+ New post</Button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {loading ? <Loader /> : (
        <ul className={styles.list}>
          {rows.map(row => (
            <li key={row.path} className={styles.item}>
              <div className={styles.itemInfo}>
                <span className={styles.itemTitle}>{row.title}</span>
                <span className={styles.itemDate}>
                  <span className={`${styles.label} ${styles[row.label.replace(/ /g, '')]}`}>{row.label}</span>
                  {row.date}
                </span>
              </div>
              <div className={styles.itemActions}>{actions(row)}</div>
            </li>
          ))}
          {rows.length === 0 && <p className={styles.empty}>No posts yet.</p>}
        </ul>
      )}
    </div>
  );
}
