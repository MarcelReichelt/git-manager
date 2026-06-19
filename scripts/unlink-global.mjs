#!/usr/bin/env node
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const linkPath = join(homedir(), '.local', 'bin', 'git-manager');

if (!existsSync(linkPath)) {
  console.log('No global git-manager link found.');
  process.exit(0);
}

unlinkSync(linkPath);
console.log(`Removed: ${linkPath}`);
