import { describe, it, expect, beforeEach } from 'vitest';
import { getProjects, saveProject, deleteProject } from './storage';
import type { Project } from '../types';

const PROJECT: Project = {
  id: 'abc123',
  label: 'Ember Instruments',
  owner: 'marciukasb',
  repo: 'EmberInstruments',
  pat: 'ghp_test',
};

beforeEach(() => {
  localStorage.clear();
});

describe('getProjects', () => {
  it('returns empty array when nothing is stored', () => {
    expect(getProjects()).toEqual([]);
  });
});

describe('saveProject', () => {
  it('saves a project and retrieves it', () => {
    saveProject(PROJECT);
    expect(getProjects()).toEqual([PROJECT]);
  });

  it('replaces an existing project with the same id', () => {
    saveProject(PROJECT);
    saveProject({ ...PROJECT, label: 'Updated' });
    const projects = getProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].label).toBe('Updated');
  });

  it('saves multiple distinct projects', () => {
    saveProject(PROJECT);
    saveProject({ ...PROJECT, id: 'xyz', label: 'Other' });
    expect(getProjects()).toHaveLength(2);
  });
});

describe('deleteProject', () => {
  it('removes a project by id', () => {
    saveProject(PROJECT);
    deleteProject(PROJECT.id);
    expect(getProjects()).toEqual([]);
  });

  it('does not error when id does not exist', () => {
    expect(() => deleteProject('nonexistent')).not.toThrow();
  });
});
