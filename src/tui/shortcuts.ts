import { STAGES, STAGE_CHANGES, type Stage } from './carousel.js';

export type ShortcutActionId =
  | 'column-next'
  | 'column-prev'
  | 'select-up'
  | 'select-down'
  | 'diff-next-hunk'
  | 'diff-prev-hunk'
  | 'open-editor'
  | 'pull'
  | 'push'
  | 'update-from-primary'
  | 'merge-into-primary'
  | 'create-worktree'
  | 'remove-worktree'
  | 'refresh'
  | 'change-repo'
  | 'settings'
  | 'view-stashes'
  | 'shortcuts-menu'
  | 'quit';

export type ShortcutEntry = {
  keys: string;
  label: string;
  action: ShortcutActionId;
  stages: readonly Stage[];
};

const ALL_STAGES: readonly Stage[] = STAGES;
const WORKTREE_STAGES: readonly Stage[] = [1, 2];
const CHANGES_STAGE: readonly Stage[] = [STAGE_CHANGES];

export function tuiShortcutEntries(primaryBranch: string, stage?: Stage): ShortcutEntry[] {
  const entries: ShortcutEntry[] = [
    { keys: 'Tab/→', label: 'Next column', action: 'column-next', stages: ALL_STAGES },
    { keys: 'S-Tab/←', label: 'Previous column', action: 'column-prev', stages: ALL_STAGES },
    { keys: '↑', label: 'Move selection up', action: 'select-up', stages: ALL_STAGES },
    { keys: '↓', label: 'Move selection down', action: 'select-down', stages: ALL_STAGES },
    {
      keys: 'J/⇧↓',
      label: 'Jump to next change in diff',
      action: 'diff-next-hunk',
      stages: CHANGES_STAGE,
    },
    {
      keys: 'K/⇧↑',
      label: 'Jump to previous change in diff',
      action: 'diff-prev-hunk',
      stages: CHANGES_STAGE,
    },
    {
      keys: 'Enter',
      label: 'Set active worktree and open editor',
      action: 'open-editor',
      stages: WORKTREE_STAGES,
    },
    {
      keys: 'o',
      label: 'Set active worktree and open editor',
      action: 'open-editor',
      stages: WORKTREE_STAGES,
    },
    { keys: 'p', label: 'Pull selected worktree', action: 'pull', stages: WORKTREE_STAGES },
    { keys: 'P', label: 'Push selected worktree', action: 'push', stages: WORKTREE_STAGES },
    {
      keys: 'u',
      label: `Update from ${primaryBranch}`,
      action: 'update-from-primary',
      stages: WORKTREE_STAGES,
    },
    {
      keys: 'U',
      label: `Merge into ${primaryBranch}`,
      action: 'merge-into-primary',
      stages: WORKTREE_STAGES,
    },
    { keys: 'w', label: 'Create worktree', action: 'create-worktree', stages: WORKTREE_STAGES },
    {
      keys: 'x',
      label: 'Remove selected worktree',
      action: 'remove-worktree',
      stages: WORKTREE_STAGES,
    },
    {
      keys: 'g',
      label: 'View stashes for selected worktree',
      action: 'view-stashes',
      stages: WORKTREE_STAGES,
    },
    { keys: 'r', label: 'Refresh worktrees and changes', action: 'refresh', stages: ALL_STAGES },
    { keys: 'R', label: 'Change repository', action: 'change-repo', stages: ALL_STAGES },
    { keys: 'S', label: 'Global settings', action: 'settings', stages: ALL_STAGES },
    { keys: ',', label: 'Global settings', action: 'settings', stages: ALL_STAGES },
    { keys: 'm', label: 'Show shortcuts (this menu)', action: 'shortcuts-menu', stages: ALL_STAGES },
    { keys: 'q', label: 'Quit', action: 'quit', stages: ALL_STAGES },
  ];

  if (stage === undefined) {
    return entries;
  }
  return entries.filter((entry) => entry.stages.includes(stage));
}

export const SHORTCUT_KEY_WIDTH = 8;

export function formatShortcutLine(entry: ShortcutEntry): string {
  const keys = entry.keys.padEnd(SHORTCUT_KEY_WIDTH, ' ');
  return `${keys}${entry.label}`;
}

export function shortcutActionAt(
  primaryBranch: string,
  index: number,
  stage?: Stage,
): ShortcutActionId | undefined {
  return tuiShortcutEntries(primaryBranch, stage)[index]?.action;
}
