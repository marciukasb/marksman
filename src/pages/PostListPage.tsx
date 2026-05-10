import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { listFiles, fetchFile, deleteFile } from '../lib/github';
import { parsePost } from '../lib/frontmatter';
import Button from '../components/ui/Button';
import Loader from '../components/ui/Loader';
import type { PostFile } from '../types';
import styles from './PostListPage.module.scss';

interface PostEntry {
  file: PostFile;
  title: string;
  date: string;
}

export default function PostListPage() {
  const { project, activeCollection } = useProject();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<PostEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!project || !activeCollection) { navigate('/'); return; }
    loadPosts();
  }, []);

  async function loadPosts() {
    setLoading(true);
    try {
      const files = await listFiles(project!.pat, project!.owner, project!.repo, activeCollection!.folder);
      const results = await Promise.allSettled(
        files.map(async file => {
          const { content } = await fetchFile(project!.pat, project!.owner, project!.repo, file.path);
          const { data } = parsePost(content);
          return { file, title: data.title ?? file.name, date: data.date ?? '' };
        })
      );
      const entries = results
        .filter((r): r is PromiseFulfilledResult<PostEntry> => r.status === 'fulfilled')
        .map(r => r.value);
      setPosts(entries.sort((a, b) => b.date.localeCompare(a.date)));
    } catch (err) {
      console.error('Failed to load posts:', err);
      setError('Failed to load posts.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(entry: PostEntry) {
    if (!confirm(`Delete "${entry.title}"?`)) return;
    try {
      await deleteFile(project!.pat, project!.owner, project!.repo, entry.file.path, entry.file.sha);
      setPosts(p => p.filter(x => x.file.path !== entry.file.path));
    } catch {
      setError('Failed to delete post.');
    }
  }

  function handleEdit(entry: PostEntry) {
    const slug = entry.file.name.replace(/\.md$/, '');
    navigate(`/${project!.owner}/${project!.repo}/${encodeURIComponent(activeCollection!.name)}/edit/${slug}`);
  }

  if (!project || !activeCollection) return null;

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate(`/${project.owner}/${project.repo}`)}>← {project.label}</button>
      <div className={styles.header}>
        <h1 className={styles.title}>{activeCollection.name}</h1>
        <Button onClick={() => navigate(`/${project.owner}/${project.repo}/${encodeURIComponent(activeCollection.name)}/new`)}>
          + New post
        </Button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {loading ? <Loader /> : (
        <ul className={styles.list}>
          {posts.map(entry => (
            <li key={entry.file.path} className={styles.item}>
              <div className={styles.itemInfo}>
                <span className={styles.itemTitle}>{entry.title}</span>
                <span className={styles.itemDate}>{entry.date}</span>
              </div>
              <div className={styles.itemActions}>
                <Button variant="secondary" onClick={() => handleEdit(entry)}>Edit</Button>
                <Button variant="danger" onClick={() => handleDelete(entry)}>Delete</Button>
              </div>
            </li>
          ))}
          {posts.length === 0 && <p className={styles.empty}>No posts yet.</p>}
        </ul>
      )}
    </div>
  );
}
