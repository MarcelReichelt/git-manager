import {
  getRepository,
  getGlobalState,
  setActiveRepository,
  setActiveWorktree,
  getActiveSession,
  getPrimaryWorktree,
  listWorktrees,
  findWorktreeByLabelOrBranch,
  type Repository,
  type Worktree,
} from './registry.js';

export interface ActiveContext {
  repository: Repository;
  worktree: Worktree;
}

export function getActiveRepository(): Repository | undefined {
  const state = getGlobalState();
  if (!state.active_repository_id) {
    return undefined;
  }
  return getRepository(state.active_repository_id);
}

export function getActiveContext(): ActiveContext | undefined {
  const repository = getActiveRepository();
  if (!repository) {
    return undefined;
  }
  const session = getActiveSession(repository.id);
  let worktree: Worktree | undefined;
  if (session) {
    worktree = listWorktrees(repository.id).find((w) => w.id === session.worktree_id);
  }
  if (!worktree) {
    worktree = getPrimaryWorktree(repository.id);
  }
  if (!worktree) {
    return undefined;
  }
  return { repository, worktree };
}

export function activateRepository(repositoryId: number, worktreeId?: number): ActiveContext {
  const repository = getRepository(repositoryId);
  if (!repository) {
    throw new Error('Repository not found');
  }
  setActiveRepository(repositoryId);
  const worktrees = listWorktrees(repositoryId);
  let worktree = worktreeId ? worktrees.find((w) => w.id === worktreeId) : undefined;
  if (!worktree) {
    const session = getActiveSession(repositoryId);
    worktree = session ? worktrees.find((w) => w.id === session.worktree_id) : undefined;
  }
  if (!worktree) {
    worktree = worktrees.find((w) => w.is_primary) ?? worktrees[0];
  }
  if (!worktree) {
    throw new Error('No worktrees registered for repository');
  }
  setActiveWorktree(repositoryId, worktree.id);
  return { repository, worktree };
}

export function switchWorktree(repositoryId: number, query: string): Worktree {
  const worktree = findWorktreeByLabelOrBranch(repositoryId, query);
  if (!worktree) {
    throw new Error(`Worktree not found: ${query}`);
  }
  setActiveWorktree(repositoryId, worktree.id);
  return worktree;
}

export function resolveWorktree(
  repositoryId: number,
  query?: string,
): Worktree {
  if (query) {
    return switchWorktree(repositoryId, query);
  }
  const ctx = getActiveContext();
  if (ctx && ctx.repository.id === repositoryId) {
    return ctx.worktree;
  }
  const primary = getPrimaryWorktree(repositoryId);
  if (!primary) {
    throw new Error('No worktrees found');
  }
  return primary;
}
