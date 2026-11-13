import { Octokit } from '@octokit/rest';
import type { CmsConfig, PostFile, RepoInfo } from '../types';

let clientFactory = (pat: string) => new Octokit({ auth: pat });

// Lets tests swap in a fake Octokit
export function setClientFactory(factory: (pat: string) => Octokit) {
  clientFactory = factory;
}

function client(pat: string) {
  return clientFactory(pat);
}

function decodeBase64(encoded: string): string {
  return decodeURIComponent(escape(atob(encoded.replace(/\n/g, ''))));
}

function encodeBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

export async function fetchConfig(pat: string, owner: string, repo: string): Promise<CmsConfig> {
  const octokit = client(pat);
  const { data } = await octokit.repos.getContent({ owner, repo, path: '.cms.json' });
  if ('content' in data) {
    return JSON.parse(decodeBase64(data.content)) as CmsConfig;
  }
  throw new Error('.cms.json not found or is a directory');
}

export async function listFiles(pat: string, owner: string, repo: string, folder: string): Promise<PostFile[]> {
  const octokit = client(pat);
  const { data } = await octokit.repos.getContent({ owner, repo, path: folder });
  if (!Array.isArray(data)) return [];
  return data
    .filter(f => f.type === 'file' && f.name.endsWith('.md'))
    .map(f => ({ name: f.name, path: f.path, sha: f.sha }));
}

export async function fetchFile(pat: string, owner: string, repo: string, path: string, ref?: string): Promise<{ content: string; sha: string }> {
  const octokit = client(pat);
  const { data } = await octokit.repos.getContent({ owner, repo, path, ...(ref ? { ref } : {}) });
  if ('content' in data && !Array.isArray(data)) {
    return { content: decodeBase64(data.content), sha: data.sha };
  }
  throw new Error(`File not found: ${path}`);
}

export async function putFile(
  pat: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  sha?: string,
  branch?: string,
): Promise<void> {
  const octokit = client(pat);
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: encodeBase64(content),
    ...(sha ? { sha } : {}),
    ...(branch ? { branch } : {}),
  });
}

export async function uploadImage(
  pat: string,
  owner: string,
  repo: string,
  imageFolder: string,
  filename: string,
  base64Content: string,
  imageUrlPrefix?: string,
): Promise<string> {
  const octokit = client(pat);
  const path = `${imageFolder}/${filename}`;
  let sha: string | undefined;
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    if (!Array.isArray(data) && 'sha' in data) sha = data.sha;
  } catch {
    // file does not exist yet — no sha needed
  }
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message: `cms: upload image ${filename}`,
    content: base64Content,
    ...(sha ? { sha } : {}),
  });
  return imageUrlPrefix ? `${imageUrlPrefix}/${filename}` : `/${path}`;
}

export async function deleteFile(
  pat: string,
  owner: string,
  repo: string,
  path: string,
  sha: string,
): Promise<void> {
  const octokit = client(pat);
  await octokit.repos.deleteFile({
    owner,
    repo,
    path,
    message: `cms: delete ${path}`,
    sha,
  });
}

export type SyncStatus = 'synced' | 'unsynced' | 'in_progress' | 'unknown';

export async function fetchSyncStatus(
  pat: string,
  owner: string,
  repo: string,
  workflow: string,
  branch = 'master',
): Promise<SyncStatus> {
  const octokit = client(pat);
  const { data: { workflow_runs } } = await octokit.actions.listWorkflowRuns({
    owner, repo, workflow_id: workflow, per_page: 10,
  });
  const activeStatuses = ['queued', 'in_progress', 'waiting', 'requested', 'pending'];
  if (workflow_runs.some(r => activeStatuses.includes(r.status ?? ''))) return 'in_progress';
  const latestSuccess = workflow_runs.find(r => r.conclusion === 'success');
  if (!latestSuccess) return 'unsynced';
  // Compare commits between last deploy and HEAD — only CMS commits count as unsynced
  const { data: comparison } = await octokit.repos.compareCommits({
    owner, repo, base: latestSuccess.head_sha, head: branch,
  });
  if (comparison.ahead_by === 0) return 'synced';
  const hasCmsCommits = comparison.commits.some(c => c.commit.message.startsWith('cms:'));
  return hasCmsCommits ? 'unsynced' : 'synced';
}

export async function triggerDeploy(
  pat: string,
  owner: string,
  repo: string,
  workflow: string,
  branch = 'master',
): Promise<void> {
  const octokit = client(pat);
  await octokit.actions.createWorkflowDispatch({ owner, repo, workflow_id: workflow, ref: branch });
}

export async function ensureDraftsBranch(
  pat: string,
  owner: string,
  repo: string,
  defaultBranch: string,
): Promise<void> {
  const octokit = client(pat);
  try {
    await octokit.repos.getBranch({ owner, repo, branch: 'cms-drafts' });
  } catch {
    const { data: ref } = await octokit.git.getRef({ owner, repo, ref: `heads/${defaultBranch}` });
    await octokit.git.createRef({
      owner,
      repo,
      ref: 'refs/heads/cms-drafts',
      sha: ref.object.sha,
    });
  }
}

export async function fetchRepoInfo(pat: string, owner: string, repo: string): Promise<RepoInfo> {
  const { data } = await client(pat).repos.get({ owner, repo });
  return { defaultBranch: data.default_branch };
}

export async function fetchTreeShas(
  pat: string,
  owner: string,
  repo: string,
  branch: string,
): Promise<{ commitSha: string; treeSha: string; shas: Map<string, string> }> {
  const octokit = client(pat);
  const { data: ref } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
  const commitSha = ref.object.sha;
  const { data: commit } = await octokit.git.getCommit({ owner, repo, commit_sha: commitSha });
  const { data: tree } = await octokit.git.getTree({ owner, repo, tree_sha: commit.tree.sha, recursive: 'true' });
  const shas = new Map<string, string>();
  for (const item of tree.tree) {
    if (item.type === 'blob' && item.path && item.sha) shas.set(item.path, item.sha);
  }
  return { commitSha, treeSha: commit.tree.sha, shas };
}

export type TreeChange =
  | { path: string; content: string; encoding: 'utf-8' | 'base64' }
  | { path: string; delete: true };

export class RefMovedError extends Error {
  constructor() {
    super('The branch moved while syncing');
    this.name = 'RefMovedError';
  }
}

// Makes exactly one commit containing every change, on top of parentSha
export async function commitChanges(
  pat: string,
  owner: string,
  repo: string,
  branch: string,
  parentSha: string,
  changes: TreeChange[],
  message: string,
): Promise<string> {
  const octokit = client(pat);
  const { data: parent } = await octokit.git.getCommit({ owner, repo, commit_sha: parentSha });
  const tree = [];
  for (const change of changes) {
    if ('delete' in change) {
      tree.push({ path: change.path, mode: '100644' as const, type: 'blob' as const, sha: null });
    } else {
      const { data: blob } = await octokit.git.createBlob({ owner, repo, content: change.content, encoding: change.encoding });
      tree.push({ path: change.path, mode: '100644' as const, type: 'blob' as const, sha: blob.sha });
    }
  }
  const { data: newTree } = await octokit.git.createTree({ owner, repo, base_tree: parent.tree.sha, tree });
  const { data: commit } = await octokit.git.createCommit({ owner, repo, message, tree: newTree.sha, parents: [parentSha] });
  try {
    await octokit.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.sha, force: false });
  } catch (err) {
    if ((err as { status?: number }).status === 422) throw new RefMovedError();
    throw err;
  }
  return commit.sha;
}

const RUNS_ON_PUSH = /^\s*push\s*:|^\s*on\s*:.*\bpush\b/m;

export async function fetchDeployInfo(
  pat: string,
  owner: string,
  repo: string,
  workflow: string,
): Promise<{ exists: boolean; active: boolean; runsOnPush: boolean }> {
  const octokit = client(pat);
  try {
    const { data } = await octokit.actions.getWorkflow({ owner, repo, workflow_id: workflow });
    const file = await fetchFile(pat, owner, repo, `.github/workflows/${workflow}`);
    return { exists: true, active: data.state === 'active', runsOnPush: RUNS_ON_PUSH.test(file.content) };
  } catch (err) {
    if ((err as { status?: number }).status === 404) return { exists: false, active: false, runsOnPush: false };
    throw err;
  }
}

export async function fetchRunForCommit(
  pat: string,
  owner: string,
  repo: string,
  workflow: string,
  sha: string,
): Promise<{ status: string; conclusion: string | null; url: string } | null> {
  const { data } = await client(pat).actions.listWorkflowRuns({ owner, repo, workflow_id: workflow, head_sha: sha, per_page: 1 });
  const run = data.workflow_runs[0];
  return run ? { status: run.status ?? '', conclusion: run.conclusion ?? null, url: run.html_url } : null;
}

export async function dispatchDeploy(pat: string, owner: string, repo: string, workflow: string, branch: string): Promise<void> {
  await client(pat).actions.createWorkflowDispatch({ owner, repo, workflow_id: workflow, ref: branch });
}

// Everything Marksman needs to open a project
export async function openProject(pat: string, owner: string, repo: string): Promise<{ config: CmsConfig; repoInfo: RepoInfo }> {
  const [config, repoInfo] = await Promise.all([fetchConfig(pat, owner, repo), fetchRepoInfo(pat, owner, repo)]);
  return { config, repoInfo };
}
