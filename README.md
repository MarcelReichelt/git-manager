# git-manager

A TypeScript CLI for registered git repositories and their worktrees.

Requires **Node.js 20** or later.

## Commands

- `add --path <path> --name <display name>` — register an existing local git repository
- `list` — list registered repositories by display name and path
- `unregister --path <path>` — remove a repository from the registry
- `worktree create <branch> --repo <path or name>` — create a worktree
- `worktree remove <branch> --repo <path or name>` — remove a worktree
- `merge --repo <path or name>` — merge into the master tree, from the master tree, or from an explicit source into an explicit target. `--squash` squashes that merge.

The registry file is `~/.config/git-manager/registry.db`. `GIT_MANAGER_REGISTRY_PATH` overrides that location. Each registered repository is a path and a display name. Layout (`workspaces` or `sibling`) lives in that repository's `.git-manager/config.toml`.

## Install

Requires **Node.js 20+** and **git** on your `PATH`.

```bash
npm config set @git-manager:registry https://git.mreichelt.dev/git-manager/~npm/
npm install -g @git-manager/main
```

On minimal Linux (Alpine, slim images), you may need build tools for the
`better-sqlite3` native dependency: `python3`, `make`, and `g++`. See
[Troubleshooting](docs/troubleshooting.md#npm-install-fails).

## Development

```bash
yarn install
yarn build
yarn link:global   # installs ~/.local/bin/git-manager
yarn test          # CLI tests
yarn test:watch
```

> **Note:** Yarn Berry’s `yarn link` does **not** install a global CLI (unlike npm link). Use `yarn link:global` for local development.

This project uses **Yarn 4 (Berry)** via the vendored release in `.yarn/releases/` (see `packageManager` in `package.json`).

Example plugins live in `plugins/`.

For a reproducible Linux dev environment (including from Windows via Docker), see [.devcontainer/README.md](.devcontainer/README.md).

## Documentation

| Guide | Topic |
| --- | --- |
| [Getting started](docs/getting-started.md) | Install, register a repository, create a worktree |
| [Use cases](docs/use-cases.md) | Sibling checkouts, merge into and from the master tree |
| [CLI reference](docs/cli-reference.md) | Commands and flags |
| [Configuration](docs/configuration.md) | Per-repository config, copy, and create hooks |
| [Worktrees and layouts](docs/worktrees-and-layouts.md) | Workspaces and sibling |
| [Plugins](docs/plugins.md) | TypeScript create hooks |
| [Troubleshooting](docs/troubleshooting.md) | Install, layout config, and failed creates |

## License

MIT — see [LICENSE](LICENSE).
