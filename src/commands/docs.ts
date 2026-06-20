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
    const isWindows = process.platform === 'win32';
    // `less` is not available on a default Windows install, so only page when a
    // pager is explicitly configured there; otherwise print the file directly.
    const pager = process.env.PAGER ?? (isWindows ? undefined : 'less');
    if (pager && process.stdout.isTTY) {
      const child = spawn(pager, [path], { stdio: 'inherit', shell: isWindows });
      child.on('error', () => {
        // The pager could not be spawned (e.g. `less` missing). Fall back to
        // printing the content and exit so control is not silently returned.
        console.log(content);
        process.exit(0);
      });
      child.on('exit', (code) => {
        process.exit(code ?? 0);
      });
    } else {
      console.log(content);
    }
  } else {
    console.log(`Documentation directory: ${path}`);
    console.log('Available topics: getting-started, configuration, plugins, troubleshooting, tui, cli, use-cases, worktrees');
  }
}
