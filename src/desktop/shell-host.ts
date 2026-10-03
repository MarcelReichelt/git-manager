import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { spawn, type IPty } from 'node-pty';
import { terminalEnvironment } from './tmux-sessions';

interface ShellListener {
  onData: (data: string) => void;
  onExit: () => void;
}

interface HostedShell {
  pty: IPty;
  buffer: string;
  exited: boolean;
  listeners: Set<ShellListener>;
}

const maxBuffer = 200_000;
const shells = new Map<string, HostedShell>();

export function ensureShell(id: string, cwd: string): void {
  const existing = shells.get(id);
  if (existing && !existing.exited) {
    return;
  }
  const program = shellProgram();
  const pty = spawn(program.file, program.args, {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd,
    env: terminalEnvironment(),
  });
  const hosted: HostedShell = {
    pty,
    buffer: '',
    exited: false,
    listeners: new Set(),
  };
  shells.set(id, hosted);
  pty.onData((data) => {
    hosted.buffer = (hosted.buffer + data).slice(-maxBuffer);
    for (const listener of hosted.listeners) {
      listener.onData(data);
    }
  });
  pty.onExit(() => {
    if (hosted.exited) {
      return;
    }
    hosted.exited = true;
    for (const listener of hosted.listeners) {
      listener.onExit();
    }
  });
}

export function subscribeShell(id: string, listener: ShellListener): () => void {
  const hosted = shells.get(id);
  if (!hosted) {
    return () => undefined;
  }
  const snapshot = hosted.buffer;
  hosted.listeners.add(listener);
  if (snapshot.length > 0) {
    listener.onData(snapshot);
  }
  if (hosted.exited) {
    listener.onExit();
  }
  return () => {
    hosted.listeners.delete(listener);
  };
}

export function writeShell(id: string, data: string): void {
  const hosted = shells.get(id);
  if (!hosted || hosted.exited) {
    return;
  }
  hosted.pty.write(data);
}

export function shellPty(id: string): IPty | null {
  const hosted = shells.get(id);
  if (!hosted || hosted.exited) {
    return null;
  }
  return hosted.pty;
}

export function shellAlive(id: string): boolean {
  const hosted = shells.get(id);
  return hosted !== undefined && !hosted.exited;
}

export function shellCommand(id: string): string {
  const hosted = shells.get(id);
  if (!hosted || hosted.exited) {
    return '';
  }
  return foregroundCommand(hosted.pty.pid);
}

export function killShell(id: string): void {
  const hosted = shells.get(id);
  if (!hosted) {
    return;
  }
  shells.delete(id);
  hosted.exited = true;
  try {
    hosted.pty.kill();
  } catch {
    // The shell already exited.
  }
}

export function killAllShells(): void {
  for (const id of [...shells.keys()]) {
    killShell(id);
  }
}

function shellProgram(): { file: string; args: string[] } {
  if (process.platform === 'win32') {
    return { file: 'powershell.exe', args: ['-NoLogo'] };
  }
  return { file: '/bin/bash', args: ['--noprofile', '--norc', '-i'] };
}

function foregroundCommand(pid: number): string {
  let target = pid;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const commEnd = stat.lastIndexOf(')');
    const fields = stat.slice(commEnd + 2).split(' ');
    const group = Number(fields[5] ?? 0);
    if (group > 0) {
      target = group;
    }
  } catch {
    return '';
  }
  return commandName(target);
}

function commandName(pid: number): string {
  try {
    const raw = readFileSync(`/proc/${pid}/cmdline`);
    const end = raw.indexOf(0);
    const first = (end === -1 ? raw : raw.subarray(0, end)).toString();
    const word = basename(first).split(/\s+/)[0] ?? '';
    if (word.length > 0) {
      return word;
    }
  } catch {
    // The process title is unavailable; fall through to comm.
  }
  try {
    return readFileSync(`/proc/${pid}/comm`, 'utf8').trim().split(/\s+/)[0] ?? '';
  } catch {
    return '';
  }
}
