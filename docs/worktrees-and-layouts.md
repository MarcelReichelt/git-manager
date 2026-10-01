# Worktrees and layouts

Layout is a per-repository choice in `.git-manager/config.toml`. The registry does not store it. When `[layout].mode` is unset, create uses the workspaces layout.

## Workspaces

```
my-repo/
├── .git/
├── .workspaces/
│   └── feature-x/
└── .git-manager/
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

A branch name that is not a legal directory name is sanitized by turning path separators and illegal characters into `-`. `feature/foo` is checked out in `feature-foo`. The git branch name stays `feature/foo`. Creation stops when that folder already exists.
