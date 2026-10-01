#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const required = ['package/dist/cli.js'];

const tarball = execSync('npm pack --silent', { cwd: root, encoding: 'utf8' }).trim();
const path = join(root, tarball);

try {
  const listing = execSync(`tar -tzf ${JSON.stringify(path)}`, { encoding: 'utf8' });
  const missing = required.filter(
    (entry) => !listing.split('\n').some((line) => line === entry || line === `${entry}/`),
  );
  if (missing.length > 0) {
    console.error('npm pack is missing required runtime files:');
    for (const entry of missing) console.error(`  - ${entry}`);
    process.exit(1);
  }
  console.log('pack check ok:', required.map((e) => e.replace('package/', '')).join(', '));
} finally {
  rmSync(path, { force: true });
}
