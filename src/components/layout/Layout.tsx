import { useState } from 'react';
import { useNavigate, useLocation, useMatch } from 'react-router-dom';
import { useProject } from '../../context/ProjectContext';
import { triggerDeploy } from '../../lib/github';
import styles from './Layout.module.scss';

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
  const { project, config, activeCollection, setActiveCollection, clearProject } = useProject();
  const navigate = useNavigate();
  const location = useLocation();
  const pageTitle = usePageTitle();
  const [deploying, setDeploying] = useState(false);
  const [deployMsg, setDeployMsg] = useState('');

  const showSidebar = !!project;

  async function handleDeploy() {
    if (!config?.deployWorkflow) {
      setDeployMsg('Add "deployWorkflow" to .cms.json to enable sync.');
      setTimeout(() => setDeployMsg(''), 5000);
      return;
    }
    setDeploying(true);
    setDeployMsg('');
    try {
      await triggerDeploy(project!.pat, project!.owner, project!.repo, config.deployWorkflow);
      setDeployMsg('Sync triggered.');
      setTimeout(() => setDeployMsg(''), 3000);
    } catch {
      setDeployMsg('Failed — check PAT has workflow permissions.');
      setTimeout(() => setDeployMsg(''), 5000);
    } finally {
      setDeploying(false);
    }
  }

  function handleNavItem(_colName: string, index: number) {
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
                  onClick={() => handleNavItem(col.name, i)}
                >
                  {col.name}
                </button>
              );
            })}
          </nav>
          <div className={styles.sidebarFooter}>
            <button className={styles.backBtn} onClick={() => { clearProject(); navigate('/'); }}>
              ← All projects
            </button>
          </div>
        </aside>
      )}
      <div className={`${styles.main} ${showSidebar ? styles.mainWithSidebar : ''}`}>
        <header className={styles.topNav}>
          <span className={styles.pageTitle}>{pageTitle}</span>
          <div className={styles.topNavRight}>
            {deployMsg && <span className={styles.deployMsg}>{deployMsg}</span>}
            {showSidebar && (
              <button className={styles.deployBtn} onClick={handleDeploy} disabled={deploying}>
                {deploying ? 'Syncing…' : 'Sync'}
              </button>
            )}
          </div>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
