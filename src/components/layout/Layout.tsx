import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation, useMatch } from 'react-router-dom';
import { useProject } from '../../context/ProjectContext';
import { triggerDeploy, fetchSyncStatus, fetchConfig, type SyncStatus } from '../../lib/github';
import { getProjects, saveProject } from '../../lib/storage';
import type { Project } from '../../types';
import styles from './Layout.module.scss';

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function usePageTitle() {
  const { project, activeCollection } = useProject();
  const matchNew = useMatch('/:owner/:repo/:collection/new');
  const matchEdit = useMatch('/:owner/:repo/:collection/edit/:slug');
  const matchList = useMatch('/:owner/:repo/:collection');
  const matchProject = useMatch('/:owner/:repo');
  const matchRoot = useMatch('/');

  if (matchRoot) return 'Projects';
  if (matchNew) return 'New post';
  if (matchEdit) return 'Edit post';
  if (matchList) return activeCollection?.name ?? decodeURIComponent(matchList.params.collection ?? '');
  if (matchProject) return project?.label ?? '';
  return '';
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { project, config, activeCollection, setActiveCollection, setProject } = useProject();
  const navigate = useNavigate();
  const location = useLocation();
  const pageTitle = usePageTitle();

  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState('');
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('unknown');
  const syncTriggeredAt = useRef<number | null>(null);

  const [projects, setProjects] = useState<Project[]>(getProjects);
  const [addingProject, setAddingProject] = useState(false);
  const [form, setForm] = useState({ label: '', owner: '', repo: '', pat: '' });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  const showSidebar = !!project;

  const refreshStatus = useCallback(async () => {
    if (!project || !config?.deployWorkflow) return;
    try {
      const status = await fetchSyncStatus(project.pat, project.owner, project.repo, config.deployWorkflow);
      // If we recently triggered a sync and the API hasn't registered the run yet,
      // hold amber for up to 10 minutes rather than flashing red
      if (status === 'unsynced' && syncTriggeredAt.current !== null) {
        const elapsed = Date.now() - syncTriggeredAt.current;
        if (elapsed < 10 * 60 * 1000) {
          setSyncStatus('in_progress');
          return;
        }
        syncTriggeredAt.current = null;
      }
      if (status === 'synced' || status === 'in_progress') {
        syncTriggeredAt.current = null;
      }
      setSyncStatus(status);
    } catch {
      setSyncStatus('unknown');
    }
  }, [project, config?.deployWorkflow]);

  useEffect(() => {
    if (!project || !config?.deployWorkflow) return;
    refreshStatus();
    const interval = setInterval(refreshStatus, 20_000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  async function handleDeploy() {
    if (!config?.deployWorkflow) {
      setDeployMsg('Add "deployWorkflow" to .cms.json to enable sync.');
      setTimeout(() => setDeployMsg(''), 5000);
      return;
    }
    setDeploying(true);
    setDeployMsg('');
    setSyncStatus('in_progress');
    syncTriggeredAt.current = Date.now();
    try {
      await triggerDeploy(project!.pat, project!.owner, project!.repo, config.deployWorkflow);
      setDeployMsg('Sync triggered.');
      setTimeout(() => setDeployMsg(''), 3000);
      setTimeout(refreshStatus, 5000);
    } catch {
      setDeployMsg('Failed — check PAT has workflow permissions.');
      setTimeout(() => setDeployMsg(''), 5000);
      setSyncStatus('unknown');
    } finally {
      setDeploying(false);
    }
  }

  async function handleSwitchProject(p: Project) {
    const cfg = await fetchConfig(p.pat, p.owner, p.repo);
    setProject(p, cfg);
    navigate(`/${p.owner}/${p.repo}`);
  }

  async function handleAddProject(e: React.FormEvent) {
    e.preventDefault();
    setAddLoading(true);
    setAddError('');
    const newProject: Project = { id: generateId(), ...form };
    try {
      const cfg = await fetchConfig(newProject.pat, newProject.owner, newProject.repo);
      saveProject(newProject);
      setProjects(getProjects());
      setProject(newProject, cfg);
      setAddingProject(false);
      setForm({ label: '', owner: '', repo: '', pat: '' });
      navigate(`/${newProject.owner}/${newProject.repo}`);
    } catch {
      setAddError('Could not connect. Check repo name, PAT, and that .cms.json exists.');
    } finally {
      setAddLoading(false);
    }
  }

  function handleNavItem(_colName: string, index: number) {
    const col = config!.collections[index];
    setActiveCollection(col);
    navigate(`/${project!.owner}/${project!.repo}/${encodeURIComponent(col.name)}`);
  }

  const dotClass = {
    synced: styles.dotSynced,
    unsynced: styles.dotUnsynced,
    in_progress: styles.dotInProgress,
    unknown: styles.dotUnknown,
  }[syncStatus];

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
                  onClick={() => handleNavItem(col.name, i)}
                >
                  {col.name}
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
            {deployMsg && <span className={styles.deployMsg}>{deployMsg}</span>}
            {showSidebar && (
              <div className={styles.syncWrap}>
                <span className={`${styles.dot} ${dotClass}`} />
                <button className={styles.deployBtn} onClick={handleDeploy} disabled={deploying}>
                  {deploying ? 'Syncing…' : 'Sync'}
                </button>
              </div>
            )}
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
