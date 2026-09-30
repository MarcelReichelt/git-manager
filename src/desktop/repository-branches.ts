/**
 * Branches for one registered repository, as the sidebar renders them.
 *
 * `REPOSITORY_BRANCHES` supplies this shape. The sample fixture is the default.
 * Replacing that fixture with a git-backed list should keep this shape:
 * one `BranchChange` per changed file (a rename is one change, a binary is one change),
 * ahead and behind as commit lists (the row counts those commits),
 * `runningTerminals` zero when none are running,
 * and a detached HEAD included on `branches` so the sidebar can omit it.
 * File diffs and per-commit file lists can be added on these entries later
 * without changing how the sidebar counts.
 */
export type BranchTracking = 'local-only' | 'local-and-remote' | 'remote-only' | 'remote-deleted';

/** One entry per changed file. A rename is one entry, not a delete plus an add. A binary file is one entry. */
export type BranchChange =
  | { readonly kind: 'edit'; readonly path: string }
  | { readonly kind: 'rename'; readonly path: string; readonly previousPath: string }
  | { readonly kind: 'binary'; readonly path: string };

/** A commit counted by ahead or behind. Ahead and behind are the lengths of these lists, not file counts. */
export interface BranchCommit {
  readonly id: string;
  readonly subject: string;
}

export interface ListedBranch {
  readonly detached: false;
  readonly name: string;
  readonly tracking: BranchTracking;
  readonly hasWorktree: boolean;
  readonly changes: readonly BranchChange[];
  readonly commitsAhead: readonly BranchCommit[];
  readonly commitsBehind: readonly BranchCommit[];
  /** Running terminals for this branch. Zero means the row shows no terminal count. */
  readonly runningTerminals: number;
}

export interface DetachedHead {
  readonly detached: true;
  readonly name: 'HEAD';
  readonly commitId: string;
  readonly subject: string;
}

/** A branch row, or a detached HEAD that the sidebar must not list. */
export type Branch = ListedBranch | DetachedHead;

export interface RepositoryBranchList {
  readonly repositoryPath: string;
  readonly branches: readonly Branch[];
}
