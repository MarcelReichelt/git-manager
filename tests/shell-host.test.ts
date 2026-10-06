import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  blankShellCandidates,
  ensureShell,
  killShell,
  shellAlive,
  shellCommand,
  shellPty,
  subscribeShell,
  writeShell,
} from '../src/desktop/shell-host';

describe('in-app shell host', () => {
  const ids: string[] = [];

  afterEach(() => {
    for (const id of ids) {
      killShell(id);
    }
    ids.length = 0;
  });

  it('keeps powershell.exe as the Windows fallback only', () => {
    expect(blankShellCandidates('linux')).not.toContain('powershell.exe');
    expect(blankShellCandidates('darwin')).not.toContain('powershell.exe');
    expect(blankShellCandidates('win32').at(-1)).toBe('powershell.exe');
  });

  it.skipIf(process.platform !== 'win32')('finds powershell.exe on PATH', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-worktree-manager-shell-path-'));
    writeFileSync(join(root, 'powershell.exe'), '');
    const previousPath = process.env.PATH;
    process.env.PATH = root;
    const id = `shell-path-${Date.now()}`;
    ids.push(id);
    try {
      ensureShell(id, root, 'powershell.exe');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toBe('Could not start powershell.exe: file not found');
    } finally {
      process.env.PATH = previousPath;
      killShell(id);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.skipIf(process.platform !== 'win32')('names npm while it runs and the shell after it exits', async () => {
    const root = mkdtempSync(join(tmpdir(), 'git-worktree-manager-shell-'));
    writeFileSync(join(root, 'hold.mjs'), 'setTimeout(() => process.exit(0), 2500);\n');
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'stay', scripts: { stay: 'node hold.mjs' } }),
    );
    const id = `shell-${Date.now()}`;
    ids.push(id);
    try {
      ensureShell(id, root, 'powershell.exe');
      await waitForCommand(id, 'powershell.exe');
      writeShell(id, 'npm run stay\r');
      await waitForCommand(id, 'npm');
      await waitForCommand(id, 'powershell.exe');
    } finally {
      killShell(id);
      await new Promise((resolve) => setTimeout(resolve, 300));
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // The shell may still hold the directory.
      }
    }
  });

  it('does not start another process after the shell has exited', async () => {
    const id = `shell-${Date.now()}`;
    ids.push(id);
    ensureShell(id, process.cwd(), '/bin/bash');
    const pty = shellPty(id);
    expect(pty).not.toBeNull();
    pty?.kill();

    const started = Date.now();
    while (shellAlive(id) && Date.now() - started < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(shellAlive(id)).toBe(false);

    let ended = false;
    ensureShell(id, process.cwd());
    subscribeShell(id, {
      onData: () => undefined,
      onExit: () => {
        ended = true;
      },
    });

    expect(ended).toBe(true);
    expect(shellAlive(id)).toBe(false);
  });
});

async function waitForCommand(id: string, command: string): Promise<void> {
  const started = Date.now();
  let latest = '';
  while (Date.now() - started < 20000) {
    latest = shellCommand(id);
    if (latest === command) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`expected ${command}, last saw ${latest}`);
}
