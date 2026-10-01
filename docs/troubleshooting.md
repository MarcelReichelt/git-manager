# Troubleshooting

## npm install fails

### `404 Not Found` for `@git-manager/main`

npm is querying the public registry. Point the `@git-manager` scope at the project registry (once per machine or user):

```bash
npm config set @git-manager:registry https://git.mreichelt.dev/git-manager/~npm/
```

You can also add this to `~/.npmrc` or a project `.npmrc`.

### `better-sqlite3` / `node-gyp` errors

The registry uses native SQLite bindings. On minimal Linux images, install build tools before `npm install -g`:

```bash
# Debian/Ubuntu
apt-get install python3 make g++

# Alpine
apk add python3 make g++
```

After a Node upgrade, reinstall the package. From a checkout of this repository:

```bash
yarn rebuild better-sqlite3
```

## Repository config does not set a layout

`worktree create` reads `.git-manager/config.toml` in the registered repository. `layout` must be `workspaces` or `sibling`. See [Configuration](configuration.md).

## The worktree folder already exists

Creation stops instead of replacing that folder. Remove or rename it, then run `worktree create` again.

## A create hook aborted

A failing `[hooks.create]` command, or a plugin that returns `'abort'` from `preWorktreeCreate`, stops creation before the worktree is added. The command prints the hook error.
