import {
  branchTracksRemote,
  fetchAll,
  getAheadBehind,
  getCurrentBranch,
  getUpstream,
  pullCheckout,
  pushCheckout,
} from './git-service.js';
import { getChangesForPath } from './changes-service.js';
import type { Repository, Worktree } from './registry.js';
import { runHooks } from './hook-runner.js';
import type { SyncHookContext } from '../hooks/types.js';

export interface SyncResult {
  ahead: number;
  behind: number;
  upstream: string | null;
}

export async function pullWorktree(
  repository: Repository,
  worktree: Worktree,
  options: { rebase?: boolean; layoutRoot?: string } = {},
): Promise<SyncResult> {
  const layoutRoot = options.layoutRoot ?? repository.path;
  const branch = await getCurrentBranch(worktree.path);
  const upstream = await getUpstream(worktree.path);
  const tracksRemote = await branchTracksRemote(worktree.path, repository.git_root, branch);

  if (!tracksRemote && !upstream) {
    throw new Error(`Branch ${branch} has no upstream. Use push --set-upstream first.`);
  }

  const { ahead, behind } = await getAheadBehind(worktree.path);

  const ctx: SyncHookContext = {
    layoutRoot,
    gitRoot: repository.git_root,
    worktreePath: worktree.path,
    branch,
    config: (await import('../config/loader.js')).loadRepoConfig(layoutRoot),
    direction: 'pull',
    upstream,
    ahead,
    behind,
  };

  await runHooks('worktree_pull', 'pre', ctx, worktree.path);

  await fetchAll(repository.git_root);
  await pullCheckout(worktree.path, { rebase: options.rebase });

  await runHooks('worktree_pull', 'post', ctx, worktree.path);

  return { ahead: 0, behind: 0, upstream };
}

export async function pushWorktree(
  repository: Repository,
  worktree: Worktree,
  options: {
    setUpstream?: boolean;
    strict?: boolean;
    forceWithLease?: boolean;
    layoutRoot?: string;
  } = {},
): Promise<SyncResult> {
  const layoutRoot = options.layoutRoot ?? repository.path;
  const branch = await getCurrentBranch(worktree.path);
  const upstream = await getUpstream(worktree.path);
  const { ahead, behind } = await getAheadBehind(worktree.path);

  if (options.strict) {
    const changes = await getChangesForPath(worktree.path, {
      worktreeId: worktree.id,
      label: worktree.label ?? branch,
      branch,
    });
    if (!changes.isClean) {
      throw new Error('Worktree has uncommitted changes (--strict blocks push)');
    }
  }

  if (!upstream && !options.setUpstream) {
    throw new Error(`Branch ${branch} has no upstream. Use --set-upstream to push.`);
  }

  const ctx: SyncHookContext = {
    layoutRoot,
    gitRoot: repository.git_root,
    worktreePath: worktree.path,
    branch,
    config: (await import('../config/loader.js')).loadRepoConfig(layoutRoot),
    direction: 'push',
    upstream,
    ahead,
    behind,
  };

  await runHooks('worktree_push', 'pre', ctx, worktree.path);

  if (behind > 0) {
    console.warn(`Branch is ${behind} commit(s) behind remote. Consider pulling first.`);
  }

  await pushCheckout(worktree.path, {
    setUpstream: options.setUpstream,
    forceWithLease: options.forceWithLease,
  });

  await runHooks('worktree_push', 'post', ctx, worktree.path);

  return { ahead: 0, behind: 0, upstream: upstream ?? `origin/${branch}` };
}

export async function pullAllWorktrees(
  repository: Repository,
  worktrees: Worktree[],
): Promise<void> {
  for (const worktree of worktrees) {
    const branch = await getCurrentBranch(worktree.path);
    const tracks = await branchTracksRemote(worktree.path, repository.git_root, branch);
    if (!tracks) {
      console.info(`Skipping ${worktree.label ?? branch}: no upstream`);
      continue;
    }
    try {
      await pullWorktree(repository, worktree);
      console.log(`Pulled ${worktree.label ?? branch}`);
    } catch (err) {
      console.error(`Failed to pull ${worktree.label ?? branch}:`, (err as Error).message);
    }
  }
}

export async function getSyncStatus(worktree: Worktree): Promise<SyncResult> {
  const upstream = await getUpstream(worktree.path);
  const { ahead, behind } = await getAheadBehind(worktree.path);
  return { ahead, behind, upstream };
}
