# git-manager

A TypeScript CLI and TUI for managing git repositories with worktrees, push/pull, merges, hooks, and a global registry.

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

## Quick start

```bash
yarn install
yarn build
yarn link:global   # installs ~/.local/bin/git-manager

git-manager          # interactive menu
git-manager ui       # Ink TUI
git-manager setup    # settings wizard
```

> **Note:** Yarn Berry’s `yarn link` does **not** install a global CLI (unlike npm link). Use `yarn link:global` for local development.

On first run, the setup wizard asks for your editor, clone location, and default layout mode.

## Documentation

| Guide | Topic |
| --- | --- |
| [Getting started](docs/getting-started.md) | Install, register, clone, switch worktrees |
| [Use cases](docs/use-cases.md) | Parallel features, hotfixes, post-merge tasks |
| [CLI reference](docs/cli-reference.md) | All subcommands and flags |
| [TUI guide](docs/tui-guide.md) | Carousel layout and keybindings |
| [Configuration](docs/configuration.md) | Global and per-repo TOML |
| [Worktrees & layouts](docs/worktrees-and-layouts.md) | Sibling vs workspaces |
| [Plugins](docs/plugins.md) | Hook actions and plugin authoring |
| [Troubleshooting](docs/troubleshooting.md) | Doctor, stale entries, editor issues |

## Development

```bash
yarn install
yarn build
yarn test              # unit and integration tests
yarn test:watch        # watch mode
yarn test:e2e          # CLI e2e tests (needs a running Gitea; see docker-compose.e2e.yml)
yarn test:e2e:docker   # full e2e stack in Docker (Gitea + runner)
```

This project uses **Yarn 4 (Berry)** via the vendored release in `.yarn/releases/` (currently `yarn-4.9.2.cjs`).

Example plugins live in `plugins/`.

For a reproducible Linux dev environment (including from Windows via Docker), see [.devcontainer/README.md](.devcontainer/README.md).

## License

MIT — see [LICENSE](LICENSE).
