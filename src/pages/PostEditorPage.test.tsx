import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { clear, createStore } from 'idb-keyval';
import App from '../App';
import { listEntries, saveEntry, entryKey } from '../lib/workspace';
import * as workspace from '../lib/workspace';
import * as github from '../lib/github';
import type { CmsConfig } from '../types';

// Photo processing needs a real canvas; tests control when it finishes
let finishPhoto: (blob: Blob) => void = () => {};
vi.mock('../lib/photos', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/photos')>();
  return { ...actual, processPhoto: vi.fn(() => new Promise<Blob>(resolve => { finishPhoto = resolve; })) };
});

vi.mock('../lib/workspace', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/workspace')>();
  return { ...actual, getEntry: vi.fn(actual.getEntry) };
});

vi.mock('../lib/github', async importOriginal => {
  const actual = await importOriginal<typeof import('../lib/github')>();
  return {
    ...actual,
    fetchDeployInfo: vi.fn().mockResolvedValue({ exists: true, active: false, runsOnPush: true }),
    fetchRunForCommit: vi.fn().mockResolvedValue(null),
    listFiles: vi.fn().mockResolvedValue([]),
    fetchFile: vi.fn(),
  };
});

// The markdown editor needs browser layout APIs jsdom lacks; a textarea is enough here
vi.mock('@uiw/react-md-editor', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="body" value={value} onChange={e => onChange(e.target.value)} />
  ),
  commands: { getCommands: () => [], divider: {} },
}));

const config: CmsConfig = {
  deployWorkflow: 'main.yml',
  collections: [{
    name: 'Įrašai',
    folder: 'app/_data/_blog',
    imageFolder: 'public/images',
    imageUrlPrefix: '/images',
    fields: [
      { name: 'title', type: 'text' },
      { name: 'date', type: 'date' },
      { name: 'photos', type: 'gallery' },
      { name: 'body', type: 'markdown' },
    ],
  }],
};
const project = { id: 'p1', label: 'Bitės', owner: 'o', repo: 'r', pat: 't' };

function openAt(hash: string) {
  sessionStorage.setItem('marksman:session', JSON.stringify({
    project, config, repoInfo: { defaultBranch: 'master' }, activeCollection: config.collections[0],
  }));
  window.location.hash = hash;
  render(<App />);
}

beforeEach(async () => {
  vi.clearAllMocks();
  await clear(createStore('marksman-entries', 'entries'));
  await clear(createStore('marksman-photos', 'photos'));
});

describe('post editor', () => {
  it('submits a new post with a transliterated slug and no commit', async () => {
    openAt('#/o/r/%C4%AEra%C5%A1ai/new');
    fireEvent.change(await screen.findByLabelText('title'), { target: { value: 'Šablonas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(async () => expect(await listEntries('o/r')).toHaveLength(1));
    const [entry] = await listEntries('o/r');
    expect(entry).toMatchObject({ slug: 'sablonas', state: 'submitted', baseSha: null, path: 'app/_data/_blog/sablonas.md' });
    expect(entry.data.title).toBe('Šablonas');
  });

  it('saves a draft', async () => {
    openAt('#/o/r/%C4%AEra%C5%A1ai/new');
    fireEvent.change(await screen.findByLabelText('title'), { target: { value: 'Juodraštis' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(async () => expect((await listEntries('o/r'))[0]?.state).toBe('draft'));
  });

  it('keeps the slug when an existing post is renamed', async () => {
    await saveEntry({
      key: entryKey('o/r', 'app/_data/_blog/medus.md'), projectId: 'o/r', kind: 'post', scope: 'Įrašai',
      path: 'app/_data/_blog/medus.md', slug: 'medus', state: 'draft', baseSha: 's1', livePhotos: [],
      data: { title: 'Medus' }, body: 'x', updatedAt: 1,
    });
    openAt('#/o/r/%C4%AEra%C5%A1ai/edit/medus');
    const title = await screen.findByLabelText('title');
    await waitFor(() => expect(title).toHaveValue('Medus'));
    fireEvent.change(title, { target: { value: 'Pavasario medus' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(async () => expect((await listEntries('o/r'))[0]?.state).toBe('submitted'));
    const [entry] = await listEntries('o/r');
    expect(entry).toMatchObject({ slug: 'medus', path: 'app/_data/_blog/medus.md', baseSha: 's1' });
  });

  it('opens a live post from GitHub and remembers where it started', async () => {
    vi.mocked(github.fetchFile).mockResolvedValue({
      content: '---\ntitle: Gaudyklė\nphotos:\n  - /images/g.jpg\n---\n\nTekstas',
      sha: 'live1',
    });
    openAt('#/o/r/%C4%AEra%C5%A1ai/edit/gaudykle');
    await waitFor(() => expect(screen.getByLabelText('title')).toHaveValue('Gaudyklė'));
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    await waitFor(async () => expect(await listEntries('o/r')).toHaveLength(1));
    expect((await listEntries('o/r'))[0]).toMatchObject({ baseSha: 'live1', livePhotos: ['/images/g.jpg'], body: 'Tekstas' });
  });

  it('blocks Submit and Save draft while photos are being prepared', async () => {
    openAt('#/o/r/%C4%AEra%C5%A1ai/new');
    await screen.findByLabelText('title');
    const file = new File(['x'], 'bites.jpg', { type: 'image/jpeg' });
    fireEvent.drop(screen.getByText(/Drop photos here/), { dataTransfer: { files: [file], types: ['Files'] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeDisabled());
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    finishPhoto(new Blob(['jpg'], { type: 'image/jpeg' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled());
    expect(screen.getAllByRole('img', { name: /Photo 1/ })).toHaveLength(1);
  });

  it('saves a new post without internet', async () => {
    vi.mocked(github.listFiles).mockRejectedValueOnce(new Error('Failed to fetch'));
    openAt('#/o/r/%C4%AEra%C5%A1ai/new');
    fireEvent.change(await screen.findByLabelText('title'), { target: { value: 'Be interneto' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(async () => expect(await listEntries('o/r')).toHaveLength(1));
    expect((await listEntries('o/r'))[0]).toMatchObject({ slug: 'be-interneto', state: 'draft' });
  });

  it('shows an error instead of spinning when this computer cannot read saved work', async () => {
    vi.mocked(workspace.getEntry).mockRejectedValueOnce(new Error('IndexedDB unavailable'));
    openAt('#/o/r/%C4%AEra%C5%A1ai/edit/medus');
    expect(await screen.findByText(/Couldn't read saved work on this computer/)).toBeInTheDocument();
  });

  it('does not show Sync while editing', async () => {
    openAt('#/o/r/%C4%AEra%C5%A1ai/new');
    await screen.findByLabelText('title');
    expect(screen.queryByRole('button', { name: 'Sync' })).not.toBeInTheDocument();
  });
});
