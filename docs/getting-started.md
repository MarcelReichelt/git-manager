# Getting started

## Install

Requires **Node.js 20+** and **git** on your `PATH`.

### From the npm registry

One-time registry setup (per machine or user):

```bash
npm config set @git-manager:registry https://git.mreichelt.dev/git-manager/~npm/
```

Global install:

```bash
npm install -g @git-manager/main
git-manager --version
```

Or run without installing:

```bash
npx @git-manager/main setup
```

### From source

For contributors working in the cloned repository:

```bash
yarn install
yarn build
yarn link:global
```

## First run

Run `git-manager` with no arguments. The setup wizard configures:

1. Editor command (`cursor`, `code`, `nvim`, …)
2. Default clone location (`~/DEV`)
3. Default layout mode (sibling or workspaces)
4. TUI refresh interval

## Register an existing repo

Inside a git repository:

```bash
git-manager register
# or
git-manager repo add
```

## Clone a new repo

```bash
git-manager clone https://github.com/user/my-app.git
```

Clones to `<clone_root>/<repo-name>/` using your configured layout.

## Switch repository

```bash
git-manager repo switch
```

The picker lists registered repos plus options to clone new or add existing.

## Switch worktree

```bash
git-manager worktree list
git-manager worktree switch feature-x
git-manager worktree open
```

## TUI

```bash
git-manager ui
```

See [TUI guide](tui-guide.md) for keybindings.
