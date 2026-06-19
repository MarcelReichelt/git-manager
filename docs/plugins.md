# Plugins

Plugins are TypeScript or JavaScript modules implementing `GitManagerPlugin`.

## Load order

1. `~/.config/git-manager/plugins/` from `[hooks].global_modules`
2. Repo-local paths from `[hooks].modules`

Loaded via **jiti** — no separate compile step.

## Hook actions

Each supports `pre_*` and `post_*`:

- `clone`, `register`, `worktree_create`, `worktree_remove`
- `worktree_pull`, `worktree_push`, `merge`

Pre hooks may return `'abort'` to cancel the action.

## Example

See `plugins/setup-db.ts`, `plugins/install-deps.ts`, `plugins/merge-guard.ts`.

```toml
[hooks.post_worktree_create]
database_port = 5433
```

Plugin receives `hookConfig` with action-specific keys.
