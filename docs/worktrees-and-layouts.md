# Worktrees and layouts

Layout is a per-repository choice in `.git-worktree-manager/config.toml`. The registry does not store it. When `[layout].mode` is unset, create uses the app default.

## Workspaces

```
my-repo/
├── .git/
├── .workspaces/
│   └── feature-x/
└── .git-worktree-manager/
    └── config.toml
```

## Sibling

```toml
[layout]
mode = "sibling"
```

```
src/
├── my-repo/           # primary checkout
└── feature-x/         # worktree next to the repository, named from the branch
```

A branch name that is not a legal directory name is sanitized by turning path separators and illegal characters into `-`. `feature/foo` is checked out in `feature-foo`. The git branch name stays `feature/foo`. Creation stops when that folder already exists, and git is left unchanged.

## Create

The name can be a local branch, a branch on a remote, or a new name. A local branch is checked out as it is. A branch that exists only as a remote-tracking ref is fetched from that remote first, then added with `--track` as a new local branch. `origin` is chosen when it has the branch, and also when no remote-tracking ref has the branch yet. When several remotes have it, `origin` wins. When that fetch finds the branch, it is checked out with `--track`. When the name is not a local branch and the remote reports that it has no such branch, or the repository has no remote, create adds a new local branch at the primary checkout's current commit. That branch has no upstream. When `git fetch` fails for another reason, that error is printed. When a known remote-tracking ref is gone after fetch, create fails with `Branch not found`.

The primary checkout stays on its current branch. Configured files are copied into the new checkout after `git worktree add`. See [Configuration](configuration.md).

## Remove

`worktree remove` deletes the extra checkout for that branch and keeps the branch. The primary checkout is not a removable worktree.
