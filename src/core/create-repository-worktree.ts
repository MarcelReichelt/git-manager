import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import TOML from '@iarna/toml';
import { createJiti } from 'jiti';
import type { HookResult } from '../hooks/types.js';

/**
 * Per-repository worktree config, relative to the repository root.
 * `layout` is `workspaces` or `sibling`.
 * Optional `create_hook` is a shell command.
 * Optional `create_plugin` is a TypeScript plugin path, loaded with jiti.
 * A remote-only branch is fetched before the shell command and the plugin run.
 */
export const REPOSITORY_WORKTREE_CONFIG_FILE = '.git-manager.toml';

interface RepositoryWorktreeConfig {
  readonly layout: 'workspaces' | 'sibling';
  readonly createHook?: string;
  readonly createPlugin?: string;
}

interface CreatePluginContext {
  readonly repositoryPath: string;
  readonly worktreePath: string;
  readonly branch: string;
}

interface CreatePlugin {
  readonly name: string;
  onCreate(context: CreatePluginContext): HookResult;
}

export function createRepositoryWorktree(repositoryPath: string, branch: string): string {
  const root = resolve(repositoryPath);
  const config = readConfig(root);
  const destination = worktreeDestination(root, config.layout, branch);
  if (existsSync(destination)) {
    throw new Error(`Worktree folder already exists: ${destination}`);
  }
  mkdirSync(dirname(destination), { recursive: true });
  if (hasRef(root, `refs/heads/${branch}`)) {
    git(root, ['worktree', 'add', destination, branch]);
  } else {
    git(root, ['fetch', 'origin', branch]);
    const remoteRef = `refs/remotes/origin/${branch}`;
    if (!hasRef(root, remoteRef)) {
      throw new Error(`Branch not found: ${branch}`);
    }
    git(root, ['worktree', 'add', '-b', branch, destination, `origin/${branch}`]);
  }
  try {
    runCreateHook(root, config.createHook);
    runCreatePlugin(root, config.createPlugin, {
      repositoryPath: root,
      worktreePath: destination,
      branch,
    });
  } catch (error) {
    discardCreatedWorktree(root, destination);
    throw error;
  }
  return destination;
}

function worktreeDestination(repositoryPath: string, layout: 'workspaces' | 'sibling', branch: string): string {
  const directoryName = worktreeDirectoryName(branch);
  if (layout === 'workspaces') {
    return join(repositoryPath, '.workspaces', directoryName);
  }
  return join(dirname(repositoryPath), directoryName);
}

function worktreeDirectoryName(branch: string): string {
  return branch.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
}

function readConfig(repositoryPath: string): RepositoryWorktreeConfig {
  const path = join(repositoryPath, REPOSITORY_WORKTREE_CONFIG_FILE);
  if (!existsSync(path)) {
    throw new Error(`Repository layout is not configured: ${path}`);
  }
  const parsed: unknown = TOML.parse(readFileSync(path, 'utf8'));
  if (!isRecord(parsed) || (parsed.layout !== 'workspaces' && parsed.layout !== 'sibling')) {
    throw new Error('Repository layout must be workspaces or sibling');
  }
  if (parsed.create_hook !== undefined && typeof parsed.create_hook !== 'string') {
    throw new Error('create_hook must be a shell command');
  }
  if (parsed.create_plugin !== undefined && typeof parsed.create_plugin !== 'string') {
    throw new Error('create_plugin must be a TypeScript plugin path');
  }
  return {
    layout: parsed.layout,
    createHook: parsed.create_hook,
    createPlugin: parsed.create_plugin,
  };
}

function runCreateHook(repositoryPath: string, command: string | undefined): void {
  if (!command) {
    return;
  }
  try {
    execFileSync('sh', ['-c', command], {
      cwd: repositoryPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(commandError(error));
  }
}

function runCreatePlugin(
  repositoryPath: string,
  pluginPath: string | undefined,
  context: CreatePluginContext,
): void {
  if (!pluginPath) {
    return;
  }
  const modulePath = resolve(repositoryPath, pluginPath);
  if (!existsSync(modulePath)) {
    throw new Error(`Create plugin not found: ${modulePath}`);
  }
  const plugin = loadCreatePlugin(modulePath);
  const result = plugin.onCreate(context);
  if (result === 'abort') {
    // HookAbortError exits the CLI with status 0. A create abort must refuse the command.
    throw new Error(`${plugin.name} aborted worktree creation`);
  }
}

function loadCreatePlugin(modulePath: string): CreatePlugin {
  const jiti = createJiti(import.meta.url);
  const loaded: unknown = jiti(modulePath);
  const exported = defaultExport(loaded);
  if (!isCreatePlugin(exported)) {
    throw new Error(`Create plugin must export onCreate: ${modulePath}`);
  }
  return exported;
}

function defaultExport(loaded: unknown): unknown {
  if (isRecord(loaded) && 'default' in loaded && loaded.default != null) {
    return loaded.default;
  }
  return loaded;
}

function isCreatePlugin(value: unknown): value is CreatePlugin {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    value.name !== '' &&
    typeof value.onCreate === 'function'
  );
}

function discardCreatedWorktree(repositoryPath: string, destination: string): void {
  git(repositoryPath, ['worktree', 'remove', '--force', destination]);
}

function hasRef(repositoryPath: string, ref: string): boolean {
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', ref], {
      cwd: repositoryPath,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function git(repositoryPath: string, args: readonly string[]): void {
  try {
    execFileSync('git', [...args], {
      cwd: repositoryPath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(commandError(error));
  }
}

function commandError(error: unknown): string {
  if (isCommandFailure(error)) {
    const stderr = error.stderr.trim();
    if (stderr !== '') {
      return stderr;
    }
  }
  if (error instanceof Error && error.message !== '') {
    return error.message;
  }
  return 'Command failed';
}

function isCommandFailure(error: unknown): error is { stderr: string } {
  return typeof error === 'object' && error !== null && 'stderr' in error && typeof error.stderr === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
