import { exec } from 'node:child_process';
import { resolve } from 'node:path';

export type IdeLauncher = (command: string, cwd: string) => void | Promise<void>;

function shellLaunch(command: string, cwd: string): Promise<void> {
  const shell = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : '/bin/sh';
  return new Promise((resolveLaunch, reject) => {
    exec(command, { cwd, shell }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolveLaunch();
    });
  });
}

let ideLauncher: IdeLauncher = shellLaunch;

export function setIdeLaunch(launch: IdeLauncher): void {
  ideLauncher = launch;
}

export function resetIdeLaunch(): void {
  ideLauncher = shellLaunch;
}

export function launchIde(command: string, cwd: string): void | Promise<void> {
  return ideLauncher(expandIdeCommand(command, cwd), resolve(cwd));
}

export function expandIdeCommand(
  command: string,
  folder: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return command.replaceAll('{folder}', quoteFolder(resolve(folder), platform));
}

function quoteFolder(folder: string, platform: NodeJS.Platform): string {
  if (platform === 'win32') {
    return `"${folder.replaceAll('"', '\\"')}"`;
  }
  return `'${folder.replaceAll("'", "'\\''")}'`;
}
