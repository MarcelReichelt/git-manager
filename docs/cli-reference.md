# CLI reference

The registry stores each repository's path and display name. Layout is not a registry field.

| Command | Description |
| --- | --- |
| `add --path <path> --name <name>` | Register an existing local git repository. The same path updates the display name |
| `list` | List registered repositories as display name, a tab, and path, ordered by path |
| `unregister --path <path>` | Remove a repository from the registry. The path is the registered absolute path |
| `worktree create <branch> --repo <repo>` | Create a worktree. Prints the checkout path |
| `worktree remove <branch> --repo <repo>` | Remove that branch's extra checkout and keep the branch |
| `merge --repo <repo> --update-from-master <branch>` | Merge `master` into that branch's worktree |
| `merge --repo <repo> --into-master <branch>` | Merge that branch into `master` on the primary checkout |

`<repo>` is a registered path or display name. `--squash` squashes that merge into one commit. Pass only one of `--update-from-master` or `--into-master`.

`worktree create` checks the branch out as it already exists locally. A new name creates a local branch at the primary checkout's current commit, with no upstream. A branch that exists only on a remote is fetched first, then checked out as a new local branch tracking that remote. See [Worktrees and layouts](worktrees-and-layouts.md) for which remote is fetched. When the remote has no such branch, create still adds the local branch. When `git fetch` fails for another reason, that error is printed. When a known remote-tracking ref is gone after fetch, create fails with `Branch not found`. An empty name fails with `Enter a branch name`. The folder name replaces path separators and illegal characters with `-`, and create stops when that folder already exists. The primary checkout is left on its current branch.

`worktree remove` refuses the primary checkout with `No worktree for branch`.

`--into-master` requires the primary checkout to be on `master`. Otherwise the error is `Primary checkout is on <branch>, not master`.

`git-manager <command> --help` prints the flags for one command.
