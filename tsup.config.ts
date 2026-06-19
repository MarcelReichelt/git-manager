import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts', 'src/tui/index.tsx'],
  format: ['esm'],
  target: 'node20',
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  external: ['better-sqlite3'],
});
