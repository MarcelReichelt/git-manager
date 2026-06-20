# TUI guide

Launch with `git-manager ui`.

## Layout

- Top: registered repo names (`*` = active)
- Left: worktrees with change count badges
- Right: changes for selected worktree
- Footer: key hints

## Keybindings

| Key | Action |
| --- | --- |
| Tab | Switch focus (worktrees / changes) |
| Up/Down | Move selection (worktrees) or scroll (changes) |
| j / k | Focus changes + scroll |
| Enter / o | Set active + open editor |
| p / P | Pull / push |
| w | Create worktree (branch picker overlay) |
| x | Remove selected worktree |
| M / m | Merge into / from primary |
| R | Change repository (picker overlay) |
| S / , | Settings (global config overlay) |
| r | Refresh |
| q | Quit |

Auto-refresh interval: `[tui].refresh_interval_ms` in global config.
