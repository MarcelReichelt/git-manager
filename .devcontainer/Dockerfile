# Linux dev environment for git-worktree-manager so Windows users can test it
# exactly like a Linux user would (real POSIX paths, ~/.local/bin, etc.).
FROM mcr.microsoft.com/devcontainers/typescript-node:22

# Native build dependencies for better-sqlite3 (compiled via node-gyp).
RUN apt-get update \
    && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends \
        python3 \
        make \
        g++ \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

# Enable Corepack so the Yarn version pinned in package.json
# ("packageManager": "yarn@4.17.0") is provisioned automatically.
RUN corepack enable
