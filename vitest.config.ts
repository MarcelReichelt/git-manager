import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    // e2e tests require the Docker compose stack (real git server); they are
    // run separately via `yarn test:e2e` with vitest.e2e.config.ts.
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
});
