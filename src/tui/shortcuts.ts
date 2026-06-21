export type ShortcutActionId =
  | 'focus-toggle'
  | 'navigate-up'
  | 'navigate-down'
  | 'changes-down'
  | 'changes-up'
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
};

export function tuiShortcutEntries(primaryBranch: string): ShortcutEntry[] {
  return [
    { keys: 'Tab', label: 'Switch focus (worktrees / changes)', action: 'focus-toggle' },
    { keys: '↑', label: 'Move selection up or scroll changes up', action: 'navigate-up' },
    { keys: '↓', label: 'Move selection down or scroll changes down', action: 'navigate-down' },
    { keys: 'j', label: 'Focus changes panel, scroll down', action: 'changes-down' },
    { keys: 'k', label: 'Focus changes panel, scroll up', action: 'changes-up' },
    { keys: 'Enter', label: 'Set active worktree and open editor', action: 'open-editor' },
    { keys: 'o', label: 'Set active worktree and open editor', action: 'open-editor' },
    { keys: 'p', label: 'Pull selected worktree', action: 'pull' },
    { keys: 'P', label: 'Push selected worktree', action: 'push' },
    { keys: 'u', label: `Update from ${primaryBranch}`, action: 'update-from-primary' },
    { keys: 'U', label: `Merge into ${primaryBranch}`, action: 'merge-into-primary' },
    { keys: 'w', label: 'Create worktree', action: 'create-worktree' },
    { keys: 'x', label: 'Remove selected worktree', action: 'remove-worktree' },
    { keys: 'g', label: 'View stashes for selected worktree', action: 'view-stashes' },
    { keys: 'r', label: 'Refresh worktrees and changes', action: 'refresh' },
    { keys: 'R', label: 'Change repository', action: 'change-repo' },
    { keys: 'S', label: 'Global settings', action: 'settings' },
    { keys: ',', label: 'Global settings', action: 'settings' },
    { keys: 'm', label: 'Show shortcuts (this menu)', action: 'shortcuts-menu' },
    { keys: 'q', label: 'Quit', action: 'quit' },
  ];
}

export const SHORTCUT_KEY_WIDTH = 8;

export function formatShortcutLine(entry: ShortcutEntry): string {
  const keys = entry.keys.padEnd(SHORTCUT_KEY_WIDTH, ' ');
  return `${keys}${entry.label}`;
}

export function shortcutActionAt(
  primaryBranch: string,
  index: number,
): ShortcutActionId | undefined {
  return tuiShortcutEntries(primaryBranch)[index]?.action;
}
