import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  setClientFactory, fetchRepoInfo, fetchTreeShas, commitChanges, RefMovedError, fetchDeployInfo, fetchRunForCommit,
} from './github';

const b64 = (s: string) => btoa(s);

function fakeClient() {
  return {
    repos: {
      get: vi.fn().mockResolvedValue({ data: { default_branch: 'master' } }),
      getContent: vi.fn(),
    },
    git: {
      getRef: vi.fn().mockResolvedValue({ data: { object: { sha: 'head1' } } }),
      getCommit: vi.fn().mockResolvedValue({ data: { tree: { sha: 'tree1' } } }),
      getTree: vi.fn().mockResolvedValue({
        data: { tree: [{ path: 'a.md', type: 'blob', sha: 's1' }, { path: 'dir', type: 'tree', sha: 't' }] },
      }),
      createBlob: vi.fn().mockResolvedValue({ data: { sha: 'blob1' } }),
      createTree: vi.fn().mockResolvedValue({ data: { sha: 'tree2' } }),
      createCommit: vi.fn().mockResolvedValue({ data: { sha: 'commit2' } }),
      updateRef: vi.fn().mockResolvedValue({}),
    },
    actions: {
      getWorkflow: vi.fn().mockResolvedValue({ data: { state: 'active' } }),
      listWorkflowRuns: vi.fn(),
    },
  };
}

let client: ReturnType<typeof fakeClient>;

beforeEach(() => {
  client = fakeClient();
  setClientFactory(() => client as never);
});

describe('fetchRepoInfo', () => {
  it('reads the default branch', async () => {
    expect(await fetchRepoInfo('pat', 'o', 'r')).toEqual({ defaultBranch: 'master' });
  });
});

describe('fetchTreeShas', () => {
  it('maps blob paths to shas for the branch head', async () => {
    const result = await fetchTreeShas('pat', 'o', 'r', 'master');
    expect(result.commitSha).toBe('head1');
    expect(result.treeSha).toBe('tree1');
    expect([...result.shas]).toEqual([['a.md', 's1']]);
    expect(client.git.getRef).toHaveBeenCalledWith(expect.objectContaining({ ref: 'heads/master' }));
  });
});

describe('commitChanges', () => {
  it('creates one tree with blobs and deletions on top of the parent tree', async () => {
    const sha = await commitChanges('pat', 'o', 'r', 'master', 'head1', [
      { path: 'a.md', content: 'hi', encoding: 'utf-8' },
      { path: 'old.jpg', delete: true },
    ], 'cms: x');
    expect(sha).toBe('commit2');
    expect(client.git.createTree).toHaveBeenCalledWith(expect.objectContaining({
      base_tree: 'tree1',
      tree: [
        { path: 'a.md', mode: '100644', type: 'blob', sha: 'blob1' },
        { path: 'old.jpg', mode: '100644', type: 'blob', sha: null },
      ],
    }));
    expect(client.git.createCommit).toHaveBeenCalledWith(expect.objectContaining({ message: 'cms: x', tree: 'tree2', parents: ['head1'] }));
    expect(client.git.updateRef).toHaveBeenCalledWith(expect.objectContaining({ ref: 'heads/master', sha: 'commit2', force: false }));
  });

  it('throws RefMovedError when the branch moved', async () => {
    client.git.updateRef.mockRejectedValue(Object.assign(new Error('Update is not a fast forward'), { status: 422 }));
    await expect(commitChanges('pat', 'o', 'r', 'master', 'head1', [], 'm')).rejects.toBeInstanceOf(RefMovedError);
  });
});

describe('fetchDeployInfo', () => {
  it('reports an active workflow that runs on push', async () => {
    client.repos.getContent.mockResolvedValue({ data: { content: b64('on:\n  push:\n    branches: [master]\n') } });
    expect(await fetchDeployInfo('pat', 'o', 'r', 'main.yml')).toEqual({ exists: true, active: true, runsOnPush: true });
  });

  it('reports a disabled workflow', async () => {
    client.actions.getWorkflow.mockResolvedValue({ data: { state: 'disabled_manually' } });
    client.repos.getContent.mockResolvedValue({ data: { content: b64('on:\n  push:\n') } });
    expect((await fetchDeployInfo('pat', 'o', 'r', 'main.yml')).active).toBe(false);
  });

  it('reports a dispatch-only workflow', async () => {
    client.repos.getContent.mockResolvedValue({ data: { content: b64('on:\n  workflow_dispatch:\n') } });
    expect((await fetchDeployInfo('pat', 'o', 'r', 'main.yml')).runsOnPush).toBe(false);
  });

  it('reports a missing workflow', async () => {
    client.actions.getWorkflow.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
    expect(await fetchDeployInfo('pat', 'o', 'r', 'main.yml')).toEqual({ exists: false, active: false, runsOnPush: false });
  });
});

describe('fetchRunForCommit', () => {
  it('returns the run for the commit', async () => {
    client.actions.listWorkflowRuns.mockResolvedValue({
      data: { workflow_runs: [{ status: 'completed', conclusion: 'success', html_url: 'u' }] },
    });
    expect(await fetchRunForCommit('pat', 'o', 'r', 'main.yml', 'c1')).toEqual({ status: 'completed', conclusion: 'success', url: 'u' });
    expect(client.actions.listWorkflowRuns).toHaveBeenCalledWith(expect.objectContaining({ head_sha: 'c1' }));
  });

  it('returns null when no run exists yet', async () => {
    client.actions.listWorkflowRuns.mockResolvedValue({ data: { workflow_runs: [] } });
    expect(await fetchRunForCommit('pat', 'o', 'r', 'main.yml', 'c1')).toBeNull();
  });
});
