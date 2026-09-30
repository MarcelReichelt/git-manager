import { execFile } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';

const cliPath = join(process.cwd(), 'dist', 'cli.js');

export type CliResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export async function runCli(
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<CliResult> {
  const env: NodeJS.ProcessEnv = { ...process.env, ...options.env };
  if (!options.env || !Object.prototype.hasOwnProperty.call(options.env, 'GIT_MANAGER_REGISTRY_PATH')) {
    delete env.GIT_MANAGER_REGISTRY_PATH;
  }

  return await new Promise((resolve) => {
    execFile(
      process.execPath,
      [cliPath, ...args],
      {
        cwd: options.cwd,
        env,
        encoding: 'utf8',
      },
      (error, stdout, stderr) => {
        const exitCode =
          error && typeof error === 'object' && 'code' in error && typeof error.code === 'number'
            ? error.code
            : 0;
        resolve({ exitCode, stdout, stderr });
      },
    );
  });
}

export function initRepo(path: string, branch = 'main'): void {
  mkdirSync(path, { recursive: true });
  execSync(`git init -b ${branch}`, { cwd: path, stdio: 'ignore' });
  execSync('git config user.name "git-manager test"', { cwd: path, stdio: 'ignore' });
  execSync('git config user.email "test@git-manager.local"', { cwd: path, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: path, stdio: 'ignore' });
  writeFileSync(join(path, 'README.md'), '# test\n');
  execSync('git add . && git commit -m "init"', { cwd: path, stdio: 'ignore' });
}
