# Getting started

## Install

Requires **Node.js 20+** and **git** on your `PATH`.

### From the npm registry

One-time registry setup (per machine or user):

```bash
npm config set @git-manager:registry https://git.mreichelt.dev/git-manager/~npm/
npm install -g @git-manager/main
git-manager --version
```

### From source

```bash
yarn install
yarn build
yarn link:global
```

## Register a repository

`git-manager` does not clone. Point it at a local checkout and give it a display name:

```bash
git-manager add --path ~/src/billing --name Billing
git-manager list
```

The registry file is `~/.config/git-manager/registry.db`. `GIT_MANAGER_REGISTRY_PATH` overrides that location. Each registered repository is a path and a display name.

Remove one with:

```bash
git-manager unregister --path ~/src/billing
```

## Layout

Before creating a worktree, set the layout in that repository's `.git-manager/config.toml`:

```toml
layout = "workspaces"
```

`workspaces` puts each checkout under `.workspaces` in the repository. `sibling` puts it in a folder next to the repository, named from the branch. See [Worktrees and layouts](worktrees-and-layouts.md).

## Create a worktree

```bash
git-manager worktree create feature --repo Billing
```

The command prints the checkout path.
