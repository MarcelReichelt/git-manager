import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execa, type Result } from 'execa';
import { saveGlobalConfig } from '../../src/config/loader.js';
import { defaultGlobalConfig } from '../../src/config/schema.js';

const CLI_PATH = join(process.cwd(), 'dist', 'cli.js');

const GIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'e2e tester',
  GIT_AUTHOR_EMAIL: 'e2e@example.com',
  GIT_COMMITTER_NAME: 'e2e tester',
  GIT_COMMITTER_EMAIL: 'e2e@example.com',
};

export interface E2eEnv {
  base: string;
  configDir: string;
  registryPath: string;
  cloneRoot: string;
  env: NodeJS.ProcessEnv;
  cleanup: () => void;
}

/**
 * Create an isolated config/registry/clone-root sandbox and seed a "setup
 * complete" global config so CLI commands don't trip the first-run wizard.
 */
export function createE2eEnv(): E2eEnv {
  const base = mkdtempSync(join(tmpdir(), 'git-manager-e2e-'));
  const configDir = join(base, 'config');
  const registryPath = join(configDir, 'registry.db');
  const cloneRoot = join(base, 'repos');
  mkdirSync(configDir, { recursive: true });
  mkdirSync(cloneRoot, { recursive: true });

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...GIT_IDENTITY,
    GIT_MANAGER_CONFIG_DIR: configDir,
    GIT_MANAGER_REGISTRY_PATH: registryPath,
  };

  const prevConfigDir = process.env.GIT_MANAGER_CONFIG_DIR;
  process.env.GIT_MANAGER_CONFIG_DIR = configDir;
  const config = defaultGlobalConfig();
  config.meta.setup_completed = true;
  config.editor.command = 'true';
  config.defaults.clone_root = cloneRoot;
  saveGlobalConfig(config);
  if (prevConfigDir === undefined) {
    delete process.env.GIT_MANAGER_CONFIG_DIR;
  } else {
    process.env.GIT_MANAGER_CONFIG_DIR = prevConfigDir;
  }

  return {
    base,
    configDir,
    registryPath,
    cloneRoot,
    env,
    cleanup: () => rmSync(base, { recursive: true, force: true }),
  };
}

export function runCli(
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<Result> {
  return execa('node', [CLI_PATH, ...args], {
    cwd: options.cwd,
    env: options.env,
  });
}

export function runGit(
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): Promise<Result> {
  return execa('git', args, {
    cwd: options.cwd,
    env: { ...process.env, ...GIT_IDENTITY, ...options.env },
  });
}

/** Simulate another contributor pushing to the remote over HTTP. */
export async function pushExternalCommit(
  remoteUrl: string,
  baseDir: string,
  fileName = 'remote.txt',
): Promise<void> {
  const clone = join(baseDir, `external-${Date.now()}`);
  await runGit(['clone', remoteUrl, clone], { cwd: baseDir });
  writeFileSync(join(clone, fileName), 'remote change\n');
  await runGit(['add', '.'], { cwd: clone });
  await runGit(['commit', '-m', 'external commit'], { cwd: clone });
  await runGit(['push', 'origin', 'main'], { cwd: clone });
  rmSync(clone, { recursive: true, force: true });
}
