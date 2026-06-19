import { resolveFromCwd, repoNameFromPath, type ResolvedContext } from './context.js';
import {
  upsertRepository,
  findRepositoryByGitRoot,
  type Repository,
} from './registry.js';
import { syncWorktreesFromGit } from './worktree-service.js';
import { activateRepository } from './active-session.js';
import { runHooks } from './hook-runner.js';
import { loadRepoConfig } from '../config/loader.js';
import type { RegisterHookContext } from '../hooks/types.js';

export async function registerFromCwd(cwd = process.cwd()): Promise<Repository> {
  const ctx = await resolveFromCwd(cwd);
  if (!ctx) {
    throw new Error('Not inside a git repository');
  }
  return registerContext(ctx);
}

export async function registerContext(ctx: ResolvedContext): Promise<Repository> {
  const name = repoNameFromPath(ctx.layoutRoot);
  const config = loadRepoConfig(ctx.layoutRoot);

  const hookCtx: RegisterHookContext = {
    layoutRoot: ctx.layoutRoot,
    gitRoot: ctx.gitRoot,
    primaryBranch: ctx.primaryBranch,
    layoutMode: ctx.layoutMode,
    config,
  };

  await runHooks('register', 'pre', hookCtx, ctx.gitRoot);

  const existing = findRepositoryByGitRoot(ctx.gitRoot);
  const repo = upsertRepository({
    name,
    path: ctx.layoutRoot,
    gitRoot: ctx.primaryCheckoutPath,
    primaryBranch: ctx.primaryBranch,
    remoteUrl: ctx.remoteUrl,
    layoutMode: ctx.layoutMode,
  });

  await syncWorktreesFromGit(repo);
  activateRepository(repo.id);
  await runHooks('register', 'post', hookCtx, ctx.gitRoot);

  return repo;
}

export async function registerFromPath(path: string): Promise<Repository> {
  const { resolveFromGitRoot } = await import('./context.js');
  const { findGitRoot } = await import('./git-service.js');
  const gitRoot = await findGitRoot(path);
  if (!gitRoot) {
    throw new Error(`No git repository at ${path}`);
  }
  const ctx = await resolveFromGitRoot(gitRoot, path);
  return registerContext(ctx);
}
