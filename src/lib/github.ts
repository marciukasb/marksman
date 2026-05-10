import { Octokit } from '@octokit/rest';
import type { CmsConfig, PostFile } from '../types';

function client(pat: string) {
  return new Octokit({ auth: pat });
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

export async function fetchFile(pat: string, owner: string, repo: string, path: string): Promise<{ content: string; sha: string }> {
  const octokit = client(pat);
  const { data } = await octokit.repos.getContent({ owner, repo, path });
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
