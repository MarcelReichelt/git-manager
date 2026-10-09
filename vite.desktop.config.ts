import angular from '@analogjs/vite-plugin-angular';
import { defineConfig, type Plugin } from 'vite';
import { electronNativeAddons } from './src/desktop/electron-native-addons.cjs';

const electronNativePackageNames = electronNativeAddons.map((addon) => addon.name);
const runtimeExternals = [...electronNativePackageNames, 'koffi'];

const nodeBuiltins = new Set([
  'assert',
  'child_process',
  'crypto',
  'fs',
  'fs/promises',
  'module',
  'os',
  'path',
  'perf_hooks',
  'process',
  'stream',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
]);

function keepNodeBuiltinsExternal(): Plugin {
  return {
    name: 'keep-node-builtins-external',
    enforce: 'pre',
    resolveId(id) {
      const bare = id.startsWith('node:') ? id.slice('node:'.length) : id;
      if (nodeBuiltins.has(bare) || runtimeExternals.includes(id)) {
        return { id, external: true };
      }
      return null;
    },
    renderChunk(code) {
      const lines = code.split('\n');
      const required: string[] = [];
      let index = 0;
      for (; index < lines.length; index += 1) {
        const line = lines[index] ?? '';
        if (!line.startsWith('import ')) {
          break;
        }
        const match = /^import\s+(.+)\s+from\s+['"]([^'"]+)['"];$/.exec(line);
        if (!match) {
          continue;
        }
        required.push(requireBinding(match[1] ?? '', match[2] ?? ''));
      }
      if (required.length === 0) {
        return null;
      }
      const body = [...required, ...lines.slice(index)].join('\n');
      // The page is a classic script, so import.meta.url is invalid. Jiti loads
      // its TypeScript transform when a plugin runs, after the page script has
      // finished. A script URL from that moment is null, and createRequire
      // rejects it. The transform path is relative to the jiti package.
      return body.replaceAll('import.meta.url', 'require.resolve("jiti")');
    },
    transformIndexHtml(html) {
      return html
        .replace(' type="module" crossorigin', ' defer')
        .replace(' type="module"', ' defer');
    },
  };
}

function requireBinding(clause: string, spec: string): string {
  const load = `require(${JSON.stringify(spec)})`;
  const mixed = /^(.*?)\s*,\s*\{([^}]+)\}$/.exec(clause.trim());
  if (mixed) {
    const binding = mixed[1]?.trim() ?? 'imported';
    const named = mixed[2]?.trim() ?? '';
    return `const ${binding} = ${load};\nconst { ${named} } = ${binding};`;
  }
  return `const ${clause.trim()} = ${load};`;
}

export default defineConfig({
  root: 'src/desktop',
  base: './',
  plugins: [
    keepNodeBuiltinsExternal(),
    angular({
      tsconfig: 'src/desktop/tsconfig.json',
      jit: false,
    }),
  ],
  build: {
    outDir: '../../dist/desktop-app',
    emptyOutDir: true,
    rollupOptions: {
      external: [...runtimeExternals],
    },
  },
});
