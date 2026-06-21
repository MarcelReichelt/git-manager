# Runner image for the end-to-end suite. Builds the CLI and drives the real
# dist/cli.js binary against the Gitea service defined in docker-compose.e2e.yml.
FROM mcr.microsoft.com/devcontainers/typescript-node:22

# git for the CLI's git operations + native build deps for better-sqlite3.
RUN apt-get update \
    && export DEBIAN_FRONTEND=noninteractive \
    && apt-get install -y --no-install-recommends python3 make g++ git \
    && apt-get clean -y \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

# .yarnrc.yml references ${NPM_TOKEN} for the private @murakai publish scope.
# The e2e build only needs public deps, so a placeholder satisfies yarn's eager
# environment-variable resolution.
ENV NPM_TOKEN=unused

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn ./.yarn
RUN yarn install --immutable || yarn install

# Build the CLI.
COPY . .
RUN yarn build

CMD ["yarn", "test:e2e"]
