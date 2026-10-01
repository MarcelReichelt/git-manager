# v1 design choices

Survey of the git-manager CLI and Ink TUI as implemented on `master` (`febc4d4`, package `0.2.5` in `package.json`). Each claim cites the file that owns the behavior. The v2 brief is used only to mark which of those choices it still describes. This note does not say what v2 should keep.

The running list in both the CLI and the TUI is a list of **worktrees** (checked-out folders), not a list of every local and remote branch.

## Layouts

### What the code does

Two directory modes, `sibling` and `workspaces` (`src/config/schema.ts`). The global default is `workspaces` (`src/config/schema.ts`, `defaults.layout_mode`). Per-repo `[layout].mode` is stored in `.git-manager/config.toml` (`src/config/paths.ts`, `docs/worktrees-and-layouts.md`).

**Workspaces.** Extra checkouts go under `<git root>/<workspaces_dir>/<name>`, and `workspaces_dir` defaults to `.workspaces` (`src/core/context.ts`, `worktreePathForBranch`; `src/config/schema.ts`). On create, that directory name is appended to `.gitignore` if it is missing (`src/core/worktree-service.ts`, `ensureGitignoreEntry` in `src/core/git-service.ts`). Clone into this mode puts the git root at the layout root and writes the same gitignore entry (`src/commands/clone.ts`).

**Sibling.** The layout root is the parent of the primary checkout. The primary folder is named the default branch (`src/commands/clone.ts` renames the clone to `join(layoutRoot, defaultBranch)`). Further checkouts are siblings of that folder, `join(layoutRoot, name)` (`src/core/context.ts`). Registry `path` is the parent; `git_root` is the primary checkout (`docs/worktrees-and-layouts.md`, written by `src/core/register-service.ts`).

Folder and label names replace each `/` in the branch with `-`. The git branch itself keeps the slash (`src/core/context.ts`, `worktreePathForBranch`; `src/core/worktree-service.ts` sets `label` the same way). The primary worktree's label is the primary branch name, not a sanitized extra folder (`src/core/worktree-service.ts`, `syncWorktreesFromGit`).

On register, if `[layout].mode` is unset, sibling is chosen only when the primary checkout's folder name equals the primary branch; otherwise workspaces. An explicit mode is written back into repo config (`src/core/context.ts`, `resolveFromGitRoot`). If the saved mode is sibling but the folder name does not match the primary branch, resolution forces workspaces (`src/core/context.ts`).

**TUI screen.** `git-manager ui` renders an Ink carousel of three stages, two panels at a time (`src/tui/carousel.ts`, `src/tui/index.tsx`, `docs/tui-guide.md`):

| Stage | Left | Right |
| --- | --- | --- |
| Repos | Registered repos | Worktrees |
| Worktrees | Worktrees | Working-tree changes for the selected worktree |
| Changes | Those files, selectable | Unified diff of the selected file |

`Tab` / arrows move columns. The focused panel border is cyan; the other is gray (`src/tui/layout.ts`, `panelBorderColor`). There is no mouse hover and no on-screen button row. Actions are keys, listed in the footer (`src/tui/layout.ts`, `footerActionsForStage`; `src/tui/components/Footer.tsx`).

The bare `git-manager` command is a separate inquirer menu (open, changes, switch worktree, change repo, pull, push, create, merge into/from primary, settings, launch TUI), not the Ink screen (`src/commands/default.ts`).

### Still described by the v2 brief

Two create placements: subfolders under `.workspaces`, and sibling folders next to the primary checkout whose folder name comes from the branch name (`src/core/context.ts`).

### A full replacement would throw away

- The slash-to-hyphen folder and label rule (`src/core/context.ts`). The brief says the sibling folder name is the branch name.
- Auto-detection from the primary folder name, and the override that forces workspaces when a saved sibling mode does not match that name (`src/core/context.ts`).
- The three-stage carousel, the diff column, footer key hints, and the separate inquirer main menu (`src/tui/index.tsx`, `src/commands/default.ts`). The brief's screen is a branch list with a create control at the bottom and hover menus.

## Worktree create

### What the code does

CLI: `worktree create <branch>` with optional `--new` (`src/cli.ts`). That calls `createWorktree` with `newBranch` set only when `--new` is passed (`src/commands/worktree.ts`).

TUI: `w` on the worktree or changes stage opens a modal titled "Create worktree — pick branch" (`src/tui/index.tsx`, `src/tui/overlays/CreateWorktreeOverlay.tsx`). It is not a control on the worktree list. The list itself has no trailing create row (`src/tui/panels/WorktreePanel.tsx`).

The modal loads local and remote branch names, drops any branch that already has a worktree, sorts them, and appends "+ Create new branch…" (`src/tui/overlays/create-worktree.ts`, `loadCreateOverlayBranches`; `src/tui/layout.ts`, `branchesAvailableForWorktree`). Loading remote names calls `fetch --all --prune` first (`src/core/git-service.ts`, `listRemoteBranches`). Choosing the new-branch row switches the modal to a name field. The name must match `^[A-Za-z0-9._/-]+$` (`src/tui/overlays/create-worktree.ts`).

`createWorktree` (`src/core/worktree-service.ts`) then:

1. Refuses the path if it already exists.
2. Runs `worktree_create` **pre** hooks with cwd set to the not-yet-created path (`src/core/hook-runner.ts` passes that cwd to the shell).
3. Runs `fetch --all --prune` on the git root.
4. Adds the worktree (`src/core/git-service.ts`, `addWorktree`):
   - `--new`, or the modal's new-name path when no local branch exists: `git worktree add -b <branch> <path>`.
   - Local branch already exists: `git worktree add <path> <branch>`.
   - No local branch, `origin/<branch>` exists: `git worktree add -b <branch> <path> origin/<branch>`.
   - Neither local nor remote: still `git worktree add -b` (creates the branch).
5. In workspaces mode, ensures the workspaces dir is gitignored.
6. Copies files listed in `[copy].files` from the git root into the new worktree (`src/core/copy-service.ts`). Missing sources are skipped with a warning. Nothing opens those files in an editor.
7. Records the worktree and runs `worktree_create` **post** hooks.
8. Makes it the active worktree unless `activate: false`.

The inquirer main menu's create action lists **remote** branches only (that list also fetches), then calls create without `--new` (`src/commands/default.ts`). A remote-only name therefore hits the tracking `add -b` path above. The CLI `branch list` command prints `origin/<name>` lines and does not show local-only branches (`src/commands/branch.ts`).

The worktree panel never lists a branch that has no checkout. Remote-only names appear in the create modal and in `branch list`, not as rows you can select for status (`src/tui/panels/WorktreePanel.tsx`).

### Still described by the v2 brief

Creating a checkout of a remote-only branch and creating a new local branch both go through the same `worktree_create` hooks (`src/core/worktree-service.ts`). A remote-only branch is fetched (`fetch --all`) and then checked out as a new local branch tracking `origin/<branch>` (`src/core/git-service.ts`).

### A full replacement would throw away

- Create as the `w` key and a centered branch-picker modal (`src/tui/overlays/CreateWorktreeOverlay.tsx`). The brief puts a create button at the bottom of the branch list.
- Pre-hooks running **before** that fetch. Inside `createWorktree` the order is pre-hooks, then fetch, then `worktree add`, then file copy, then post-hooks (`src/core/worktree-service.ts`). The brief fetches a remote-only branch first, then runs the same hooks.
- A main list that contains only existing worktrees, so remote-only branches are not rows (`src/tui/panels/WorktreePanel.tsx`).

## Hooks and plugins

### What the code does

Two mechanisms, both skipped by `--no-hooks`, `--no-pre-hooks`, or `--no-post-hooks` (`src/cli.ts`, `src/core/hook-runner.ts`).

**Shell commands.** For a phase and action, `[hooks.<phase>_<action>].commands` in the repo TOML is executed with `shell: true` and inherited stdio (`src/config/loader.ts`, `getHookCommands`; `src/core/hook-runner.ts`). A failing pre command aborts the action. A failing post command is logged and the action continues. These sections are read from the raw TOML file. The Zod repo schema only keeps `hooks.modules`, so command lists are not part of the parsed config object (`src/config/schema.ts`).

**Plugins.** TypeScript or JavaScript modules implementing `GitManagerPlugin`, loaded with jiti (`src/hooks/types.ts`, `src/core/hook-runner.ts`, `docs/plugins.md`). Order: files named in global `[hooks].global_modules`, resolved under `~/.config/git-manager/plugins/`, then repo `[hooks].modules` resolved from the layout root. A pre method that returns `'abort'` throws `HookAbortError` and the CLI exits 0 (`src/hooks/types.ts`, `src/cli.ts`).

Actions that have pre and post methods: `clone`, `register`, `worktree_create`, `worktree_remove`, `worktree_pull`, `worktree_push`, `merge` (`src/config/schema.ts`, `src/hooks/types.ts`). Plugin methods receive `hookConfig` for that `[hooks.<phase>_<action>]` table (`src/core/hook-runner.ts`).

File copy on create is not a hook. It is `[copy].files` (`src/core/copy-service.ts`). The configuration example lists `.env.local` (`docs/configuration.md`). The copy is a byte copy from the primary git root. No step edits the copy.

The bundled `plugins/setup-db.ts` `postWorktreeCreate` reads `hookConfig.database_port` (default 5432) and logs `Would start database on port …`. It does not create a database. `plugins/install-deps.ts` logs a reminder on `postMerge`. `plugins/merge-guard.ts` returns `'abort'` from `preMerge` when the direction is `into-primary` and the source branch name contains `wip`.

### Still described by the v2 brief

Creating a worktree can run shell commands and plugins (`src/core/hook-runner.ts`). A configured env file can be copied into the new checkout (`src/core/copy-service.ts`). A plugin slot exists whose example is tied to a database port on create (`plugins/setup-db.ts`).

### A full replacement would throw away

- Copy-without-edit. Nothing in `src/core/copy-service.ts` opens or rewrites the copied file. The brief's create step can copy a `.env` and edit it.
- The database example as a log line only (`plugins/setup-db.ts`). The brief's create step can create a database.
- Hook coverage for clone, register, pull, and push, and the global/repo module split, the `'abort'` return, and the `--no-hooks` flags (`src/hooks/types.ts`, `src/cli.ts`). The brief talks about scripts, hooks, or plugins on create, not this table of actions.

## Merge and remove

### What the code does

**Remove.** `worktree remove <label>` (`src/cli.ts`). If the worktree is dirty and `--force` was not passed, the CLI asks before forcing (`src/commands/worktree.ts`). The TUI `x` key calls `removeWorktreeEntry` with no confirm and no force (`src/tui/index.tsx`). That runs `worktree_remove` pre hooks, `git worktree remove` (with `--force` only when asked), deletes the registry row, then post hooks (`src/core/worktree-service.ts`, `src/core/git-service.ts`). The primary worktree is not excluded. Unregistering a repository deletes the registry row and leaves files on disk (`src/commands/repo.ts`).

**Merge.** `git merge <sourceBranch>` in the target checkout. No `--squash` anywhere in `src/` (`src/core/git-service.ts`, `mergeBranch`). Three directions (`src/core/merge-service.ts`):

- `into-primary`: source worktree into the primary checkout.
- `from-primary`: primary branch into another worktree.
- `worktree-to-worktree`: CLI `merge <source> <target>` only (`src/cli.ts`). The service rejects using this path when the target is primary.

Each direction runs `merge` pre hooks, optionally requires a clean tree (`--force` skips that), fetches, pulls a side when it tracks a remote, merges, and runs post hooks. Conflicts print the conflicted paths and rethrow (`src/core/merge-service.ts`). `from-primary` can stash the primary (only if it will pull) and the target, then pop those stashes (`src/core/merge-service.ts`).

TUI keys, only on the worktree and changes stages (`src/tui/shortcuts.ts`):

- `U` opens a Yes/Cancel dialog, then merges the selected worktree into primary (`src/tui/overlays/MergeOverlay.tsx`).
- `u` updates the selected worktree from primary. If the primary is behind its remote, or either side is dirty, a step dialog offers pull and stash; otherwise it merges immediately (`src/tui/overlays/merge-worktree.ts`, `src/tui/index.tsx`).
- Both refuse when the selection is already the primary (`src/tui/overlays/merge-worktree.ts`, `primarySyncBlockedMessage`).

The inquirer menu offers the same two primary directions and not worktree-to-worktree (`src/commands/default.ts`). There is no hover menu. Merge and remove are keys (`U`, `u`, `x`) plus the shortcuts overlay opened with `m` (`src/tui/shortcuts.ts`).

### Still described by the v2 brief

A checkout can be removed, and a branch can be merged into another (`src/core/worktree-service.ts`, `src/core/merge-service.ts`).

### A full replacement would throw away

- Squash. It is not implemented. The brief makes squash part of merge.
- Hover placement of merge and remove. v1 uses keys and modal confirms (`src/tui/index.tsx`).
- Two named directions (into primary, from primary) plus a third CLI-only worktree-to-worktree merge, with clean-tree checks and optional auto-stash (`src/core/merge-service.ts`).
- Remove of a dirty worktree: CLI prompts, TUI does not (`src/commands/worktree.ts`, `src/tui/index.tsx`).

## Repository registry

### What the code does

One SQLite file, default `~/.config/git-manager/registry.db`, overridable with `GIT_MANAGER_REGISTRY_PATH` (`src/config/paths.ts`, `src/core/registry.ts`). WAL mode. Tables:

- `repositories`: name, unique `path` (layout root), `git_root`, `primary_branch`, `remote_url`, `layout_mode`, `last_opened_at`.
- `worktrees`: branch, unique path, label, `is_primary`, per repository.
- `active_sessions`: one active worktree per repository.
- `global_state`: one row, the active repository id.

`repo list` prints `* name (layout_mode)`. The `--changes` flag is accepted and ignored (`src/cli.ts`, `src/commands/repo.ts`). `repo current` prints `name / label (branch)` (`src/commands/repo.ts`).

Switching in the CLI is `repo switch [name]`, an inquirer list ordered by `last_opened_at`, with the active name marked `*`, plus "+ Clone new repository…" and "+ Add existing repository…" (`src/commands/repo.ts`). Clone and add from that picker do register the repo (`src/commands/clone.ts`, `src/commands/repo.ts`).

Switching in the TUI is three keyboard surfaces, not a hover control (`src/tui/index.tsx`):

- A one-line header of every repo name. The active name is green and prefixed with `*`. The same line ends with gray text `[R] change repo`.
- `R` opens a "Change repository" modal of names plus clone and add (`src/tui/overlays/RepoPickerOverlay.tsx`). Choosing clone or add does not clone or add; it closes and tells you to use the shell (`src/tui/overlays/repo-picker.ts`). The add hint says `git-manager add [path]`; the real commands are `repo add` and `register` (`src/cli.ts`).
- The repos carousel column. Moving the selection activates that repo (`src/tui/index.tsx`, `selectRepo`).

Activation stores the repository id, updates `last_opened_at`, and selects the session worktree or the primary (`src/core/registry.ts`, `src/core/active-session.ts`). Worktrees are re-read from `git worktree list` on activate and on a timer (`src/core/worktree-service.ts`, `syncWorktreesFromGit`; `src/tui/index.tsx` uses `tui.refresh_interval_ms`, default 2000 in `src/config/schema.ts`).

### Still described by the v2 brief

A global registry of local git paths, and a control that switches the active repository (`src/core/registry.ts`, `src/tui/index.tsx`).

### A full replacement would throw away

- SQLite rows for worktrees, sessions, layout mode, and last-opened time (`src/core/registry.ts`). The brief says a registry of local git paths.
- The header name strip, the `R` modal, and the repos column (`src/tui/index.tsx`). The brief's switch is a hover control next to the repo name.
- Clone and add living inside the CLI picker and only as dead ends in the TUI modal (`src/commands/repo.ts`, `src/tui/overlays/repo-picker.ts`).

## How branch status is shown

### What the code does

A worktree row is `> * <label> [<count>]` (`src/tui/panels/WorktreePanel.tsx`). `*` means the active worktree. `>` and cyan mean the keyboard selection. `[count]` is the number of changed paths: staged + modified + created + deleted + renamed + untracked + conflicted (`src/core/changes-service.ts`, `totalCount`). Zero is `[0]`. No other color is applied to the row. Nothing on the row says local-only, remote-only, or "remote deleted", and nothing prints commits ahead or behind.

The header's active **repository** name is green (`src/tui/index.tsx`). That green is "this repo is active", not "this branch exists on a remote".

Selecting a worktree fills the changes panel with working-tree sections: Staged, Modified, Added (includes deleted paths, marked `D`), Renamed (`original -> path`), Untracked, Conflicted (`src/tui/panels/ChangesPanel.tsx`). Lines are status letter plus path. They are not `+added / -deleted` counts per file. A clean worktree shows the word `Clean` in green. The CLI `changes` command prints the same sections without the diff (`src/commands/changes.ts`). The default menu header is `name / label (branch)` plus `(clean)` or `(N changes)` (`src/core/status-display.ts`).

The third stage loads a unified diff of the selected file (`src/tui/panels/DiffPanel.tsx`, `src/core/git-service.ts`, `getFileDiff`). Added diff lines are green, removed lines are red, hunk headers are cyan. Untracked files are shown as `+` lines (`src/core/git-service.ts`, `readUntrackedAsDiff`). Files over `diff_max_file_bytes` (512000) or `diff_max_changed_lines` (8000) are not loaded; those limits count added plus deleted lines from `git diff --numstat` (`src/core/diff-load-policy.ts`, `src/config/schema.ts`). That numstat is a gate, not a per-file count in the list.

Ahead/behind is `git rev-list --left-right --count @{upstream}...HEAD` (`src/core/git-service.ts`, `getAheadBehind`). Callers are pull/push hook context, a push warning when behind, and the "update from primary" precheck (`src/core/sync-service.ts`, `src/core/merge-service.ts`). `getSyncStatus` is only used from tests (`tests/sync-service.test.ts`). No screen lists commits that exist only on the selected branch. There is no `git log` in `src/`.

### Still described by the v2 brief

Each listed checkout shows a changed-file count (`src/tui/panels/WorktreePanel.tsx`). Selecting one shows that checkout's changed files (`src/tui/panels/ChangesPanel.tsx`).

### A full replacement would throw away

- Status as a count badge and a cyan selection, with no tracking-state color (`src/tui/panels/WorktreePanel.tsx`). The brief's status is a color only: light blue local-only, green local and remote, yellow remote-only, red local whose remote was deleted, plus the count and commits ahead/behind.
- Ahead/behind kept off the list (`src/core/git-service.ts` computes it; `src/tui/panels/WorktreePanel.tsx` does not render it).
- Change lines as status letters and paths, plus a separate diff pane (`src/tui/panels/ChangesPanel.tsx`, `src/tui/panels/DiffPanel.tsx`). The brief's selection shows lines added and deleted per file, and commits that exist only on that branch.
- The list containing only worktrees, so yellow "remote only" rows and red "remote deleted" rows have no place to appear (`src/tui/panels/WorktreePanel.tsx`).
