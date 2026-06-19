# git-manager

A TypeScript CLI and TUI for managing git repositories with worktrees, push/pull, merges, hooks, and a global registry.

## Features

- Global repository registry with active repo and worktree context
- Two layout modes: sibling folders or `.workspaces/` inside the repo
- Clone, register, and unified repo picker (switch / clone / add)
- Worktree create, remove, push, pull, and merge flows
- Working tree changes view in CLI and split TUI
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
| [TUI guide](docs/tui-guide.md) | Split view and keybindings |
| [Configuration](docs/configuration.md) | Global and per-repo TOML |
| [Worktrees & layouts](docs/worktrees-and-layouts.md) | Sibling vs workspaces |
| [Plugins](docs/plugins.md) | Hook actions and plugin authoring |
| [Troubleshooting](docs/troubleshooting.md) | Doctor, stale entries, editor issues |

## Development

```bash
yarn install
yarn build
yarn test
```

This project uses **Yarn 4 (Berry)** via the vendored release in `.yarn/releases/` (see `packageManager` in `package.json`).

Example plugins live in `plugins/`.

## License

MIT
