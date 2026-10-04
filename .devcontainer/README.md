# Dev Container

Run and test `git-manager` in a clean **Linux** environment from Windows, so
POSIX paths, `~/.local/bin`, and the native `better-sqlite3` and `node-pty`
builds behave the same way they do for a Linux user.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (WSL 2 backend)
- VS Code with the **Dev Containers** extension (`ms-vscode-remote.remote-containers`)

## Open it

1. Open this folder in VS Code.
2. Run **Dev Containers: Reopen in Container** from the Command Palette
   (`F1`), or click the green prompt in the bottom-right.

The first build installs the toolchain (Node 22, git, and build tools), enables
Corepack, then runs `yarn install` and `yarn build` automatically. Yarn 4.17.0
is the vendored release in `.yarn/releases/`.

## Test the CLI

Inside the container's terminal:

```bash
# Already built by postCreateCommand; rebuild after changes with:
yarn build

# Run directly
node dist/cli.js --help

# Or install the global command (lands in ~/.local/bin, already on PATH)
yarn link:global
git-manager --help

# Desktop window (needs a display). A new terminal is in-app.
# App settings can choose tmux when tmux is on PATH.
yarn desktop

# Run the test suite
yarn test
```

## Notes

- `node_modules` lives in a named Docker volume, so the Linux-built native
  binaries never clash with the Windows `node_modules` on your host.
- No registry token is needed: all dependencies resolve from the public npm
  registry (the private `@git-manager` scope is only used for publishing).
