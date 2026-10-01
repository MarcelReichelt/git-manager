import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/desktop',
  plugins: [
    angular({
      tsconfig: 'src/desktop/tsconfig.json',
      jit: true,
    }),
  ],
  build: {
    outDir: '../../dist/desktop-app',
    emptyOutDir: true,
  },
});
