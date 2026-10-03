# Use cases

## Parallel feature development

Register the repository, then check out a branch that already exists locally or on a remote:

```bash
git-manager add --path ~/src/harbor --name Harbor
git-manager worktree create feature/login --repo Harbor
```

The command prints the checkout path. In the desktop window, Create worktree does the same thing, and the new checkout appears in the Worktrees sidebar.

## Update a branch from master

```bash
git-manager merge --repo Harbor --update-from-master feature/login
```

The desktop branch menu runs the same merge with Update from master. That merges `master` into the branch's worktree.

## Squash a branch into master

The primary checkout is on `master`:

```bash
git-manager merge --repo Harbor --into-master feature/login --squash
```

The desktop Merge into master dialog has the same Squash checkbox. Omit `--squash` for a regular merge.

## Remove the extra checkout

```bash
git-manager worktree remove feature/login --repo Harbor
```

The branch remains. The primary checkout is left in place. Remove worktree in the branch menu does the same thing.

## Copy a file into each new worktree

```toml
[copy]
files = [".env.local"]
```

Create copies each file that exists in the registered repository. A missing file is skipped, and the checkout is still created.

## Run a command after create

```toml
[hooks.post_worktree_create]
commands = ["yarn"]
```

The command runs in the registered repository after checkout and after the copied files.
