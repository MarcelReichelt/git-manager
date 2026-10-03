import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { expandIdeCommand, launchIde, resetIdeLaunch, setIdeLaunch } from '../src/desktop/ide-launch.js';

describe('IDE launch', () => {
  afterEach(() => {
    resetIdeLaunch();
  });
  it('replaces {folder} with the checkout path quoted for the shell', () => {
    expect(expandIdeCommand('code -n {folder}', '/tmp/harbor')).toBe("code -n '/tmp/harbor'");
  });

  it('leaves a command unchanged when it has no {folder} token', () => {
    expect(expandIdeCommand('cursor --reuse-window', '/tmp/harbor')).toBe('cursor --reuse-window');
  });

  it('escapes a single quote inside the checkout path', () => {
    expect(expandIdeCommand('code {folder}', "/tmp/o'reilly")).toBe("code '/tmp/o'\\''reilly'");
  });

  it('quotes the absolute checkout path', () => {
    expect(expandIdeCommand('code {folder}', '/tmp/harbor/../pier')).toBe("code '/tmp/pier'");
  });

  it('replaces every {folder} token', () => {
    expect(expandIdeCommand('echo {folder} {folder}', '/tmp/harbor')).toBe("echo '/tmp/harbor' '/tmp/harbor'");
  });

  it('quotes {folder} with double quotes on win32', () => {
    expect(expandIdeCommand('code {folder}', '/tmp/a"b', 'win32')).toBe('code "/tmp/a\\"b"');
  });

  it('launches the expanded command in the absolute checkout', () => {
    const launched: Array<{ command: string; cwd: string }> = [];
    setIdeLaunch((command, cwd) => {
      launched.push({ command, cwd });
    });

    launchIde('code -n {folder}', '/tmp/harbor');

    expect(launched).toEqual([{ command: "code -n '/tmp/harbor'", cwd: '/tmp/harbor' }]);
  });

  it('passes a command without {folder} through and still uses the absolute checkout', () => {
    const launched: Array<{ command: string; cwd: string }> = [];
    setIdeLaunch((command, cwd) => {
      launched.push({ command, cwd });
    });

    launchIde('cursor --reuse-window', 'harbor/../pier');

    const cwd = launched[0]?.cwd ?? '';
    expect(launched[0]?.command).toBe('cursor --reuse-window');
    expect(cwd.startsWith('/')).toBe(true);
    expect(cwd.endsWith('/pier')).toBe(true);
    expect(cwd.includes('..')).toBe(false);
  });

  it('runs the command in a shell whose working directory is the checkout', async () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-ide-launch-'));
    try {
      await launchIde('pwd > launched-cwd.txt', root);
      expect(readFileSync(join(root, 'launched-cwd.txt'), 'utf8').trim()).toBe(root);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('reports a shell failure from the default launcher', async () => {
    const root = mkdtempSync(join(tmpdir(), 'git-manager-ide-launch-'));
    try {
      await expect(launchIde('exit 9', root)).rejects.toThrow('Command failed: exit 9');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
