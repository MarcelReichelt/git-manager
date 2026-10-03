import { existsSync, readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { basename, delimiter, join } from 'node:path';
import { spawn, type IPty } from 'node-pty';
import { terminalEnvironment } from './tmux-sessions';
import { windowsForegroundCommand } from './windows-foreground';

interface ShellListener {
  onData: (data: string) => void;
  onExit: () => void;
}

interface HostedShell {
  pty: IPty;
  program: string;
  buffer: string;
  exited: boolean;
  listeners: Set<ShellListener>;
}

const maxBuffer = 200_000;
const shells = new Map<string, HostedShell>();

export function ensureShell(id: string, cwd: string, command = ''): void {
  const existing = shells.get(id);
  if (existing) {
    return;
  }
  const file = shellFile(command);
  if (!canStart(file)) {
    throw new Error(`Could not start ${file}: file not found`);
  }
  let pty: IPty;
  try {
    pty = spawn(file, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: terminalEnvironment(),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not start ${file}: ${detail}`);
  }
  const hosted: HostedShell = {
    pty,
    program: file,
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
  const running = foregroundCommand(hosted.pty.pid);
  if (running.length > 0) {
    return running;
  }
  return basename(hosted.program);
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

function shellFile(command: string): string {
  if (command.length > 0) {
    return command;
  }
  for (const candidate of blankShellCandidates()) {
    if (canStart(candidate)) {
      return candidate;
    }
  }
  return process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
}

export function blankShellCandidates(platform = process.platform): string[] {
  const candidates = [loginShell(), '/bin/bash'];
  if (platform === 'win32') {
    candidates.push('powershell.exe');
  }
  const unique: string[] = [];
  for (const candidate of candidates) {
    if (candidate.length > 0 && !unique.includes(candidate)) {
      unique.push(candidate);
    }
  }
  return unique;
}

function loginShell(): string {
  const shell = process.env.SHELL;
  if (typeof shell === 'string' && shell.length > 0) {
    return shell;
  }
  try {
    const shellPath = userInfo().shell;
    if (typeof shellPath === 'string' && shellPath.length > 0) {
      return shellPath;
    }
  } catch {
    // The OS user entry is unavailable.
  }
  return '';
}

function canStart(command: string): boolean {
  if (command.includes('/') || command.includes('\\')) {
    return existsSync(command);
  }
  const names =
    process.platform === 'win32' && !command.toLowerCase().endsWith('.exe')
      ? [command, `${command}.exe`]
      : [command];
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (directory.length === 0) {
      continue;
    }
    for (const name of names) {
      if (existsSync(join(directory, name))) {
        return true;
      }
    }
  }
  return false;
}

function foregroundCommand(pid: number): string {
  if (process.platform === 'win32') {
    return windowsForegroundCommand(pid);
  }
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
    const word = basename(first).trim();
    if (word.length > 0) {
      return word;
    }
  } catch {
    // The process title is unavailable; fall through to comm.
  }
  try {
    return readFileSync(`/proc/${pid}/comm`, 'utf8').trim();
  } catch {
    return '';
  }
}
