import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getProjects, saveProject, deleteProject } from '../lib/storage';
import { fetchConfig } from '../lib/github';
import { useProject } from '../context/ProjectContext';
import Button from '../components/ui/Button';
import type { Project } from '../types';
import styles from './ProjectsPage.module.scss';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>(getProjects);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: '', owner: '', repo: '', pat: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { setProject } = useProject();
  const navigate = useNavigate();

  async function handleOpen(project: Project) {
    setLoading(true);
    setError('');
    try {
      const config = await fetchConfig(project.pat, project.owner, project.repo);
      setProject(project, config);
      navigate(`/${project.owner}/${project.repo}`);
    } catch {
      setError(`Could not load .cms.json from ${project.owner}/${project.repo}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const project: Project = { id: generateId(), ...form };
    try {
      await fetchConfig(project.pat, project.owner, project.repo);
      saveProject(project);
      setProjects(getProjects());
      setShowForm(false);
      setForm({ label: '', owner: '', repo: '', pat: '' });
    } catch {
      setError('Could not connect. Check the repo name, PAT, and that .cms.json exists.');
    }
  }

  function handleDelete(id: string) {
    deleteProject(id);
    setProjects(getProjects());
  }

  return (
    <div className={styles.page}>
      {error && <p className={styles.error}>{error}</p>}

      <ul className={styles.list}>
        {projects.map(p => (
          <li key={p.id} className={styles.item}>
            <button className={styles.itemLabel} onClick={() => handleOpen(p)} disabled={loading}>
              <span>{p.label}</span>
              <span className={styles.itemRepo}>{p.owner}/{p.repo}</span>
            </button>
            <Button variant="danger" onClick={() => handleDelete(p.id)}>Remove</Button>
          </li>
        ))}
      </ul>

      {showForm ? (
        <form className={styles.form} onSubmit={handleAdd}>
          <h2>Add project</h2>
          <input required placeholder="Label" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
          <input required placeholder="Owner (e.g. marciukasb)" value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} />
          <input required placeholder="Repo (e.g. EmberInstruments)" value={form.repo} onChange={e => setForm(f => ({ ...f, repo: e.target.value }))} />
          <input required type="password" placeholder="GitHub PAT" value={form.pat} onChange={e => setForm(f => ({ ...f, pat: e.target.value }))} />
          <div className={styles.formActions}>
            <Button type="submit">Connect</Button>
            <Button variant="secondary" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button variant="secondary" onClick={() => setShowForm(true)}>+ Add project</Button>
      )}
    </div>
  );
}
