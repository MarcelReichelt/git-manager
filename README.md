# git-manager

A TypeScript CLI and TUI for managing git repositories with worktrees, push/pull, merges, hooks, and a global registry.

Requires **Node.js 20** or later.

## Features

- Global repository registry with active repo and worktree context
- Two layout modes: sibling folders or `.workspaces/` inside the repo
- Clone, register, and unified repo picker (switch / clone / add)
- Worktree create, remove, push, pull, and merge flows
- Working tree changes and diff view in CLI and carousel TUI
- Stash list, create, apply, pop, and drop from the TUI
- Pre/post hooks via declarative commands and TypeScript plugins (jiti)
- First-run setup wizard and in-tool settings
- Registry health checks via `doctor`

## Install

Requires **Node.js 20+** and **git** on your `PATH`.

```bash
npm config set @git-manager:registry https://git.mreichelt.dev/git-manager/~npm/
npm install -g @git-manager/main

git-manager          # interactive menu
git-manager ui       # Ink TUI
git-manager setup    # settings wizard
```

Run without a global install:

```bash
npm config set @git-manager:registry https://git.mreichelt.dev/git-manager/~npm/
npx @git-manager/main setup
```

On minimal Linux (Alpine, slim images), you may need build tools for the
`better-sqlite3` native dependency: `python3`, `make`, and `g++`. See
[Troubleshooting](docs/troubleshooting.md#npm-install-fails).

On first run, the setup wizard asks for your editor, clone location, and default layout mode.

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

Example plugins live in `plugins/`.

For a reproducible Linux dev environment (including from Windows via Docker), see [.devcontainer/README.md](.devcontainer/README.md).

## Documentation

Browse from the CLI: `git-manager docs [topic]` (e.g. `git-manager docs tui`).

| Guide | Topic |
| --- | --- |
| [Getting started](docs/getting-started.md) | Install, register, clone, switch worktrees |
| [Use cases](docs/use-cases.md) | Parallel features, hotfixes, post-merge tasks |
| [CLI reference](docs/cli-reference.md) | All subcommands and flags |
| [TUI guide](docs/tui-guide.md) | Carousel layout and keybindings |
| [Configuration](docs/configuration.md) | Global and per-repo TOML |
| [Worktrees & layouts](docs/worktrees-and-layouts.md) | Sibling vs workspaces |
| [Plugins](docs/plugins.md) | Hook actions and plugin authoring |
| [Troubleshooting](docs/troubleshooting.md) | Install issues, doctor, stale entries, editor issues |

## License

MIT — see [LICENSE](LICENSE).
