import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import TOML from '@iarna/toml';
import {
  findRepository,
  type LayoutMode,
  type RegisteredRepository,
} from './registry.js';

interface RepoConfig {
  layout?: { mode?: string };
  hooks?: {
    pre_worktree_create?: { commands?: string[] };
    post_worktree_create?: { commands?: string[] };
  };
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

  runHookCommands(repository.path, config.hooks?.pre_worktree_create?.commands);

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
  return checkout;
}
