# TUI guide

Launch with `git-manager ui`.

## Layout

The TUI uses a three-stage carousel. Two panels are visible at a time; use `Tab` / `→` and `Shift-Tab` / `←` to move between stages:

| Stage | Left panel | Right panel |
| --- | --- | --- |
| 1 | Registered repos (`*` = active) | Worktrees with change count badges |
| 2 | Worktrees | Changed files for selected worktree |
| 3 | Changed files | Diff for selected file |

The footer shows context-sensitive key hints for the current stage.

Press `m` at any time to open the full shortcuts menu.

## Keybindings

| Key | Action |
| --- | --- |
| Tab / → | Next column (stage) |
| Shift-Tab / ← | Previous column (stage) |
| ↑ / ↓ | Move selection or scroll |
| j / k | Scroll changes list (changes stage) |
| J / Shift-↓ | Jump to next hunk in diff |
| K / Shift-↑ | Jump to previous hunk in diff |
| Enter / o | Set active worktree and open editor |
| p / P | Pull / push selected worktree |
| w | Create worktree (branch picker overlay) |
| x | Remove selected worktree |
| g | View stashes (list, apply, pop, drop, stash all) |
| u | Update from primary |
| U | Merge into primary (confirmation) |
| R | Change repository (picker overlay) |
| S / , | Settings (global config overlay) |
| m | Show shortcuts menu |
| r | Refresh |
| q | Quit |

Auto-refresh interval: `[tui].refresh_interval_ms` in global config.

Large diffs are not loaded inline. When a file exceeds `[tui].diff_max_file_bytes`
(default 512 KB) or `[tui].diff_max_changed_lines` (default 8,000), the diff panel
shows an informational message instead. Set either limit to `0` to disable that
check. Adjust both in TUI settings (`S` / `,`) or global config.
