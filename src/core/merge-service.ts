import { mergeBranch, fetchAll, branchTracksRemote, pullCheckout } from './git-service.js';
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
    throw new Error('Source and target are the same');
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

export async function mergeFromPrimary(
  repository: Repository,
  targetQuery: string,
  options: { force?: boolean; layoutRoot?: string } = {},
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

  if (!options.force) {
    await assertClean(primary, target);
  }

  await fetchAll(repository.git_root);
  await pullBranchIfRemote(repository, primary);
  await pullBranchIfRemote(repository, target);

  try {
    await mergeBranch(target.path, primary.branch);
  } catch (err) {
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
