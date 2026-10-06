#!/usr/bin/env node
import { unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const binDir = join(homedir(), '.local', 'bin');
const candidates = [join(binDir, 'git-worktree-manager'), join(binDir, 'git-worktree-manager.cmd')];

const removed = candidates.filter((linkPath) => {
  if (!existsSync(linkPath)) {
    return false;
  }
  unlinkSync(linkPath);
  console.log(`Removed: ${linkPath}`);
  return true;
});

if (removed.length === 0) {
  console.log('No global git-worktree-manager link found.');
}
