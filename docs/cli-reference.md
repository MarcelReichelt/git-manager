# CLI reference

## Commands

| Command | Description |
| --- | --- |
| `add --path <path> --name <name>` | Register an existing local git repository |
| `list` | List registered repositories as display name and path |
| `unregister --path <path>` | Remove a repository from the registry |
| `worktree create <branch> --repo <repo>` | Create a worktree. Prints the checkout path |
| `worktree remove <branch> --repo <repo>` | Remove that branch's worktree |
| `merge --repo <repo>` | Merge into the master tree, from the master tree, or from an explicit source into an explicit target |

`<repo>` is a registered path or display name. The master tree is the primary checkout of that repository.

## Merge

```bash
git-manager merge --repo Billing --into-master-tree feature
git-manager merge --repo Billing --from-master-tree feature
git-manager merge --repo Billing --source feature --target trunk
```

`--squash` squashes that merge into one commit. Use either the master-tree options or `--source` and `--target`, not both.

`git-manager <command> --help` prints the flags for one command.
