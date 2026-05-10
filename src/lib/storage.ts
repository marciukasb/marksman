import type { Project } from '../types';

const KEY = 'marksman:projects';

export function getProjects(): Project[] {
  const raw = localStorage.getItem(KEY);
  return raw ? (JSON.parse(raw) as Project[]) : [];
}

export function saveProject(project: Project): void {
  const rest = getProjects().filter(p => p.id !== project.id);
  localStorage.setItem(KEY, JSON.stringify([...rest, project]));
}

export function deleteProject(id: string): void {
  localStorage.setItem(KEY, JSON.stringify(getProjects().filter(p => p.id !== id)));
}
