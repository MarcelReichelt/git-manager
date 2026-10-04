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
          exclude: [
            'tests/desktop-workspace.test.ts',
            'tests/desktop-terminal.test.ts',
            'tests/desktop-terminal-colors.test.ts',
            'tests/desktop-terminal-tabs.test.ts',
            'tests/desktop-terminal-mode.test.ts',
            'tests/e2e/**',
            '**/node_modules/**',
            '**/dist/**',
          ],
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
          // styleUrl is compiled to a CSS import. Vitest blanks those unless
          // CSS processing is enabled, which drops the rail stylesheet.
          css: {
            include: [/workspace-rail\.css/, /xterm\.css/],
          },
          environment: 'jsdom',
          // The Angular plugin defaults this project to vmThreads, whose
          // synthetic node:module cannot host jiti plugin loading.
          pool: 'forks',
          maxWorkers: 1,
          fileParallelism: false,
          include: [
            'tests/desktop-workspace.test.ts',
            'tests/desktop-terminal.test.ts',
            'tests/desktop-terminal-colors.test.ts',
            'tests/desktop-terminal-tabs.test.ts',
            'tests/desktop-terminal-mode.test.ts',
          ],
          setupFiles: ['src/desktop/test-setup.ts'],
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
