import { blankShellCandidates, ensureShell, killShell, shellAlive, shellPty, subscribeShell } from '../src/desktop/shell-host';

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
