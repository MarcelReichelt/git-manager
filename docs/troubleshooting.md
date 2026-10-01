# Troubleshooting

## npm install fails

### `404 Not Found` for `@git-manager/main`

npm is querying the public registry. Point the `@git-manager` scope at the
project registry (once per machine or user):

```bash
npm config set @git-manager:registry https://git.mreichelt.dev/git-manager/~npm/
```

You can also add this to `~/.npmrc` or a project `.npmrc`.

### `better-sqlite3` / `node-gyp` errors

The package depends on native SQLite bindings. On minimal Linux images, install
build tools before `npm install -g`:

```bash
# Debian/Ubuntu
apt-get install python3 make g++

# Alpine
apk add python3 make g++
```

After a Node upgrade, reinstall the package or rebuild the dependency. When
working from a cloned repo:

```bash
yarn rebuild better-sqlite3
```

That rebuilds the binding for the Node CLI. `yarn desktop` keeps a second copy
of `better-sqlite3` and `node-pty`, compiled for Electron, in `native/electron/`.

### `git-manager ui` fails with `Cannot find module .../dist/tui/index.js`

Versions before `0.2.4` were published without the TUI bundle. Upgrade:

```bash
npm install -g @git-manager/main@latest
```

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
