# Worktrees and layouts

## Sibling mode

```
my-project/
├── main/              # primary checkout (folder = default branch)
├── feature-x/         # worktree
└── .git-manager/
```

Registry `path` = `my-project`, `git_root` = `my-project/main`.

## Workspaces mode

```
my-repo/
├── .git/
├── .workspaces/
│   └── feature-x/
└── .git-manager/
```

`.workspaces/` is auto-added to `.gitignore`.

## Auto-detection

On register, sibling mode is used only when the primary checkout folder name matches `primary_branch`. Otherwise workspaces.

Explicit `[layout].mode` in repo config always wins.
