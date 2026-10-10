import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  typeStartupCommand,
  writeShell,
} from '../src/desktop/shell-host';
import { shellCanTakeInput } from '../src/desktop/shell-prompt';

describe('in-app shell host', () => {
  const ids: string[] = [];

  afterEach(() => {
    for (const id of ids) {
      killShell(id);
    }
    ids.length = 0;
  });

  it('treats a prompt marker at the end of the shell output as ready', () => {
    expect(shellCanTakeInput('user@host:~/repo$ ')).toBe(true);
    expect(shellCanTakeInput('PS C:\\repo> \n')).toBe(true);
    expect(shellCanTakeInput('~/repo\n❯ ')).toBe(true);
    expect(shellCanTakeInput('')).toBe(false);
    expect(shellCanTakeInput('still starting')).toBe(false);
    expect(shellCanTakeInput('\u001b]633;A\u0007~/repo> ')).toBe(false);
    expect(shellCanTakeInput('\u001b]633;A\u0007~/repo>\u001b]633;B\u0007')).toBe(true);
    expect(shellCanTakeInput('\u001b]133;B\u0007\u001b]133;C\u0007')).toBe(false);
  });

  it('waits until a redrawn prompt settles before typing the startup command', async () => {
    const root = mkdtempSync(join(tmpdir(), 'git-worktree-manager-shell-redraw-'));
    const shell = join(root, 'redraw-shell.mjs');
    writeFileSync(
      shell,
      [
        '#!/usr/bin/env node',
        "process.stdout.write('> ');",
        'let discard = true;',
        "let line = '';",
        'process.stdin.resume();',
        'if (process.stdin.isTTY) process.stdin.setRawMode(true);',
        "process.stdin.on('data', (chunk) => {",
        '  const text = chunk.toString();',
        '  if (discard) return;',
        '  line += text;',
        "  if (line.includes('\\r') || line.includes('\\n')) {",
        "    process.stdout.write('got:' + line.trim() + '\\n');",
        '  }',
        '});',
        'setTimeout(() => {',
        '  discard = false;',
        "  line = '';",
        "  process.stdout.write('\\r\\u001b[2Kready> ');",
        '}, 150);',
        '',
      ].join('\n'),
    );
    chmodSync(shell, 0o755);
    const id = `shell-redraw-${Date.now()}`;
    ids.push(id);
    ensureShell(id, root, shell);
    let seen = '';
    subscribeShell(id, {
      onData(data) {
        seen += data;
      },
      onExit() {
        return undefined;
      },
    });
    typeStartupCommand(id, 'echo typed-line');
    const started = Date.now();
    while (!seen.includes('got:echo typed-line') && Date.now() - started < 4000) {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    expect(seen).toContain('got:echo typed-line');
    rmSync(root, { recursive: true, force: true });
  });

  it('types the startup command once a prompt ending in > can take input', async () => {
    const root = mkdtempSync(join(tmpdir(), 'git-worktree-manager-shell-prompt-'));
    const shell = join(root, 'prompt-shell');
    writeFileSync(shell, '#!/bin/sh\nprintf \'> \'\nIFS= read -r line\nprintf \'%s\\n\' "$line"\n');
    chmodSync(shell, 0o755);
    const id = `shell-prompt-${Date.now()}`;
    ids.push(id);
    ensureShell(id, root, shell);
    let seen = '';
    subscribeShell(id, {
      onData(data) {
        seen += data;
      },
      onExit() {
        return undefined;
      },
    });
    typeStartupCommand(id, 'echo typed-line');
    const started = Date.now();
    while (!seen.includes('typed-line') && Date.now() - started < 4000) {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    expect(seen).toContain('typed-line');
    rmSync(root, { recursive: true, force: true });
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
