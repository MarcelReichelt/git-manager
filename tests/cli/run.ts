import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const emptyGitConfig = join(tmpdir(), 'git-manager-test-gitconfig');
writeFileSync(emptyGitConfig, '');
process.env.GIT_CONFIG_GLOBAL = emptyGitConfig;
process.env.GIT_CONFIG_SYSTEM = emptyGitConfig;
process.env.GIT_TERMINAL_PROMPT = '0';

export const cliPath = resolve('dist/cli.js');

export function makeTempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function gitManagerEnv(registryPath: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_MANAGER_REGISTRY_PATH: registryPath,
  };
}

export function runGitManager(
  args: string[],
  env: NodeJS.ProcessEnv,
): SpawnSyncReturns<string> {
  return spawnSync('node', [cliPath, ...args], {
    encoding: 'utf8',
    env,
  });
}

export function initGitRepo(path: string, branch = 'master'): void {
  mkdirSync(path, { recursive: true });
  execFileSync('git', ['init', '-b', branch], { cwd: path, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'git-manager test'], {
    cwd: path,
    stdio: 'ignore',
  });
  execFileSync('git', ['config', 'user.email', 'test@git-manager.local'], {
    cwd: path,
    stdio: 'ignore',
  });
  writeFileSync(join(path, 'README.md'), '# test\n');
  execFileSync('git', ['add', '.'], { cwd: path, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: path, stdio: 'ignore' });
}

export function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

export function removeTemp(path: string): void {
  rmSync(path, { recursive: true, force: true });
}
