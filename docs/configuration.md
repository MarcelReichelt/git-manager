# Configuration

The registered-repository list is `~/.config/git-worktree-manager/registry.db`. `GIT_WORKTREE_MANAGER_REGISTRY_PATH` overrides that path. Each row is a path and a display name. Layout, worktrees, and terminal sessions are not stored there.

An older file, whose `repositories` table is not exactly `path` and `display_name`, is deleted and replaced with an empty registry. Registered repositories are added again. See [ADR 0001](adr/0001-replace-older-registry-file.md).

## Per-repo: `.git-worktree-manager/config.toml`

Paths in this file are relative to the registered repository.

```toml
[layout]
mode = "workspaces"

[copy]
files = [".env.local"]

[hooks]
modules = ["./plugins/mark.ts"]

[hooks.pre_worktree_create]
commands = ["node hooks/mark.mjs"]

[hooks.post_worktree_create]
commands = ["yarn"]
```

`[layout].mode` is `workspaces` or `sibling`. When it is unset, worktree create uses the app default. Any other mode fails with `Unsupported layout`.

`[copy].files` are copied from the registered repository into the new checkout after `git worktree add`. A missing source is skipped.

Hook commands run in the primary checkout. Pre-create commands run before the worktree is added. Post-create commands run after the copied files. Pre-remove commands run before the worktree is deleted. Post-remove commands run after that, and after a requested local branch delete. The environment includes the branch, the worktree path, and the primary checkout path. See [Plugins](plugins.md).

A checkout may also contain `.git-worktree-manager/terminals.toml`. Gitignore `.git-worktree-manager/terminals.override.toml`. The app does not write that entry.

## App settings

App settings live in `~/.config/git-worktree-manager/app-settings.json`. `GIT_WORKTREE_MANAGER_APP_SETTINGS_PATH` overrides that path. The desktop window writes this file. It holds the default layout, the terminal mode, the shell command, the colors, the terminal font, the IDE command, and the arrangement.

`defaultLayout` is `workspaces` or `sibling`. Worktree create uses it when `[layout].mode` is unset. The default is `workspaces`.

`terminalMode` is `terminal`, `tmux`, or `none`. The default is `terminal`. An in-app terminal uses `shellCommand`. A blank command starts the login shell, then `/bin/bash`, then `powershell.exe` on Windows. Tmux mode ignores the shell command. See [Desktop](desktop.md).
