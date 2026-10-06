import { execFileSync, execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import TOML from '@iarna/toml';
import { createJiti } from 'jiti';
import { createLayoutForRepository } from './app-settings.js';
import { findRepository } from './registry.js';

type LayoutMode = 'workspaces' | 'sibling';

interface RepoConfig {
  layout?: { mode?: string };
  copy?: { files?: string[] };
  hooks?: {
    modules?: string[];
    pre_worktree_create?: { commands?: string[] };
    post_worktree_create?: { commands?: string[] };
  };
}

interface WorktreePlugin {
  name: string;
  preWorktreeCreate?: () => 'abort' | void | Promise<'abort' | void>;
  postWorktreeCreate?: () => void | Promise<void>;
}

function folderName(branch: string): string {
  return branch.replace(/[/\\<>:"|?*\u0000-\u001f\u007f]/g, '-');
}

function readRepoConfig(repoPath: string): RepoConfig {
  const configPath = join(repoPath, '.git-worktree-manager', 'config.toml');
  if (!existsSync(configPath)) {
    return {};
  }
  return TOML.parse(readFileSync(configPath, 'utf8')) as RepoConfig;
}

function layoutForCreate(repoPath: string): LayoutMode {
  const layout = createLayoutForRepository(repoPath);
  if (!layout.supported) {
    throw new Error(`Unsupported layout: ${layout.label}`);
  }
  return layout.label === 'Sibling' ? 'sibling' : 'workspaces';
}

function remoteNames(repoPath: string): string[] {
  try {
    return execFileSync('git', ['remote'], { cwd: repoPath, encoding: 'utf8' })
      .split('\n')
      .map((name) => name.trim())
      .filter((name) => name !== '');
  } catch {
    return [];
  }
}

function remoteToFetch(repoPath: string, branch: string): string {
  const names = remoteNames(repoPath);
  const holders = names.filter((name) => hasRef(repoPath, `refs/remotes/${name}/${branch}`));
  if (holders.includes('origin') || holders.length === 0) {
    return 'origin';
  }
  return holders[0] ?? 'origin';
}

function commandText(value: string | Buffer | undefined): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  return '';
}

function gitCommandError(error: unknown): Error {
  const failed = error as { stderr?: string | Buffer; message?: string };
  const detail = commandText(failed.stderr).trim();
  if (detail !== '') {
    return new Error(detail);
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error('git failed');
}

function isMissingRemoteBranch(error: unknown): boolean {
  const failed = error as { stderr?: string | Buffer; message?: string };
  const text = `${commandText(failed.stderr)}\n${failed.message ?? ''}`;
  return text.toLowerCase().includes('find remote ref');
}

function runGit(repoPath: string, args: string[]): void {
  try {
    execFileSync('git', args, {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  } catch (error) {
    throw gitCommandError(error);
  }
}

type BranchCheckout = 'local' | 'new' | { remote: string };

function resolveBranch(repoPath: string, branch: string): BranchCheckout {
  if (hasRef(repoPath, `refs/heads/${branch}`)) {
    return 'local';
  }
  const remote = remoteToFetch(repoPath, branch);
  const trackingRef = `refs/remotes/${remote}/${branch}`;
  const expectsRemote = hasRef(repoPath, trackingRef);
  if (!expectsRemote && !remoteNames(repoPath).includes(remote)) {
    return 'new';
  }
  try {
    execFileSync('git', ['fetch', remote, branch], {
      cwd: repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  } catch (error) {
    if (!expectsRemote && isMissingRemoteBranch(error)) {
      return 'new';
    }
    throw gitCommandError(error);
  }
  if (!hasRef(repoPath, trackingRef)) {
    if (expectsRemote) {
      throw new Error(`Branch not found: ${branch}`);
    }
    return 'new';
  }
  return { remote };
}

function hasRef(repoPath: string, ref: string): boolean {
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', ref], {
      cwd: repoPath,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function runHookCommands(repoPath: string, commands: string[] | undefined): void {
  for (const command of commands ?? []) {
    execSync(command, { cwd: repoPath, stdio: 'inherit' });
  }
}

async function loadPlugins(
  repoPath: string,
  modules: string[] | undefined,
): Promise<WorktreePlugin[]> {
  if (!modules || modules.length === 0) {
    return [];
  }
  const jiti = createJiti(join(repoPath, 'package.json'));
  const plugins: WorktreePlugin[] = [];
  for (const modulePath of modules) {
    const plugin = await jiti.import<WorktreePlugin>(resolve(repoPath, modulePath), {
      default: true,
    });
    plugins.push(plugin);
  }
  return plugins;
}

async function runPrePlugins(plugins: WorktreePlugin[]): Promise<void> {
  for (const plugin of plugins) {
    const result = await plugin.preWorktreeCreate?.();
    if (result === 'abort') {
      throw new Error(`${plugin.name} aborted worktree create`);
    }
  }
}

async function runPostPlugins(plugins: WorktreePlugin[]): Promise<void> {
  for (const plugin of plugins) {
    await plugin.postWorktreeCreate?.();
  }
}

function copyConfiguredFiles(
  repoPath: string,
  checkout: string,
  files: string[] | undefined,
): void {
  for (const file of files ?? []) {
    const source = join(repoPath, file);
    if (!existsSync(source)) {
      continue;
    }
    const target = join(checkout, file);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
}

export function findCheckout(repoPath: string, branch: string): string | undefined {
  const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoPath,
    encoding: 'utf8',
  });
  for (const block of output.split('\n\n')) {
    let path: string | undefined;
    let ref: string | undefined;
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length);
      } else if (line.startsWith('branch ')) {
        ref = line.slice('branch '.length);
      }
    }
    if (path && ref === `refs/heads/${branch}`) {
      return path;
    }
  }
  return undefined;
}

export function findBranchCheckout(repoPath: string, branch: string): string {
  const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoPath,
    encoding: 'utf8',
  });
  const primary = resolve(repoPath);
  for (const block of output.split('\n\n')) {
    let path: string | undefined;
    let ref: string | undefined;
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length);
      } else if (line.startsWith('branch ')) {
        ref = line.slice('branch '.length);
      }
    }
    if (path && ref === `refs/heads/${branch}` && resolve(path) !== primary) {
      return path;
    }
  }
  throw new Error(`No worktree for branch: ${branch}`);
}

function checkoutPath(repositoryPath: string, layout: LayoutMode, folder: string): string {
  if (layout === 'sibling') {
    return join(dirname(repositoryPath), folder);
  }
  return join(repositoryPath, '.workspaces', folder);
}

export async function createWorktree(repoQuery: string, branch: string): Promise<string> {
  const repository = findRepository(repoQuery);
  if (!repository) {
    throw new Error(`Repository not found: ${repoQuery}`);
  }
  if (branch.trim() === '') {
    throw new Error('Enter a branch name');
  }

  const config = readRepoConfig(repository.path);
  const checkout = checkoutPath(repository.path, layoutForCreate(repository.path), folderName(branch));
  if (existsSync(checkout)) {
    throw new Error(`Worktree folder already exists: ${checkout}`);
  }

  const mode = resolveBranch(repository.path, branch);

  const plugins = await loadPlugins(repository.path, config.hooks?.modules);
  runHookCommands(repository.path, config.hooks?.pre_worktree_create?.commands);
  await runPrePlugins(plugins);

  mkdirSync(dirname(checkout), { recursive: true });
  if (mode === 'local') {
    runGit(repository.path, ['worktree', 'add', checkout, branch]);
  } else if (mode === 'new') {
    runGit(repository.path, ['worktree', 'add', '-b', branch, checkout, 'HEAD']);
  } else {
    runGit(repository.path, [
      'worktree',
      'add',
      '--track',
      '-b',
      branch,
      checkout,
      `${mode.remote}/${branch}`,
    ]);
  }

  copyConfiguredFiles(repository.path, checkout, config.copy?.files);
  runHookCommands(repository.path, config.hooks?.post_worktree_create?.commands);
  await runPostPlugins(plugins);
  return checkout;
}

export function removeWorktree(repoQuery: string, branch: string): void {
  const repository = findRepository(repoQuery);
  if (!repository) {
    throw new Error(`Repository not found: ${repoQuery}`);
  }
  const checkout = findBranchCheckout(repository.path, branch);
  execFileSync('git', ['worktree', 'remove', checkout], {
    cwd: repository.path,
    stdio: 'inherit',
  });
}
