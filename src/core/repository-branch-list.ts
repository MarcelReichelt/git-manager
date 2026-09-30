/**
 * Branches for one registered repository, as the sidebar renders them.
 *
 * `readRepositoryBranches` fills this shape from git:
 * one `BranchChange` per changed file in that branch's checkout (a rename is one change, a binary is one change),
 * ahead and behind as commit lists (the row counts those commits),
 * `runningTerminals` zero when none are running,
 * and a detached HEAD omitted from the list. The sidebar also drops a detached HEAD if one is present.
 * A text change carries its diff. A binary file does not.
 * Each commit that exists only on the branch (`commitsAhead`) carries an id and subject.
 * Per-commit `files` stay empty until they are read from that commit.
 * The sidebar still counts changes and commits by list length.
 */
export type BranchTracking = 'local-only' | 'local-and-remote' | 'remote-only' | 'remote-deleted';

/** Lines added, lines deleted, and the diff text. A binary file does not carry this. */
export interface TextChange {
  readonly linesAdded: number;
  readonly linesDeleted: number;
  readonly diff: string;
}

/**
 * One entry per changed file. A rename is one entry, not a delete plus an add.
 * A binary file is one entry and has no line counts.
 * A rename's `linesAdded` and `linesDeleted` are the edit after rename detection,
 * not a full delete of the old path plus an add of the new path.
 */
export type BranchChange =
  | (TextChange & { readonly kind: 'edit'; readonly path: string })
  | (TextChange & { readonly kind: 'rename'; readonly path: string; readonly previousPath: string })
  | { readonly kind: 'binary'; readonly path: string };

/**
 * A commit counted by ahead or behind. Ahead and behind are the lengths of these lists, not file counts.
 * `files` lists what that commit touched, using the same line-count rules as `BranchChange`.
 * Commits that exist only on the branch are `commitsAhead`. Branch content does not list `commitsBehind`.
 * `files` is empty until each commit's files are read from git.
 */
export interface BranchCommit {
  readonly id: string;
  readonly subject: string;
  readonly files: readonly BranchChange[];
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
