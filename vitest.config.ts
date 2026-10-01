import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    testTimeout: 30000,
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
          exclude: ['tests/desktop-workspace.test.ts', 'tests/e2e/**', '**/node_modules/**', '**/dist/**'],
        },
      },
      {
        extends: true,
        plugins: [
          angular({
            tsconfig: 'src/desktop/tsconfig.json',
            jit: true,
          }),
        ],
        test: {
          name: 'desktop',
          environment: 'jsdom',
          // The Angular plugin defaults this project to vmThreads, whose
          // synthetic node:module cannot host jiti plugin loading.
          pool: 'forks',
          include: ['tests/desktop-workspace.test.ts'],
          setupFiles: ['src/desktop/test-setup.ts'],
        },
      },
    ],
  },
});
