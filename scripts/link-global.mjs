#!/usr/bin/env node
import { mkdirSync, unlinkSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'dist', 'cli.js');
const binDir = join(homedir(), '.local', 'bin');
const linkPath = join(binDir, 'git-manager');

if (!existsSync(cli)) {
  console.error('dist/cli.js not found. Run: yarn build');
  process.exit(1);
}

mkdirSync(binDir, { recursive: true });
if (existsSync(linkPath)) {
  unlinkSync(linkPath);
}

const wrapper = `#!/usr/bin/env sh
exec node "${cli}" "$@"
`;
writeFileSync(linkPath, wrapper, { mode: 0o755 });
console.log(`Installed global command: ${linkPath}`);
console.log('Ensure ~/.local/bin is on your PATH (fish: set -Ua fish_user_paths ~/.local/bin)');
