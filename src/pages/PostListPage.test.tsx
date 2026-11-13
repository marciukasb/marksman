import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { clear, createStore } from 'idb-keyval';
import App from '../App';
import { entryKey, removeEntry, saveEntry } from '../lib/workspace';
import * as github from '../lib/github';
import type { CmsConfig } from '../types';

vi.mock('../lib/github', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/github')>();
  return {
    ...actual,
    fetchDeployInfo: vi.fn().mockResolvedValue({ exists: true, active: false, runsOnPush: true }),
    fetchRunForCommit: vi.fn().mockResolvedValue(null),
    listFiles: vi.fn(),
    fetchFile: vi.fn(),
  };
});

vi.mock('../lib/sync', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/sync')>();
  return {
    ...actual,
    // Stands in for a successful Sync: the entry goes out and GitHub now has the file
    runSync: vi.fn(async () => {
      await removeEntry(entryKey('o/r', 'app/_data/_blog/medus.md'));
      vi.mocked(github.listFiles).mockResolvedValue([{ name: 'medus.md', path: 'app/_data/_blog/medus.md', sha: 's1' }]);
      vi.mocked(github.fetchFile).mockResolvedValue({ content: '---\ntitle: Medus\ndate: "2026-11-13"\n---\n\nT', sha: 's1' });
      return { commitSha: 'c1' };
    }),
  };
});

const config: CmsConfig = {
  deployWorkflow: 'main.yml',
  collections: [{
    name: 'Įrašai', folder: 'app/_data/_blog', imageFolder: 'public/images', imageUrlPrefix: '/images',
    fields: [{ name: 'title', type: 'text' }, { name: 'date', type: 'date' }, { name: 'body', type: 'markdown' }],
  }],
};

beforeEach(async () => {
  await clear(createStore('marksman-entries', 'entries'));
  vi.mocked(github.listFiles).mockResolvedValue([]);
});

describe('post list', () => {
  it('finds unsynced work after the project is re-added with a new id', async () => {
    await saveEntry({
      key: entryKey('o/r', 'app/_data/_blog/juodrastis.md'), projectId: 'o/r', kind: 'post', scope: 'Įrašai',
      path: 'app/_data/_blog/juodrastis.md', slug: 'juodrastis', state: 'draft', baseSha: null, livePhotos: [],
      data: { title: 'Juodraštis', date: '2026-11-12' }, body: 'T', updatedAt: 1,
    });
    sessionStorage.setItem('marksman:session', JSON.stringify({
      project: { id: 'brand-new-id', label: 'B', owner: 'o', repo: 'r', pat: 'new-token' },
      config, repoInfo: { defaultBranch: 'master' }, activeCollection: config.collections[0],
    }));
    window.location.hash = '#/o/r/%C4%AEra%C5%A1ai';
    render(<App />);
    expect(await screen.findByText('Juodraštis')).toBeInTheDocument();
  });

  it('reloads from GitHub after a Sync so a published post shows as Live', async () => {
    await saveEntry({
      key: entryKey('o/r', 'app/_data/_blog/medus.md'), projectId: 'o/r', kind: 'post', scope: 'Įrašai',
      path: 'app/_data/_blog/medus.md', slug: 'medus', state: 'submitted', baseSha: null, livePhotos: [],
      data: { title: 'Medus', date: '2026-11-13' }, body: 'T', updatedAt: 1,
    });
    sessionStorage.setItem('marksman:session', JSON.stringify({
      project: { id: 'p1', label: 'B', owner: 'o', repo: 'r', pat: 't' },
      config, repoInfo: { defaultBranch: 'master' }, activeCollection: config.collections[0],
    }));
    window.location.hash = '#/o/r/%C4%AEra%C5%A1ai';
    render(<App />);
    expect(await screen.findByText('Waiting to sync')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sync' }));
    await waitFor(() => expect(screen.getByText('Live')).toBeInTheDocument());
    expect(screen.getByText('Medus')).toBeInTheDocument();
  });
});
