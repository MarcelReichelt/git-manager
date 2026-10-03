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
The desktop script rebuilds those addons when that copy is missing, or when it
was built for a different Electron version, platform, CPU, or addon version.
The build needs
the same `python3`, `make`, and `g++` packages, plus network access to the
Electron headers.

## Unknown command

`add`, `list`, `unregister`, `worktree`, and `merge` are the commands. `clone`, `push`, `pull`, `doctor`, `setup`, `ui`, and `repo` exit with `unknown command`.

## Not a git repository

`git-manager add` and Add repository both require a git directory. The error is `Not a git repository: <path>`. In the dialog that message sits under Location, and Add repository stays disabled.

## Repository not found

`worktree` and `merge` look up `<repo>` as a registered path or display name. A miss is `Repository not found: <repo>`.

## Worktree create

`Branch not found: <branch>` means the name is neither a local branch nor a branch on a remote after fetch.

`Worktree folder already exists: <path>` means the layout folder is already there. Create stops, and git is unchanged. Remove that folder, or pick another branch name.

`Unsupported layout: <mode>` means `[layout].mode` is set to something other than `workspaces` or `sibling`.

`<plugin name> aborted worktree create` means `preWorktreeCreate` returned `'abort'` before `git worktree add`.

## Worktree remove

`No worktree for branch: <branch>` means that branch has no extra checkout. The primary checkout cannot be removed this way.

## Merge into master

`Primary checkout is on <branch>, not master` means the registered repository's checkout is not on `master`. Switch that checkout to `master`, then merge again.

## Empty registry after an upgrade

An older `registry.db`, whose `repositories` table is not `path` and `display_name`, is replaced with an empty registry. Add each repository again. See [ADR 0001](adr/0001-replace-older-registry-file.md).

## Plugin load errors

`[hooks].modules` paths are relative to the registered repository, and jiti loads them from there. A command in `[hooks.pre_worktree_create]` or `[hooks.post_worktree_create]` runs with that repository as its working directory.
