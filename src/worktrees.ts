import { execFileSync, execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import TOML from '@iarna/toml';
import { createJiti } from 'jiti';
import {
  findRepository,
  type LayoutMode,
  type RegisteredRepository,
} from './registry.js';

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
  const configPath = join(repoPath, '.git-manager', 'config.toml');
  if (!existsSync(configPath)) {
    return {};
  }
  return TOML.parse(readFileSync(configPath, 'utf8')) as RepoConfig;
}

function layoutForCreate(repository: RegisteredRepository, config: RepoConfig): LayoutMode {
  const mode = config.layout?.mode;
  if (mode === undefined) {
    return repository.layout;
  }
  if (mode !== 'workspaces' && mode !== 'sibling') {
    throw new Error(`Unsupported layout: ${mode}`);
  }
  return mode;
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

  const config = readRepoConfig(repository.path);
  const checkout = checkoutPath(
    repository.path,
    layoutForCreate(repository, config),
    folderName(branch),
  );
  if (existsSync(checkout)) {
    throw new Error(`Worktree folder already exists: ${checkout}`);
  }

  const localBranch = hasRef(repository.path, `refs/heads/${branch}`);
  if (!localBranch) {
    execFileSync('git', ['fetch', 'origin', branch], {
      cwd: repository.path,
      stdio: 'inherit',
    });
    if (!hasRef(repository.path, `refs/remotes/origin/${branch}`)) {
      throw new Error(`Branch not found: ${branch}`);
    }
  }

  const plugins = await loadPlugins(repository.path, config.hooks?.modules);
  runHookCommands(repository.path, config.hooks?.pre_worktree_create?.commands);
  await runPrePlugins(plugins);

  mkdirSync(dirname(checkout), { recursive: true });
  if (localBranch) {
    execFileSync('git', ['worktree', 'add', checkout, branch], {
      cwd: repository.path,
      stdio: 'inherit',
    });
  } else {
    execFileSync(
      'git',
      ['worktree', 'add', '--track', '-b', branch, checkout, `origin/${branch}`],
      { cwd: repository.path, stdio: 'inherit' },
    );
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
