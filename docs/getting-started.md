# Getting started

## Install

Requires **Node.js 20+** and **git** on your `PATH`. The desktop window also needs a display. A new terminal is in-app. App settings can choose a tmux session, or no terminal section.

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

The list is stored in `~/.config/git-manager/registry.db`. `GIT_MANAGER_REGISTRY_PATH` overrides that file. Each row is a path and a display name. Adding the same path again updates the display name.

The desktop card does the same thing. **+** opens Add repository, where the path can be typed or chosen. See [Desktop](desktop.md).

## Open the workspace

```bash
yarn desktop
```

With nothing selected, a centered card lists registered repositories. Choosing one opens that repository's checked-out worktrees.

## Create a worktree

Layout comes from that repository's `.git-manager/config.toml`. When `[layout].mode` is unset, create uses the app default. A new name creates a local branch at the primary checkout's current commit. An existing local branch is checked out as it is. A branch that exists only on a remote is fetched first.

```bash
git-manager worktree create feature --repo Harbor
```

The command prints the checkout path. The same action is Create worktree in the desktop sidebar.
