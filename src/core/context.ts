import { basename, join, resolve } from 'node:path';
import { isPathInside } from '../config/paths.js';
import { loadRepoConfig, saveRepoConfig } from '../config/loader.js';
import type { LayoutMode } from '../config/schema.js';
import {
  findGitRoot,
  getDefaultBranch,
  getRemoteUrl,
  listWorktrees as gitListWorktrees,
} from './git-service.js';

export interface ResolvedContext {
  gitRoot: string;
  layoutRoot: string;
  layoutMode: LayoutMode;
  primaryBranch: string;
  primaryCheckoutPath: string;
  remoteUrl: string | null;
}

export async function resolveFromCwd(cwd = process.cwd()): Promise<ResolvedContext | null> {
  const gitRoot = await findGitRoot(cwd);
  if (!gitRoot) {
    return null;
  }
  return resolveFromGitRoot(gitRoot, cwd);
}

export async function resolveFromGitRoot(
  gitRoot: string,
  cwd = gitRoot,
): Promise<ResolvedContext> {
  const worktrees = await gitListWorktrees(gitRoot);
  const primaryEntry =
    worktrees.find((w) => !w.isBare && w.branch !== 'HEAD') ?? worktrees[0];
  const primaryCheckoutPath = primaryEntry?.path ?? gitRoot;
  const primaryBranch =
    primaryEntry?.branch && primaryEntry.branch !== 'HEAD'
      ? primaryEntry.branch
      : await getDefaultBranch(gitRoot);
  const remoteUrl = await getRemoteUrl(gitRoot);

  const tentativeLayoutRoot = inferLayoutRoot(primaryCheckoutPath, primaryBranch);
  const repoConfig = loadRepoConfig(tentativeLayoutRoot);
  let layoutMode: LayoutMode;
  let layoutRoot: string;

  if (repoConfig.layout.mode) {
    layoutMode = repoConfig.layout.mode;
    layoutRoot = layoutMode === 'sibling' ? tentativeLayoutRoot : primaryCheckoutPath;
  } else {
    const folderName = basename(primaryCheckoutPath);
    if (folderName === primaryBranch) {
      layoutMode = 'sibling';
      layoutRoot = join(primaryCheckoutPath, '..');
    } else {
      layoutMode = 'workspaces';
      layoutRoot = primaryCheckoutPath;
    }
    saveRepoConfig(layoutRoot, {
      ...repoConfig,
      layout: { ...repoConfig.layout, mode: layoutMode },
    });
  }

  if (layoutMode === 'sibling' && basename(primaryCheckoutPath) !== primaryBranch) {
    layoutMode = 'workspaces';
    layoutRoot = primaryCheckoutPath;
  }

  return {
    gitRoot: primaryCheckoutPath,
    layoutRoot: resolve(layoutRoot),
    layoutMode,
    primaryBranch,
    primaryCheckoutPath: resolve(primaryCheckoutPath),
    remoteUrl,
  };
}

function inferLayoutRoot(primaryCheckoutPath: string, primaryBranch: string): string {
  if (basename(primaryCheckoutPath) === primaryBranch) {
    return resolve(join(primaryCheckoutPath, '..'));
  }
  return resolve(primaryCheckoutPath);
}

export function worktreePathForBranch(
  layoutRoot: string,
  layoutMode: LayoutMode,
  primaryBranch: string,
  gitRoot: string,
  branch: string,
  workspacesDir = '.workspaces',
): string {
  const safeBranch = branch.replace(/\//g, '-');
  if (layoutMode === 'sibling') {
    return resolve(join(layoutRoot, safeBranch));
  }
  return resolve(join(gitRoot, workspacesDir, safeBranch));
}

export function matchPathToWorktree(
  cwd: string,
  worktreePaths: string[],
): string | null {
  for (const path of worktreePaths) {
    if (isPathInside(cwd, path)) {
      return resolve(path);
    }
  }
  return null;
}

export function repoNameFromPath(layoutRoot: string): string {
  return basename(layoutRoot);
}
