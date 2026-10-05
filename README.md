# git-manager

A desktop workspace and Node CLI for one registered git repository at a time.

Requires **Node.js 20** or later.

## Features

- Desktop window: centered repository card, checked-out worktrees, diffs, commits, and a branch terminal
- Registry of path and display name in `~/.config/git-manager/registry.db`
- Worktree create in the workspaces or sibling layout, from the repository's own config
- Merge into master or update from master, with squash, and worktree remove
- Create hooks: shell commands and TypeScript plugins, including abort
- Repository settings for the checkout location and git remotes

## Install

Requires **Node.js 20+** and **git** on your `PATH`.

```bash
npm config set @git-manager:registry https://git.mreichelt.dev/git-manager/~npm/
npm install -g @git-manager/main

git-manager add --path ~/src/harbor --name Harbor
git-manager list
```

Open the desktop window from a checkout:

```bash
yarn desktop
```

Desktop installers are separate from the npm CLI. `yarn pack:desktop` builds
the package for the machine it runs on: a Linux AppImage and deb, a Windows
setup exe and portable exe, or a macOS dmg and zip. See
[Desktop installers](docs/getting-started.md#desktop-installers).

On minimal Linux (Alpine, slim images), you may need build tools for the
`better-sqlite3` native dependency: `python3`, `make`, and `g++`. See
[Troubleshooting](docs/troubleshooting.md#npm-install-fails).

## Development

Clone the repo and use the local toolchain:

```bash
yarn install
yarn build
yarn link:global   # installs ~/.local/bin/git-manager
yarn test              # unit and integration tests
yarn test:watch        # watch mode
yarn test:e2e          # CLI e2e tests (needs a running Gitea; see docker-compose.e2e.yml)
yarn test:e2e:docker   # full e2e stack in Docker (Gitea + runner)
```

> **Note:** Yarn Berry’s `yarn link` does **not** install a global CLI (unlike npm link). Use `yarn link:global` for local development.

This project uses **Yarn 4 (Berry)** via the vendored release in `.yarn/releases/` (see `packageManager` in `package.json`).

Hook modules are paths in `.git-manager/config.toml`. See [Plugins](docs/plugins.md).

For a reproducible Linux dev environment (including from Windows via Docker), see [.devcontainer/README.md](.devcontainer/README.md).

## Documentation

| Guide | Topic |
| --- | --- |
| [Getting started](docs/getting-started.md) | Install, register, open the workspace |
| [Desktop](docs/desktop.md) | Card, worktrees, diffs, commits, terminal, remotes |
| [CLI reference](docs/cli-reference.md) | add, list, unregister, worktree, merge |
| [Configuration](docs/configuration.md) | Registry file and per-repo TOML |
| [Worktrees & layouts](docs/worktrees-and-layouts.md) | Sibling vs workspaces |
| [Plugins](docs/plugins.md) | Create hooks and plugin modules |
| [Use cases](docs/use-cases.md) | Create, merge, remove, copy, and hooks |
| [Troubleshooting](docs/troubleshooting.md) | Install, create, merge, and registry errors |

## License

MIT — see [LICENSE](LICENSE).
