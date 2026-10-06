# Getting started

## Install

Requires **Node.js 20+** and **git** on your `PATH`. The desktop window also needs a display. A new terminal is in-app. App settings can choose a tmux session, or no terminal section.

### From the npm registry

One-time registry setup (per machine or user):

```bash
npm config set @git-worktree-manager:registry https://git.mreichelt.dev/git-worktree-manager/~npm/
```

Global install:

```bash
npm install -g @git-worktree-manager/main
git-worktree-manager --help
```

### From source

```bash
yarn install
yarn build
yarn link:global
yarn desktop
```

## Desktop installers

The npm package is the CLI. The desktop window is an Electron app, built on the operating system it targets:

```bash
yarn pack:desktop
```

The installers are written to `release/`.

| System | Files |
| --- | --- |
| Linux | AppImage and deb |
| Windows | setup exe and portable exe |
| macOS | dmg and zip |

git still has to be on `PATH`. On Linux and macOS the branch terminal can use `tmux`. A `v*` tag builds all three systems and attaches the installers to the GitHub release. An empty release text gets the changelog once. The same workflow can be started by hand.

macOS and Windows packages are unsigned unless `CSC_LINK` points at a code-signing certificate. `CSC_IDENTITY_AUTO_DISCOVERY` stays off so a build without a certificate still finishes.

## Register an existing repo

```bash
git-worktree-manager add --path ~/src/harbor --name Harbor
git-worktree-manager list
```

The list is stored in `~/.config/git-worktree-manager/registry.db`. `GIT_WORKTREE_MANAGER_REGISTRY_PATH` overrides that file. Each row is a path and a display name. Adding the same path again updates the display name.

The desktop card does the same thing. **+** opens Add repository, where the path can be typed or chosen. See [Desktop](desktop.md).

## Open the workspace

```bash
yarn desktop
```

With nothing selected, a centered card lists registered repositories. Choosing one opens that repository's checked-out worktrees.

## Create a worktree

Layout comes from that repository's `.git-worktree-manager/config.toml`. When `[layout].mode` is unset, create uses the app default. A new name creates a local branch at the primary checkout's current commit. An existing local branch is checked out as it is. A branch that exists only on a remote is fetched first.

```bash
git-worktree-manager worktree create feature --repo Harbor
```

The command prints the checkout path. The same action is Create worktree in the desktop sidebar.
