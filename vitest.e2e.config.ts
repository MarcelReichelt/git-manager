import { defineConfig } from 'vitest/config';

// e2e suite: drives the built dist/cli.js binary against a real Gitea server.
// Intended to run inside the Docker compose stack (docker-compose.e2e.yml),
// where GITEA_URL points at the gitea service.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.e2e.test.ts'],
    globalSetup: ['tests/e2e/global-setup.ts'],
    testTimeout: 120000,
    hookTimeout: 120000,
    // The CLI mutates a shared registry/config dir per repo; keep it serial.
    fileParallelism: false,
  },
});
