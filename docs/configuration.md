# Configuration

The registered-repository list is `~/.config/git-manager/registry.db`. `GIT_MANAGER_REGISTRY_PATH` overrides that path. Each row is a path and a display name. Layout, worktrees, and terminal sessions are not stored there.

An older file, whose `repositories` table is not exactly `path` and `display_name`, is deleted and replaced with an empty registry. Registered repositories are added again. See [ADR 0001](adr/0001-replace-older-registry-file.md).

## Per-repo: `.git-manager/config.toml`

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

Hook commands run in the registered repository. Pre-create commands run before the worktree is added. Post-create commands run after the copied files. See [Plugins](plugins.md).
