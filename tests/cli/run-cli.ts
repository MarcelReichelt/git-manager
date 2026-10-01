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

export function initBareRepo(path: string, branch = 'main'): void {
  mkdirSync(path, { recursive: true });
  execSync(`git init --bare -b ${branch}`, { cwd: path, stdio: 'ignore' });
}

export function initRepoWithRemote(repoPath: string, remotePath: string, branch = 'main'): void {
  initBareRepo(remotePath, branch);
  initRepo(repoPath, branch);
  execSync(`git remote add origin "${remotePath}"`, { cwd: repoPath, stdio: 'ignore' });
  execSync(`git push -u origin ${branch}`, { cwd: repoPath, stdio: 'ignore' });
}

export function pushRemoteOnlyBranch(remotePath: string, baseDir: string, branch: string): void {
  const clone = join(baseDir, `contributor-${branch.replace(/[^\w.-]+/g, '-')}`);
  execSync(`git clone "${remotePath}" "${clone}"`, { stdio: 'ignore' });
  execSync('git config user.name "git-manager test"', { cwd: clone, stdio: 'ignore' });
  execSync('git config user.email "test@git-manager.local"', { cwd: clone, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: clone, stdio: 'ignore' });
  execSync(`git checkout -b ${branch}`, { cwd: clone, stdio: 'ignore' });
  writeFileSync(join(clone, 'remote-only.txt'), 'from remote\n');
  execSync('git add . && git commit -m "remote only"', { cwd: clone, stdio: 'ignore' });
  execSync(`git push -u origin ${branch}`, { cwd: clone, stdio: 'ignore' });
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
