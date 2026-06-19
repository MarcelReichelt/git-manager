import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { closeDb } from '../src/core/registry.js';

export function createTempDir(prefix = 'git-manager-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function initBareRepo(path: string): void {
  mkdirSync(path, { recursive: true });
  execSync('git init --bare', { cwd: path, stdio: 'ignore' });
}

export function initRepo(path: string, options: { initialBranch?: string } = {}): void {
  mkdirSync(path, { recursive: true });
  const branch = options.initialBranch ?? 'main';
  execSync(`git init -b ${branch}`, { cwd: path, stdio: 'ignore' });
  writeFileSync(join(path, 'README.md'), '# test\n');
  execSync('git add . && git commit -m "init"', { cwd: path, stdio: 'ignore' });
}

export function setupTestEnv(baseDir: string): {
  configDir: string;
  registryPath: string;
  cleanup: () => void;
} {
  const configDir = join(baseDir, 'config');
  const registryPath = join(configDir, 'registry.db');
  mkdirSync(configDir, { recursive: true });
  process.env.GIT_MANAGER_CONFIG_DIR = configDir;
  process.env.GIT_MANAGER_REGISTRY_PATH = registryPath;
  closeDb();
  return {
    configDir,
    registryPath,
    cleanup: () => {
      closeDb();
      delete process.env.GIT_MANAGER_CONFIG_DIR;
      delete process.env.GIT_MANAGER_REGISTRY_PATH;
      rmSync(baseDir, { recursive: true, force: true });
    },
  };
}

export function runGit(args: string, cwd: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8' }).trim();
}
