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

### Desktop installer

`yarn pack:desktop` runs that Electron rebuild, builds the window, and writes
the installer for this operating system to `release/`. Linux produces an
AppImage and a deb. Windows produces a setup exe and a portable exe. macOS
produces a dmg and a zip. The packaged app still needs git on `PATH`.

On Linux the pack launches the unpacked app once. That needs `xvfb-run` and
the usual Electron libraries (GTK, NSS, and a sound library). Set
`GIT_MANAGER_SKIP_DESKTOP_SMOKE=1` to pack without launching. A failed launch
prints `desktop-smoke-timeout` or the native-module error. Rebuild with the
same command after installing the missing library; the Electron binaries in
`native/electron/` are reused while the Electron version is unchanged.

## Unknown command

`add`, `list`, `unregister`, `worktree`, and `merge` are the commands. `clone`, `push`, `pull`, `doctor`, `setup`, `ui`, and `repo` exit with `unknown command`.

## Not a git repository

`git-manager add` and Add repository both require a git directory. The error is `Not a git repository: <path>`. In the dialog that message sits under Location, and Add repository stays disabled.

## Repository not found

`worktree` and `merge` look up `<repo>` as a registered path or display name. A miss is `Repository not found: <repo>`.

## Worktree create

A name that is not a local branch, and that the remote does not have, is created as a local branch at the primary checkout's current commit. It has no upstream until it is pushed.

`Enter a branch name` means the name was empty.

`Branch not found: <branch>` means a known remote-tracking ref was gone after fetch.

A fetch that fails for another reason, such as an unreachable remote, is printed as git reported it. Create stops, and no local branch is added.

`Worktree folder already exists: <path>` means the layout folder is already there. Create stops, and git is unchanged. Remove that folder, or pick another branch name.

`Unsupported layout: <mode>` means `[layout].mode` is set to something other than `workspaces` or `sibling`.

`<plugin name> aborted worktree create` means `preWorktreeCreate` returned `'abort'` before `git worktree add`.

## Worktree remove

`No worktree for branch: <branch>` means that branch has no extra checkout. The primary checkout cannot be removed this way.

## Push

Push in the branch menu publishes a local-only branch. The remote is `origin` when that remote exists, and otherwise the first remote. `No remote to push to` means the repository has no remote. A rejected push is printed as git reported it. The branch stays local-only.

## Merge into master

`Primary checkout is on <branch>, not master` means the registered repository's checkout is not on `master`. Switch that checkout to `master`, then merge again.

## Empty registry after an upgrade

An older `registry.db`, whose `repositories` table is not `path` and `display_name`, is replaced with an empty registry. Add each repository again. See [ADR 0001](adr/0001-replace-older-registry-file.md).

## Plugin load errors

`[hooks].modules` paths are relative to the registered repository, and jiti loads them from there. A command in `[hooks.pre_worktree_create]` or `[hooks.post_worktree_create]` runs with that repository as its working directory.
