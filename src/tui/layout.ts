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

export function panelBorderColor(focused: boolean): 'cyan' | 'gray' {
  return focused ? 'cyan' : 'gray';
}

import { STAGE_REPOS, STAGE_CHANGES, type Stage } from './carousel.js';

export function footerActionsForStage(stage: Stage): string {
  const nav = 'Tab/←/→ columns · ↑/↓ select';
  const common = 'm menu · R repo · S settings · r refresh · q quit';
  const ops = 'o open · w worktree · x remove · g stashes · p/P sync · u/U primary';
  if (stage === STAGE_REPOS) {
    return `${nav} · ${common}`;
  }
  if (stage === STAGE_CHANGES) {
    return `${nav} · →/Tab diff · j/k scroll · J/K jump hunk · ${ops} · ${common}`;
  }
  return `${nav} · j/k scroll · ${ops} · ${common}`;
}

export function branchesAvailableForWorktree(
  remoteBranches: string[],
  worktrees: Array<{ branch: string }>,
): string[] {
  const checkedOut = new Set(worktrees.map((w) => w.branch));
  return remoteBranches.filter((branch) => !checkedOut.has(branch));
}

export const NEW_BRANCH_OPTION = '__new_branch__';
