# Configuration

The registered-repository list is `~/.config/git-manager/registry.db`. `GIT_MANAGER_REGISTRY_PATH` overrides that path. Each row is a path and a display name. Layout, worktrees, and terminal sessions are not stored there.

## Per-repo: `.git-manager/config.toml`

```toml
[layout]
mode = "workspaces"
workspaces_dir = ".workspaces"

[copy]
files = [".env.local"]

[hooks]
modules = ["./plugins/setup-db.ts"]

[hooks.post_merge]
commands = ["yarn"]
```

`[layout].mode` is `workspaces` or `sibling`. When it is unset, worktree create uses `workspaces`.
