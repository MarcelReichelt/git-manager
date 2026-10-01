# Use cases

## A branch next to the repository

In `.git-manager/config.toml`:

```toml
layout = "sibling"
```

```bash
git-manager add --path ~/src/billing --name Billing
git-manager worktree create feature/login --repo Billing
```

The checkout is the folder `feature-login` next to `billing`.

## Bring a branch into the master tree

```bash
git-manager merge --repo Billing --into-master-tree feature/login
```

The merge runs in the primary checkout. Add `--squash` to make one commit.

## Update a branch from the master tree

```bash
git-manager merge --repo Billing --from-master-tree feature/login
```

The merge runs in that branch's worktree. The primary checkout stays on its branch.

## Copy a file into each new worktree

```toml
layout = "workspaces"
copy = [".env"]
```

`worktree create` copies `.env` into the new checkout. Edit the copy there.
