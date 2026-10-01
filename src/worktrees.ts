import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { runCreatePlugins, runCreateShellCommands, type CreateHookContext } from './hooks.js';
import { findRepository } from './registry.js';
import { loadRepoConfig, type LayoutMode } from './repo-config.js';

export function directoryNameForBranch(branch: string): string {
  return branch.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
}

export function worktreeCheckoutPath(repoPath: string, layout: LayoutMode, branch: string): string {
  const directory = directoryNameForBranch(branch);
  if (layout === 'workspaces') {
    return resolve(join(repoPath, '.workspaces', directory));
  }
  return resolve(join(repoPath, '..', directory));
}

function gitOutput(args: string[], cwd: string): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function hasLocalBranch(repoPath: string, branch: string): boolean {
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      cwd: repoPath,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function fetchRemoteOnlyBranch(repoPath: string, branch: string): string | undefined {
  if (hasLocalBranch(repoPath, branch)) {
    return undefined;
  }

  const remotes = gitOutput(['remote'], repoPath)
    .split('\n')
    .map((remote) => remote.trim())
    .filter((remote) => remote.length > 0);

  for (const remote of remotes) {
    let listed = '';
    try {
      listed = gitOutput(['ls-remote', '--heads', remote, `refs/heads/${branch}`], repoPath);
    } catch {
      continue;
    }
    const found = listed.split('\n').some((line) => line.endsWith(`refs/heads/${branch}`));
    if (!found) {
      continue;
    }
    execFileSync(
      'git',
      ['fetch', remote, `refs/heads/${branch}:refs/remotes/${remote}/${branch}`],
      { cwd: repoPath, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return remote;
  }

  throw new Error(`No local or remote branch named ${branch}`);
}

function copyConfiguredFiles(repoPath: string, worktreePath: string, files: string[]): void {
  for (const file of files) {
    const source = join(repoPath, file);
    if (!existsSync(source)) {
      throw new Error(`Cannot copy missing file: ${file}`);
    }
    const target = join(worktreePath, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
}

function addGitWorktree(repoPath: string, target: string, branch: string, remote: string | undefined): void {
  const args = remote
    ? ['worktree', 'add', '--track', '-b', branch, target, `${remote}/${branch}`]
    : ['worktree', 'add', target, branch];
  try {
    execFileSync('git', args, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr =
      error instanceof Error && 'stderr' in error ? String((error as { stderr?: unknown }).stderr) : '';
    throw new Error(stderr.trim() || `Failed to create worktree for ${branch}`);
  }
}

export function findCheckedOutWorktree(repoPath: string, branch: string): string {
  const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoPath,
    encoding: 'utf8',
  });
  const blocks = output.split('\n\n');
  for (const block of blocks) {
    const lines = block.split('\n');
    const pathLine = lines.find((line) => line.startsWith('worktree '));
    const branchLine = lines.find((line) => line.startsWith('branch '));
    if (!pathLine || !branchLine) {
      continue;
    }
    const path = pathLine.slice('worktree '.length);
    const name = branchLine.slice('branch refs/heads/'.length);
    if (name === branch && resolve(path) !== resolve(repoPath)) {
      return path;
    }
  }
  throw new Error(`No worktree is checked out for ${branch}`);
}

export function removeWorktree(repoQuery: string, branch: string): void {
  const repo = findRepository(repoQuery);
  if (!repo) {
    throw new Error(`Repository is not registered: ${repoQuery}`);
  }
  const checkout = findCheckedOutWorktree(repo.path, branch);
  try {
    execFileSync('git', ['worktree', 'remove', checkout], {
      cwd: repo.path,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const stderr =
      error instanceof Error && 'stderr' in error ? String((error as { stderr?: unknown }).stderr).trim() : '';
    throw new Error(stderr || `Failed to remove worktree for ${branch}`);
  }
}

export async function createWorktree(repoQuery: string, branch: string): Promise<string> {
  const repo = findRepository(repoQuery);
  if (!repo) {
    throw new Error(`Repository is not registered: ${repoQuery}`);
  }

  const config = loadRepoConfig(repo.path);
  const target = worktreeCheckoutPath(repo.path, config.layout, branch);
  if (existsSync(target)) {
    throw new Error(`Worktree folder already exists: ${target}`);
  }

  const remote = fetchRemoteOnlyBranch(repo.path, branch);
  const hookContext: CreateHookContext = {
    phase: 'pre',
    branch,
    worktreePath: target,
    repoPath: repo.path,
  };
  runCreateShellCommands(config.createPre, hookContext);
  await runCreatePlugins(config.plugins, hookContext);

  mkdirSync(dirname(target), { recursive: true });
  addGitWorktree(repo.path, target, branch, remote);
  copyConfiguredFiles(repo.path, target, config.copy);

  const postContext: CreateHookContext = { ...hookContext, phase: 'post' };
  runCreateShellCommands(config.createPost, postContext);
  await runCreatePlugins(config.plugins, postContext);
  return target;
}
