import { existsSync } from 'node:fs';
import { runHooks } from './hook-runner.js';
import {
  addWorktree,
  ensureGitignoreEntry,
  fetchAll,
  getCurrentBranch,
  hasLocalBranch,
  hasRemoteBranch,
  listWorktrees as gitListWorktrees,
  removeWorktree,
} from './git-service.js';
import { copyConfiguredFiles } from './copy-service.js';
import { worktreePathForBranch } from './context.js';
import {
  upsertWorktree,
  deleteWorktree,
  getPrimaryWorktree,
  type Repository,
  type Worktree,
} from './registry.js';
import { loadRepoConfig } from '../config/loader.js';
import type { WorktreeHookContext } from '../hooks/types.js';

export async function syncWorktreesFromGit(repository: Repository): Promise<Worktree[]> {
  const entries = await gitListWorktrees(repository.git_root);
  const synced: Worktree[] = [];

  for (const entry of entries) {
    if (entry.isBare) {
      continue;
    }
    const branch = entry.branch === 'HEAD' ? await getCurrentBranch(entry.path) : entry.branch;
    const isPrimary = entry.path === repository.git_root;
    const wt = upsertWorktree({
      repositoryId: repository.id,
      branch,
      path: entry.path,
      label: isPrimary ? repository.primary_branch : branch.replace(/\//g, '-'),
      isPrimary,
    });
    synced.push(wt);
  }

  if (!getPrimaryWorktree(repository.id)) {
    const primary = upsertWorktree({
      repositoryId: repository.id,
      branch: repository.primary_branch,
      path: repository.git_root,
      label: repository.primary_branch,
      isPrimary: true,
    });
    synced.push(primary);
  }

  return synced;
}

export async function createWorktree(
  repository: Repository,
  branch: string,
  options: {
    newBranch?: boolean;
    activate?: boolean;
    layoutRoot?: string;
  } = {},
): Promise<Worktree> {
  const layoutRoot = options.layoutRoot ?? repository.path;
  const config = loadRepoConfig(layoutRoot);
  const targetPath = worktreePathForBranch(
    layoutRoot,
    repository.layout_mode,
    repository.primary_branch,
    repository.git_root,
    branch,
    config.layout.workspaces_dir,
  );

  if (existsSync(targetPath)) {
    throw new Error(`Worktree path already exists: ${branch}`);
  }

  const ctx: WorktreeHookContext = {
    layoutRoot,
    gitRoot: repository.git_root,
    worktreePath: targetPath,
    branch,
    config,
  };

  await runHooks('worktree_create', 'pre', ctx, targetPath);

  await fetchAll(repository.git_root);

  if (options.newBranch) {
    await addWorktree(repository.git_root, targetPath, branch, { newBranch: true });
  } else if (await hasLocalBranch(repository.git_root, branch)) {
    await addWorktree(repository.git_root, targetPath, branch);
  } else if (await hasRemoteBranch(repository.git_root, branch)) {
    await addWorktree(repository.git_root, targetPath, branch, {
      newBranch: true,
      track: `origin/${branch}`,
    });
  } else {
    await addWorktree(repository.git_root, targetPath, branch, { newBranch: true });
  }

  if (repository.layout_mode === 'workspaces') {
    await ensureGitignoreEntry(repository.git_root, config.layout.workspaces_dir);
  }

  copyConfiguredFiles(layoutRoot, repository.git_root, targetPath);

  const worktree = upsertWorktree({
    repositoryId: repository.id,
    branch,
    path: targetPath,
    label: branch.replace(/\//g, '-'),
  });

  await runHooks('worktree_create', 'post', ctx, targetPath);

  if (options.activate !== false) {
    const { setActiveWorktree } = await import('./registry.js');
    setActiveWorktree(repository.id, worktree.id);
  }

  return worktree;
}

export async function removeWorktreeEntry(
  repository: Repository,
  worktree: Worktree,
  options: { force?: boolean; layoutRoot?: string } = {},
): Promise<void> {
  const layoutRoot = options.layoutRoot ?? repository.path;
  const config = loadRepoConfig(layoutRoot);
  const ctx: WorktreeHookContext = {
    layoutRoot,
    gitRoot: repository.git_root,
    worktreePath: worktree.path,
    branch: worktree.branch,
    config,
  };

  await runHooks('worktree_remove', 'pre', ctx, worktree.path);
  await removeWorktree(repository.git_root, worktree.path, options.force);
  deleteWorktree(worktree.id);
  await runHooks('worktree_remove', 'post', ctx, worktree.path);
}
