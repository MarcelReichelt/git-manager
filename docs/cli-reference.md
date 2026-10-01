# CLI reference

The registry stores each repository's path and display name. Layout is not a registry field.

| Command | Description |
| --- | --- |
| `add --path <path> --name <name>` | Register an existing local git repository |
| `list` | List registered repositories as display name and path |
| `unregister --path <path>` | Remove a repository from the registry |
| `worktree create <branch> --repo <repo>` | Create a worktree. Prints the checkout path |
| `worktree remove <branch> --repo <repo>` | Remove that branch's worktree and keep the branch |
| `merge --repo <repo> --update-from-master <branch>` | Bring master into that branch's worktree |
| `merge --repo <repo> --into-master <branch>` | Merge that branch into master on the primary checkout |

`<repo>` is a registered path or display name. `--squash` squashes that merge into one commit. Pass only one of `--update-from-master` or `--into-master`.

`git-manager <command> --help` prints the flags for one command.
