# Troubleshooting

## Doctor

```bash
git-manager doctor
git-manager doctor --fix
```

Checks:

- Missing worktree paths
- Orphan registry entries
- Remote branches gone after fetch
- Missing `.git-manager/config.toml`

## Stale registry

If a worktree folder was deleted manually:

```bash
git-manager doctor --fix
```

Or remove via interactive startup prompt.

## Editor not opening

Set editor in config:

```bash
git-manager settings set editor.command cursor
```

Or export `GIT_MANAGER_EDITOR`.

## Plugin load errors

Verify path in `[hooks].modules` is relative to layout root. Global plugins go in `~/.config/git-manager/plugins/`.

## better-sqlite3 rebuild

After Node upgrade:

```bash
yarn rebuild better-sqlite3
```
