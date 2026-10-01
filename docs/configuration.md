# Configuration

Each repository keeps its own `.git-manager/config.toml`. The registry does not store layout, worktrees, or terminal state.

```toml
layout = "workspaces"
copy = [".env"]

[hooks]
plugins = ["./plugins/setup-db.ts"]

[hooks.create]
pre = ["echo creating $GIT_MANAGER_BRANCH"]
post = ["echo created > \"$GIT_MANAGER_WORKTREE/ready.txt\""]
```

`layout` is `workspaces` or `sibling`. `worktree create` fails when this file is missing or the layout is neither of those.

`copy` lists files, relative to the repository, to copy into the new worktree. The copy is a normal file you can edit.

Shell commands in `[hooks.create].pre` run after a remote-only branch is fetched and before the worktree is created. `[hooks.create].post` runs after the worktree exists. A failing command aborts creation. Each command runs in the repository directory with:

- `GIT_MANAGER_BRANCH`
- `GIT_MANAGER_WORKTREE`
- `GIT_MANAGER_REPO`

See [Plugins](plugins.md) for TypeScript hooks.
