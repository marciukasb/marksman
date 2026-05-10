import { createContext, useContext, useState } from 'react';
import type { Project, CmsConfig, CollectionConfig } from '../types';

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
  const [project, setProjectState] = useState<Project | null>(null);
  const [config, setConfig] = useState<CmsConfig | null>(null);
  const [activeCollection, setActiveCollection] = useState<CollectionConfig | null>(null);

  function setProject(p: Project, c: CmsConfig) {
    setProjectState(p);
    setConfig(c);
    setActiveCollection(null);
  }

  function clearProject() {
    setProjectState(null);
    setConfig(null);
    setActiveCollection(null);
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
