import { createContext, useContext, useState } from 'react';
import type { Project, CmsConfig, CollectionConfig, RepoInfo } from '../types';

const SESSION_KEY = 'marksman:session';

interface Session {
  project: Project;
  config: CmsConfig;
  repoInfo: RepoInfo;
  activeCollection: CollectionConfig | null;
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const session = raw ? (JSON.parse(raw) as Session) : null;
    // Sessions saved before repoInfo existed must be reopened
    return session?.repoInfo ? session : null;
  } catch {
    return null;
  }
}

function saveSession(s: Session | null) {
  if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  else sessionStorage.removeItem(SESSION_KEY);
}

interface ProjectContextValue {
  project: Project | null;
  config: CmsConfig | null;
  repoInfo: RepoInfo | null;
  activeCollection: CollectionConfig | null;
  setProject: (p: Project, c: CmsConfig, r: RepoInfo) => void;
  setActiveCollection: (c: CollectionConfig) => void;
  clearProject: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const initial = loadSession();
  const [project, setProjectState] = useState<Project | null>(initial?.project ?? null);
  const [config, setConfig] = useState<CmsConfig | null>(initial?.config ?? null);
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(initial?.repoInfo ?? null);
  const [activeCollection, setActiveCollectionState] = useState<CollectionConfig | null>(initial?.activeCollection ?? null);

  function setProject(p: Project, c: CmsConfig, r: RepoInfo) {
    setProjectState(p);
    setConfig(c);
    setRepoInfo(r);
    setActiveCollectionState(null);
    saveSession({ project: p, config: c, repoInfo: r, activeCollection: null });
  }

  function setActiveCollection(c: CollectionConfig) {
    setActiveCollectionState(c);
    if (project && config && repoInfo) saveSession({ project, config, repoInfo, activeCollection: c });
  }

  function clearProject() {
    setProjectState(null);
    setConfig(null);
    setRepoInfo(null);
    setActiveCollectionState(null);
    saveSession(null);
  }

  return (
    <ProjectContext.Provider value={{ project, config, repoInfo, activeCollection, setProject, setActiveCollection, clearProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
