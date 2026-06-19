import { basename, join } from 'node:path';
import simpleGit, { type SimpleGit } from 'simple-git';

export function git(cwd: string): SimpleGit {
  return simpleGit({ baseDir: cwd });
}

export async function isGitRepo(cwd: string): Promise<boolean> {
  try {
    return await git(cwd).checkIsRepo();
  } catch {
    return false;
  }
}

export async function findGitRoot(startPath: string): Promise<string | null> {
  try {
    const result = await git(startPath).revparse(['--show-toplevel']);
    return result.trim();
  } catch {
    return null;
  }
}

export async function getCurrentBranch(cwd: string): Promise<string> {
  const g = git(cwd);
  const branch = await g.revparse(['--abbrev-ref', 'HEAD']);
  return branch.trim();
}

export async function getDefaultBranch(cwd: string): Promise<string> {
  const g = git(cwd);
  try {
    const remote = await g.raw(['symbolic-ref', 'refs/remotes/origin/HEAD']);
    const match = remote.trim().match(/refs\/remotes\/origin\/(.+)/);
    if (match) {
      return match[1];
    }
  } catch {
    // fall through
  }
  try {
    const branch = await getCurrentBranch(cwd);
    if (branch !== 'HEAD') {
      return branch;
    }
  } catch {
    // fall through
  }
  return 'main';
}

export async function getRemoteUrl(cwd: string): Promise<string | null> {
  try {
    const remotes = await git(cwd).getRemotes(true);
    const origin = remotes.find((r) => r.name === 'origin');
    return origin?.refs.fetch ?? origin?.refs.push ?? null;
  } catch {
    return null;
  }
}

export async function fetchAll(gitRoot: string): Promise<void> {
  await git(gitRoot).fetch(['--all', '--prune']);
}

export async function listRemoteBranches(gitRoot: string): Promise<string[]> {
  await fetchAll(gitRoot);
  const branches = await git(gitRoot).branch(['-r']);
  return Object.keys(branches.branches)
    .filter((b) => !b.includes('HEAD'))
    .map((b) => b.replace(/^origin\//, ''))
    .sort();
}

export async function getUpstream(cwd: string): Promise<string | null> {
  try {
    const upstream = await git(cwd).revparse(['--abbrev-ref', '@{upstream}']);
    return upstream.trim();
  } catch {
    return null;
  }
}

export async function getAheadBehind(cwd: string): Promise<{ ahead: number; behind: number }> {
  try {
    const result = await git(cwd).raw(['rev-list', '--left-right', '--count', '@{upstream}...HEAD']);
    const [behind, ahead] = result.trim().split(/\s+/).map(Number);
    return { ahead: ahead ?? 0, behind: behind ?? 0 };
  } catch {
    return { ahead: 0, behind: 0 };
  }
}

export async function hasRemoteBranch(gitRoot: string, branch: string): Promise<boolean> {
  try {
    await git(gitRoot).raw(['rev-parse', '--verify', `origin/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

export async function branchTracksRemote(cwd: string, gitRoot: string, branch: string): Promise<boolean> {
  const upstream = await getUpstream(cwd);
  if (upstream) {
    return true;
  }
  return hasRemoteBranch(gitRoot, branch);
}

export async function pullCheckout(
  checkoutPath: string,
  options: { rebase?: boolean } = {},
): Promise<void> {
  const args = options.rebase ? ['--rebase'] : [];
  await git(checkoutPath).pull(args);
}

export async function pushCheckout(
  checkoutPath: string,
  options: { setUpstream?: boolean; forceWithLease?: boolean } = {},
): Promise<void> {
  const branch = await getCurrentBranch(checkoutPath);
  if (options.setUpstream) {
    await git(checkoutPath).push(['-u', 'origin', branch]);
    return;
  }
  if (options.forceWithLease) {
    await git(checkoutPath).push(['--force-with-lease']);
    return;
  }
  await git(checkoutPath).push();
}

export async function listWorktrees(gitRoot: string): Promise<
  Array<{ path: string; branch: string; isBare: boolean }>
> {
  const output = await git(gitRoot).raw(['worktree', 'list', '--porcelain']);
  const entries: Array<{ path: string; branch: string; isBare: boolean }> = [];
  let current: { path?: string; branch?: string; isBare?: boolean } = {};

  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current.path) {
        entries.push({
          path: current.path,
          branch: current.branch ?? 'HEAD',
          isBare: current.isBare ?? false,
        });
      }
      current = { path: line.slice('worktree '.length).trim() };
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice('branch refs/heads/'.length).trim();
    } else if (line === 'bare') {
      current.isBare = true;
    } else if (line === '' && current.path) {
      entries.push({
        path: current.path,
        branch: current.branch ?? 'HEAD',
        isBare: current.isBare ?? false,
      });
      current = {};
    }
  }
  if (current.path) {
    entries.push({
      path: current.path,
      branch: current.branch ?? 'HEAD',
      isBare: current.isBare ?? false,
    });
  }
  return entries;
}

export async function cloneRepository(
  url: string,
  targetPath: string,
  branch?: string,
): Promise<string> {
  const parent = join(targetPath, '..');
  const name = basename(targetPath);
  const g = simpleGit(parent);
  if (branch) {
    await g.clone(url, name, ['--branch', branch]);
  } else {
    await g.clone(url, name);
  }
  return targetPath;
}

export async function addWorktree(
  gitRoot: string,
  path: string,
  branch: string,
  options: { newBranch?: boolean; track?: string } = {},
): Promise<void> {
  const g = git(gitRoot);
  if (options.newBranch && options.track) {
    await g.raw(['worktree', 'add', '-b', branch, path, options.track]);
  } else if (options.newBranch) {
    await g.raw(['worktree', 'add', '-b', branch, path]);
  } else {
    await g.raw(['worktree', 'add', path, branch]);
  }
}

export async function removeWorktree(gitRoot: string, path: string, force = false): Promise<void> {
  const args = ['worktree', 'remove', ...(force ? ['--force'] : []), path];
  await git(gitRoot).raw(args);
}

export async function pruneWorktrees(gitRoot: string): Promise<void> {
  await git(gitRoot).raw(['worktree', 'prune']);
}

export async function mergeBranch(targetPath: string, sourceBranch: string): Promise<void> {
  await git(targetPath).merge([sourceBranch]);
}

export function repoNameFromUrl(url: string): string {
  const cleaned = url.replace(/\.git$/, '').replace(/\/$/, '');
  return basename(cleaned);
}

export async function ensureGitignoreEntry(gitRoot: string, entry: string): Promise<void> {
  const { readFileSync, writeFileSync, existsSync } = await import('node:fs');
  const { join: joinPath } = await import('node:path');
  const ignorePath = joinPath(gitRoot, '.gitignore');
  const line = entry.endsWith('/') ? entry : `${entry}/`;
  if (!existsSync(ignorePath)) {
    writeFileSync(ignorePath, `${line}\n`, 'utf8');
    return;
  }
  const content = readFileSync(ignorePath, 'utf8');
  if (content.split('\n').some((l) => l.trim() === line.trim() || l.trim() === entry)) {
    return;
  }
  writeFileSync(ignorePath, content.endsWith('\n') ? `${content}${line}\n` : `${content}\n${line}\n`, 'utf8');
}
