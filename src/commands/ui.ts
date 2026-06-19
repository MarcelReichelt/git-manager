import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ensureActiveRepository } from '../core/startup-context.js';

export async function launchTui(): Promise<void> {
  await ensureActiveRepository({ promptIfMissing: false });
  const tuiPath = join(dirname(fileURLToPath(import.meta.url)), 'tui', 'index.js');
  const child = spawn(process.execPath, [tuiPath], { stdio: 'inherit' });
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0 || code === null) resolve();
      else reject(new Error(`TUI exited with code ${code}`));
    });
  });
}
