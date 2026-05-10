import { createContext, useContext, useState } from 'react';
import type { Project, CmsConfig, CollectionConfig } from '../types';

const SESSION_KEY = 'marksman:session';

interface Session {
  project: Project;
  config: CmsConfig;
  activeCollection: CollectionConfig | null;
}

function loadSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
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
  activeCollection: CollectionConfig | null;
  setProject: (p: Project, c: CmsConfig) => void;
  setActiveCollection: (c: CollectionConfig) => void;
  clearProject: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const initial = loadSession();
  const [project, setProjectState] = useState<Project | null>(initial?.project ?? null);
  const [config, setConfig] = useState<CmsConfig | null>(initial?.config ?? null);
  const [activeCollection, setActiveCollectionState] = useState<CollectionConfig | null>(initial?.activeCollection ?? null);

  function setProject(p: Project, c: CmsConfig) {
    setProjectState(p);
    setConfig(c);
    setActiveCollectionState(null);
    saveSession({ project: p, config: c, activeCollection: null });
  }

  function setActiveCollection(c: CollectionConfig) {
    setActiveCollectionState(c);
    if (project && config) saveSession({ project, config, activeCollection: c });
  }

  function clearProject() {
    setProjectState(null);
    setConfig(null);
    setActiveCollectionState(null);
    saveSession(null);
  }

  return (
    <ProjectContext.Provider value={{ project, config, activeCollection, setProject, setActiveCollection, clearProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
