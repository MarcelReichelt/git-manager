import { readFileSync, existsSync } from 'node:fs';
import { docsPath } from '../config/paths.js';
import { spawn } from 'node:child_process';

export function showDocs(topic?: string): void {
  const path = docsPath(topic);
  if (!existsSync(path)) {
    console.error(`Documentation not found: ${path}`);
    process.exit(1);
  }
  if (path.endsWith('.md')) {
    const content = readFileSync(path, 'utf8');
    const pager = process.env.PAGER ?? 'less';
    if (process.stdout.isTTY) {
      const child = spawn(pager, [path], { stdio: 'inherit' });
      child.on('exit', (code) => process.exit(code ?? 0));
    } else {
      console.log(content);
    }
  } else {
    console.log(`Documentation directory: ${path}`);
    console.log('Available topics: getting-started, configuration, plugins, troubleshooting, tui, cli, use-cases, worktrees');
  }
}
