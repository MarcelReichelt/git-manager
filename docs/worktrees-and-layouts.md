# Worktrees and layouts

The layout comes from that repository's `.git-manager/config.toml`. It is not inferred from folder names, and it is not stored in the registry.

## Workspaces

```toml
layout = "workspaces"
```

```
billing/
├── .git/
├── .workspaces/
│   └── feature/
└── .git-manager/
    └── config.toml
```

The new checkout is `.workspaces/<folder>` inside the repository. The primary checkout stays where it is.

## Sibling

```toml
layout = "sibling"
```

```
src/
├── billing/           # registered repository, the master tree
├── feature/           # worktree, next to the repository
└── feature-login/
```

The folder name comes from the branch. `/`, `\`, and characters that are illegal in a directory name (`< > : " | ? *` and control characters) become `-`. The git branch name stays unchanged. `feature/login` is checked out in a folder named `feature-login`.

Creation stops when that folder already exists.

A remote-only branch is fetched before create hooks run. The worktree is then created from that remote branch.
