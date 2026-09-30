import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { closeRegisteredRepositoryRegistry } from '../src/core/registered-repositories.js';
import { closeDb } from '../src/core/registry.js';

export function createTempDir(prefix = 'git-manager-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function initBareRepo(path: string, options: { initialBranch?: string } = {}): void {
  mkdirSync(path, { recursive: true });
  const branch = options.initialBranch ?? 'main';
  execSync(`git init --bare -b ${branch}`, { cwd: path, stdio: 'ignore' });
}

export function initRepo(path: string, options: { initialBranch?: string } = {}): void {
  mkdirSync(path, { recursive: true });
  const branch = options.initialBranch ?? 'main';
  execSync(`git init -b ${branch}`, { cwd: path, stdio: 'ignore' });
  configureTestIdentity(path);
  writeFileSync(join(path, 'README.md'), '# test\n');
  execSync('git add . && git commit -m "init"', { cwd: path, stdio: 'ignore' });
}

/**
 * Initialise a working repo wired to a fresh bare "origin" remote, with the
 * initial branch pushed and tracking. This is the local stand-in for a real
 * git server: git treats a local bare repo as a fully functional remote, so
 * clone/fetch/push/pull all exercise the exact same code paths.
 */
export function initRepoWithRemote(
  repoPath: string,
  remotePath: string,
  options: { initialBranch?: string } = {},
): void {
  const branch = options.initialBranch ?? 'main';
  initBareRepo(remotePath, { initialBranch: branch });
  initRepo(repoPath, { initialBranch: branch });
  execSync(`git remote add origin "${remotePath}"`, { cwd: repoPath, stdio: 'ignore' });
  execSync(`git push -u origin ${branch}`, { cwd: repoPath, stdio: 'ignore' });
}

/**
 * Simulate another contributor pushing a commit to the remote by cloning it
 * into a throwaway directory, committing, and pushing back.
 */
export function pushExternalCommit(
  remotePath: string,
  baseDir: string,
  options: { fileName?: string; branch?: string } = {},
): void {
  const fileName = options.fileName ?? 'remote.txt';
  const branch = options.branch ?? 'main';
  const clone = join(baseDir, `external-clone-${Date.now()}`);
  execSync(`git clone "${remotePath}" "${clone}"`, { stdio: 'ignore' });
  configureTestIdentity(clone);
  execSync(`git checkout ${branch}`, { cwd: clone, stdio: 'ignore' });
  writeFileSync(join(clone, fileName), 'remote change\n');
  execSync(`git add . && git commit -m "external commit"`, { cwd: clone, stdio: 'ignore' });
  execSync(`git push origin ${branch}`, { cwd: clone, stdio: 'ignore' });
  rmSync(clone, { recursive: true, force: true });
}

/**
 * Configure a repo-local git identity so tests are hermetic on machines
 * (e.g. fresh Windows installs) that have no global user.name/user.email set.
 */
export function configureTestIdentity(path: string): void {
  execSync('git config user.name "git-manager test"', { cwd: path, stdio: 'ignore' });
  execSync('git config user.email "test@git-manager.local"', { cwd: path, stdio: 'ignore' });
  execSync('git config commit.gpgsign false', { cwd: path, stdio: 'ignore' });
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
      closeRegisteredRepositoryRegistry();
      delete process.env.GIT_MANAGER_CONFIG_DIR;
      delete process.env.GIT_MANAGER_REGISTRY_PATH;
      rmSync(baseDir, { recursive: true, force: true });
    },
  };
}

export function runGit(args: string, cwd: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf8' }).trim();
}
