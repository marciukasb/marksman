import { useState } from 'react';
import { Outlet, useNavigate, useLocation, useMatch } from 'react-router-dom';
import { useProject } from '../../context/ProjectContext';
import { openProject } from '../../lib/github';
import { describeOpenError } from '../../lib/config';
import { getProjects, saveProject } from '../../lib/storage';
import SyncBar from '../sync/SyncBar';
import type { Project } from '../../types';
import styles from './Layout.module.scss';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function usePageTitle() {
  const { project, activeCollection } = useProject();
  const matchSingle = useMatch('/:owner/:repo/single/:single');
  const matchNew = useMatch('/:owner/:repo/:collection/new');
  const matchEdit = useMatch('/:owner/:repo/:collection/edit/:slug');
  const matchList = useMatch('/:owner/:repo/:collection');
  const matchProject = useMatch('/:owner/:repo');
  const matchRoot = useMatch('/');

  if (matchRoot) return 'Projects';
  if (matchSingle) return decodeURIComponent(matchSingle.params.single ?? '');
  if (matchNew) return 'New post';
  if (matchEdit) return 'Edit post';
  if (matchList) return activeCollection?.name ?? decodeURIComponent(matchList.params.collection ?? '');
  if (matchProject) return project?.label ?? '';
  return '';
}

export default function Layout() {
  const { project, config, activeCollection, setActiveCollection, setProject } = useProject();
  const navigate = useNavigate();
  const location = useLocation();
  const pageTitle = usePageTitle();
  // Sync never appears while writing: finishing a post is Submit or Save draft
  const inEditor = /\/(new|edit\/[^/]+|single\/[^/]+)$/.test(location.pathname);

  const [projects, setProjects] = useState<Project[]>(getProjects);
  const [addingProject, setAddingProject] = useState(false);
  const [form, setForm] = useState({ label: '', owner: '', repo: '', pat: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  const showSidebar = !!project;

  async function handleSwitchProject(p: Project) {
    const { config: cfg, repoInfo } = await openProject(p.pat, p.owner, p.repo);
    setProject(p, cfg, repoInfo);
    navigate(`/${p.owner}/${p.repo}`);
  }

  async function handleAddProject(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    setAddError('');
    const newProject: Project = { id: generateId(), ...form };
    try {
      const { config: cfg, repoInfo } = await openProject(newProject.pat, newProject.owner, newProject.repo);
      saveProject(newProject);
      setProjects(getProjects());
      setProject(newProject, cfg, repoInfo);
      setAddingProject(false);
      setForm({ label: '', owner: '', repo: '', pat: '' });
      navigate(`/${newProject.owner}/${newProject.repo}`);
    } catch (err) {
      setAddError(describeOpenError(err));
    } finally {
      setAddLoading(false);
    }
  }

  function handleNavItem(index: number) {
    const col = config!.collections[index];
    setActiveCollection(col);
    navigate(`/${project!.owner}/${project!.repo}/${encodeURIComponent(col.name)}`);
  }

  return (
    <div className={styles.shell}>
      {showSidebar && (
        <aside className={styles.sidebar}>
          <div className={styles.brand}>Marksman</div>
          <nav className={styles.nav}>
            {config?.collections.map((col, i) => {
              const isActive = activeCollection?.name === col.name &&
                location.pathname.includes(encodeURIComponent(col.name));
              return (
                <button
                  key={col.name}
                  className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                  onClick={() => handleNavItem(i)}
                >
                  {col.name}
                </button>
              );
            })}
            {config?.singles?.map(single => {
              const href = `/${project!.owner}/${project!.repo}/single/${encodeURIComponent(single.name)}`;
              return (
                <button
                  key={single.name}
                  className={`${styles.navItem} ${location.pathname === href ? styles.navItemActive : ''}`}
                  onClick={() => navigate(href)}
                >
                  {single.name}
                </button>
              );
            })}
          </nav>

          <div className={styles.sidebarSection}>
            <span className={styles.sectionLabel}>Projects</span>
            {projects.map(p => (
              <button
                key={p.id}
                className={`${styles.navItem} ${p.id === project?.id ? styles.navItemActive : ''}`}
                onClick={() => p.id !== project?.id && handleSwitchProject(p)}
              >
                {p.label}
              </button>
            ))}

            {addingProject ? (
              <form className={styles.addForm} onSubmit={handleAddProject}>
                <input required placeholder="Label" value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
                <input required placeholder="Owner" value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} />
                <input required placeholder="Repo" value={form.repo} onChange={e => setForm(f => ({ ...f, repo: e.target.value }))} />
                <input required type="password" placeholder="PAT" value={form.pat} onChange={e => setForm(f => ({ ...f, pat: e.target.value }))} />
                {addError && <span className={styles.addError}>{addError}</span>}
                <div className={styles.addActions}>
                  <button type="submit" className={styles.addSubmit} disabled={addLoading}>{addLoading ? 'Connecting…' : 'Connect'}</button>
                  <button type="button" className={styles.addCancel} onClick={() => { setAddingProject(false); setAddError(''); }}>Cancel</button>
                </div>
              </form>
            ) : (
              <button className={styles.addProjectBtn} onClick={() => setAddingProject(true)}>+ Add project</button>
            )}
          </div>
        </aside>
      )}
      <div className={`${styles.main} ${showSidebar ? styles.mainWithSidebar : ''}`}>
        <header className={styles.topNav}>
          <span className={styles.pageTitle}>{pageTitle}</span>
          <div className={styles.topNavRight}>
            {showSidebar && !inEditor && <SyncBar />}
          </div>
        </header>
        <div className={styles.content}><Outlet /></div>
      </div>
    </div>
  );
}
