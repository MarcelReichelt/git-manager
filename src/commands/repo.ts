import { confirm, input, select } from '@inquirer/prompts';
import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  listRepositories,
  getRepositoryByName,
  deleteRepository,
  type Repository,
} from '../core/registry.js';
import {
  getActiveRepository,
  activateRepository,
  getActiveContext,
} from '../core/active-session.js';
import { syncWorktreesFromGit } from '../core/worktree-service.js';
import { registerFromPath, registerFromCwd } from '../core/register-service.js';
import { interactiveClone } from './clone.js';
import { loadGlobalConfig } from '../config/loader.js';
import { expandHome } from '../config/paths.js';
import { isGitRepo } from '../core/git-service.js';
import { openEditor } from '../core/editor-service.js';

export async function repoPicker(options: {
  open?: boolean;
  worktree?: string;
  name?: string;
} = {}): Promise<Repository> {
  if (options.name) {
    const repo = getRepositoryByName(options.name);
    if (!repo) {
      throw new Error(`Repository not found: ${options.name}`);
    }
    return switchToRepo(repo, options);
  }

  const repos = listRepositories();
  const active = getActiveRepository();
  const choices = [
    ...repos.map((r) => ({
      name: `${r.name}${active?.id === r.id ? ' *' : ''}`,
      value: r.name,
    })),
    { name: '─────────────', value: '__sep__', disabled: true },
    { name: '+ Clone new repository…', value: '__clone__' },
    { name: '+ Add existing repository…', value: '__add__' },
  ];

  const choice = await select<string>({
    message: 'Repository',
    choices: choices as Parameters<typeof select>[0]['choices'],
  });

  if (choice === '__clone__') {
    await interactiveClone();
    const repo = getActiveRepository();
    if (!repo) {
      throw new Error('Clone failed to register repository');
    }
    return repo;
  }

  if (choice === '__add__') {
    return addExistingRepo();
  }

  const repo = getRepositoryByName(choice);
  if (!repo) {
    throw new Error(`Repository not found: ${choice}`);
  }
  return switchToRepo(repo, options);
}

async function switchToRepo(
  repo: Repository,
  options: { open?: boolean; worktree?: string } = {},
): Promise<Repository> {
  await syncWorktreesFromGit(repo);
  const ctx = activateRepository(repo.id);
  if (options.worktree) {
    const { switchWorktree } = await import('../core/active-session.js');
    switchWorktree(repo.id, options.worktree);
  }
  console.log(`Active repository: ${repo.name}`);
  if (options.open) {
    const active = getActiveContext();
    if (active) {
      openEditor(active.worktree.path, repo.path);
    }
  }
  return repo;
}

export async function addExistingRepo(path?: string): Promise<Repository> {
  let targetPath = path;
  if (!targetPath) {
    const global = loadGlobalConfig();
    const cloneRoot = expandHome(global.defaults.clone_root);
    const suggestions: string[] = [];
    if (existsSync(cloneRoot)) {
      for (const entry of readdirSync(cloneRoot, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const full = join(cloneRoot, entry.name);
          if (await isGitRepo(full)) {
            suggestions.push(full);
          }
        }
      }
    }
    targetPath = await input({
      message: 'Path to existing repository',
      default: suggestions[0] ?? process.cwd(),
    });
  }
  const repo = await registerFromPath(targetPath);
  console.log(`Registered: ${repo.name}`);
  return repo;
}

export function listRepos(options: { changes?: boolean } = {}): void {
  const repos = listRepositories();
  const active = getActiveRepository();
  for (const repo of repos) {
    const marker = active?.id === repo.id ? '* ' : '  ';
    console.log(`${marker}${repo.name} (${repo.layout_mode})`);
  }
}

export function showCurrentRepo(): void {
  const ctx = getActiveContext();
  if (!ctx) {
    console.log('No active repository');
    return;
  }
  const label = ctx.worktree.label ?? ctx.worktree.branch;
  console.log(`${ctx.repository.name} / ${label} (${ctx.worktree.branch})`);
}

export async function unregisterRepo(name?: string): Promise<void> {
  const repo = name ? getRepositoryByName(name) : getActiveRepository();
  if (!repo) {
    throw new Error('Repository not found');
  }
  const ok = await confirm({
    message: `Unregister ${repo.name}? (files stay on disk)`,
    default: false,
  });
  if (ok) {
    deleteRepository(repo.id);
    console.log(`Unregistered ${repo.name}`);
  }
}

export async function registerCurrent(): Promise<void> {
  const repo = await registerFromCwd();
  console.log(`Registered: ${repo.name}`);
}
