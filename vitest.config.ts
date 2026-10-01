import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    exclude: ['**/node_modules/**', '**/dist/**'],
    projects: [
      {
        test: {
          name: 'cli',
          environment: 'node',
          include: ['tests/cli/**/*.test.ts'],
          testTimeout: 30000,
        },
      },
      {
        plugins: [
          angular({
            tsconfig: 'apps/workspace/tsconfig.json',
            jit: true,
            fastCompile: true,
          }),
        ],
        test: {
          name: 'workspace',
          environment: 'jsdom',
          include: ['tests/workspace/**/*.test.ts'],
          testTimeout: 30000,
          server: {
            deps: {
              inline: [/@angular/, /zone\.js/, /@xterm/],
            },
          },
        },
      },
    ],
  },
});
