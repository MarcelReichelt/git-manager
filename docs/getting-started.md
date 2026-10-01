# Getting started

## Install

Requires **Node.js 20+** and **git** on your `PATH`. The desktop window also needs a display. On Linux and macOS the branch terminal uses `tmux`.

### From the npm registry

One-time registry setup (per machine or user):

```bash
npm config set @git-manager:registry https://git.mreichelt.dev/git-manager/~npm/
```

Global install:

```bash
npm install -g @git-manager/main
git-manager --help
```

### From source

```bash
yarn install
yarn build
yarn link:global
yarn desktop
```

## Register an existing repo

```bash
git-manager add --path ~/src/harbor --name Harbor
git-manager list
```

The list is stored in `~/.config/git-manager/registry.db`. `GIT_MANAGER_REGISTRY_PATH` overrides that file. Each row is a path and a display name.

## Open the workspace

```bash
yarn desktop
```

With nothing selected, a centered card lists registered repositories. Choosing one shows that repository's branches.

## Create a worktree

Layout comes from that repository's `.git-manager/config.toml`. When `[layout].mode` is unset, the checkout goes under `.workspaces`.

```bash
git-manager worktree create feature --repo Harbor
```
