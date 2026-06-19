export function truncateEnd(text: string, maxLength: number): string {
  if (maxLength <= 0) {
    return '';
  }
  if (text.length <= maxLength) {
    return text;
  }
  if (maxLength === 1) {
    return '…';
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

export const FOOTER_ACTIONS =
  'Tab focus · ↑/↓ navigate · o open · w worktree · x remove · p/P sync · M/m merge · r refresh · q quit';

export function branchesAvailableForWorktree(
  remoteBranches: string[],
  worktrees: Array<{ branch: string }>,
): string[] {
  const checkedOut = new Set(worktrees.map((w) => w.branch));
  return remoteBranches.filter((branch) => !checkedOut.has(branch));
}

export const NEW_BRANCH_OPTION = '__new_branch__';
