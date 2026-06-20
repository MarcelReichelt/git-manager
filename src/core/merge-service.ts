import {
  mergeBranch,
  fetchAll,
  branchTracksRemote,
  pullCheckout,
  stashChanges,
  popStash,
  getAheadBehind,
  isBranchAncestorOf,
} from './git-service.js';
import { getChangesForPath } from './changes-service.js';
import { runHooks } from './hook-runner.js';
import {
  findWorktreeByLabelOrBranch,
  getPrimaryWorktree,
  type Repository,
  type Worktree,
} from './registry.js';
import { loadRepoConfig } from '../config/loader.js';
import type { MergeHookContext } from '../hooks/types.js';

async function pullBranchIfRemote(
  repository: Repository,
  worktree: Worktree,
  rebase?: boolean,
): Promise<void> {
  const tracks = await branchTracksRemote(worktree.path, repository.git_root, worktree.branch);
  if (!tracks) {
    console.info(`Skipping pull for local-only branch ${worktree.branch}`);
    return;
  }
  await fetchAll(repository.git_root);
  await pullCheckout(worktree.path, { rebase });
}

export async function mergeIntoPrimary(
  repository: Repository,
  sourceQuery: string,
  options: { force?: boolean; layoutRoot?: string } = {},
): Promise<void> {
  const layoutRoot = options.layoutRoot ?? repository.path;
  const config = loadRepoConfig(layoutRoot);
  const source = findWorktreeByLabelOrBranch(repository.id, sourceQuery);
  const primary = getPrimaryWorktree(repository.id);
  if (!source) {
    throw new Error(`Source worktree not found: ${sourceQuery}`);
  }
  if (!primary) {
    throw new Error('Primary worktree not found');
  }
  if (source.id === primary.id) {
    throw new Error('Cannot merge the primary worktree into itself');
  }

  const ctx: MergeHookContext = {
    layoutRoot,
    gitRoot: repository.git_root,
    sourcePath: source.path,
    targetPath: primary.path,
    sourceBranch: source.branch,
    targetBranch: primary.branch,
    direction: 'into-primary',
    config,
  };

  await runHooks('merge', 'pre', ctx, primary.path);

  if (!options.force) {
    await assertClean(source, primary);
  }

  await fetchAll(repository.git_root);
  await pullBranchIfRemote(repository, source);
  await pullBranchIfRemote(repository, primary);

  try {
    await mergeBranch(primary.path, source.branch);
  } catch (err) {
    const changes = await getChangesForPath(primary.path, {
      worktreeId: primary.id,
      label: primary.label ?? primary.branch,
      branch: primary.branch,
    });
    if (changes.conflicted.length > 0) {
      console.error('Merge conflicts in files:');
      for (const f of changes.conflicted) {
        console.error(`  ${f.path}`);
      }
    }
    throw err;
  }

  await runHooks('merge', 'post', ctx, primary.path);
}

export interface UpdateFromPrimaryPrecheck {
  primaryHasLocalChanges: boolean;
  targetHasLocalChanges: boolean;
  primaryBehind: number;
  primaryTracksRemote: boolean;
  targetUpToDateWithPrimary: boolean;
}

export interface UpdateFromPrimaryPlan {
  pullPrimary: boolean;
  stashPrimary: boolean;
  stashTarget: boolean;
}

export async function precheckUpdateFromPrimary(
  repository: Repository,
  target: Worktree,
  primary: Worktree,
): Promise<UpdateFromPrimaryPrecheck> {
  await fetchAll(repository.git_root);

  const [primaryChanges, targetChanges] = await Promise.all([
    getChangesForPath(primary.path, {
      worktreeId: primary.id,
      label: primary.label ?? primary.branch,
      branch: primary.branch,
    }),
    getChangesForPath(target.path, {
      worktreeId: target.id,
      label: target.label ?? target.branch,
      branch: target.branch,
    }),
  ]);

  const primaryTracksRemote = await branchTracksRemote(
    primary.path,
    repository.git_root,
    primary.branch,
  );
  let primaryBehind = 0;
  if (primaryTracksRemote) {
    const { behind } = await getAheadBehind(primary.path);
    primaryBehind = behind;
  }

  const targetUpToDateWithPrimary = await isBranchAncestorOf(
    target.path,
    primary.branch,
  );

  return {
    primaryHasLocalChanges: !primaryChanges.isClean,
    targetHasLocalChanges: !targetChanges.isClean,
    primaryBehind,
    primaryTracksRemote,
    targetUpToDateWithPrimary,
  };
}

export async function mergeFromPrimary(
  repository: Repository,
  targetQuery: string,
  options: {
    force?: boolean;
    layoutRoot?: string;
    stashDirtyTarget?: boolean;
    stashDirtyPrimary?: boolean;
    pullPrimary?: boolean;
  } = {},
): Promise<void> {
  const layoutRoot = options.layoutRoot ?? repository.path;
  const config = loadRepoConfig(layoutRoot);
  const target = findWorktreeByLabelOrBranch(repository.id, targetQuery);
  const primary = getPrimaryWorktree(repository.id);
  if (!target) {
    throw new Error(`Target worktree not found: ${targetQuery}`);
  }
  if (!primary) {
    throw new Error('Primary worktree not found');
  }
  if (target.id === primary.id) {
    throw new Error('Cannot update the primary worktree from itself');
  }

  const ctx: MergeHookContext = {
    layoutRoot,
    gitRoot: repository.git_root,
    sourcePath: primary.path,
    targetPath: target.path,
    sourceBranch: primary.branch,
    targetBranch: target.branch,
    direction: 'from-primary',
    config,
  };

  await runHooks('merge', 'pre', ctx, target.path);

  let stashedPrimary = false;
  let stashedTarget = false;
  if (options.stashDirtyPrimary) {
    stashedPrimary = await stashChanges(primary.path, 'git-manager primary auto-stash');
  }
  if (options.stashDirtyTarget) {
    stashedTarget = await stashChanges(target.path, 'git-manager target auto-stash');
  }

  if (!options.force) {
    const toCheck: Worktree[] = [];
    // Primary is checked only when pulling: merge uses the branch ref, not the primary
    // checkout's working tree. Requiring a clean primary without a pull blocks valid
    // updates when the primary has local WIP (see mergeFromPrimary integration test).
    if (options.pullPrimary && !stashedPrimary) {
      toCheck.push(primary);
    }
    if (!stashedTarget) {
      toCheck.push(target);
    }
    if (toCheck.length > 0) {
      await assertClean(...toCheck);
    }
  }

  await fetchAll(repository.git_root);
  if (options.pullPrimary) {
    await pullBranchIfRemote(repository, primary);
  }
  await pullBranchIfRemote(repository, target);

  try {
    await mergeBranch(target.path, primary.branch);
  } catch (err) {
    await restoreStashedChanges([
      { path: target.path, stashed: stashedTarget },
      { path: primary.path, stashed: stashedPrimary },
    ]);
    const changes = await getChangesForPath(target.path, {
      worktreeId: target.id,
      label: target.label ?? target.branch,
      branch: target.branch,
    });
    if (changes.conflicted.length > 0) {
      console.error('Merge conflicts in files:');
      for (const f of changes.conflicted) {
        console.error(`  ${f.path}`);
      }
    }
    throw err;
  }

  if (stashedTarget) {
    try {
      await popStash(target.path);
    } catch (err) {
      throw new Error(
        `Updated from ${primary.branch}, but reapplying stashed changes in ${target.label ?? target.branch} failed: ${(err as Error).message}`,
      );
    }
  }
  if (stashedPrimary) {
    try {
      await popStash(primary.path);
    } catch (err) {
      throw new Error(
        `Updated from ${primary.branch}, but reapplying stashed changes on ${primary.branch} failed: ${(err as Error).message}`,
      );
    }
  }

  await runHooks('merge', 'post', ctx, target.path);
}

export async function mergeWorktrees(
  repository: Repository,
  sourceQuery: string,
  targetQuery: string,
  options: { force?: boolean; layoutRoot?: string } = {},
): Promise<void> {
  const layoutRoot = options.layoutRoot ?? repository.path;
  const config = loadRepoConfig(layoutRoot);
  const source = findWorktreeByLabelOrBranch(repository.id, sourceQuery);
  const target = findWorktreeByLabelOrBranch(repository.id, targetQuery);
  const primary = getPrimaryWorktree(repository.id);

  if (!source || !target) {
    throw new Error('Source or target worktree not found');
  }
  if (primary && target.id === primary.id) {
    throw new Error('Use merge into-primary or from-primary for primary checkout');
  }

  const ctx: MergeHookContext = {
    layoutRoot,
    gitRoot: repository.git_root,
    sourcePath: source.path,
    targetPath: target.path,
    sourceBranch: source.branch,
    targetBranch: target.branch,
    direction: 'worktree-to-worktree',
    config,
  };

  await runHooks('merge', 'pre', ctx, target.path);

  if (!options.force) {
    await assertClean(source, target);
  }

  await fetchAll(repository.git_root);
  await pullBranchIfRemote(repository, source);
  await pullBranchIfRemote(repository, target);

  try {
    await mergeBranch(target.path, source.branch);
  } catch (err) {
    throw err;
  }

  await runHooks('merge', 'post', ctx, target.path);
}

async function assertClean(...worktrees: Worktree[]): Promise<void> {
  for (const w of worktrees) {
    const changes = await getChangesForPath(w.path, {
      worktreeId: w.id,
      label: w.label ?? w.branch,
      branch: w.branch,
    });
    if (!changes.isClean) {
      throw new Error(
        `Worktree ${w.label ?? w.branch} has uncommitted changes. Commit or stash first.`,
      );
    }
  }
}

async function restoreStashedChanges(
  entries: Array<{ path: string; stashed: boolean }>,
): Promise<void> {
  for (const entry of entries) {
    if (!entry.stashed) {
      continue;
    }
    try {
      await popStash(entry.path);
    } catch {
      // best effort during rollback
    }
  }
}
