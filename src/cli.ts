#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { addRepository, listRepositories, unregisterRepository } from './registry.js';
import { createWorktree } from './worktrees.js';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };

const program = new Command();

program
  .name('git-manager')
  .description('Register repositories and manage their worktrees')
  .version(version);

program
  .command('add')
  .description('Register an existing local git repository')
  .requiredOption('--path <path>', 'Path to the local git repository')
  .requiredOption('--name <name>', 'Display name')
  .action((opts: { path: string; name: string }) => {
    try {
      addRepository(opts.path, opts.name);
    } catch (error) {
      fail(error);
    }
  });

program
  .command('unregister')
  .description('Remove a repository from the registry')
  .requiredOption('--path <path>', 'Path to the registered repository')
  .action((opts: { path: string }) => {
    try {
      unregisterRepository(opts.path);
    } catch (error) {
      fail(error);
    }
  });

program
  .command('list')
  .description('List registered repositories')
  .action(() => {
    try {
      for (const repo of listRepositories()) {
        console.log(`${repo.displayName}\t${repo.path}`);
      }
    } catch (error) {
      fail(error);
    }
  });

const worktree = program.command('worktree').description('Create and remove worktrees');

worktree
  .command('create <branch>')
  .description('Create a worktree for a branch')
  .requiredOption('--repo <repo>', 'Registered repository path or display name')
  .action(async (branch: string, opts: { repo: string }) => {
    try {
      const checkout = await createWorktree(opts.repo, branch);
      console.log(checkout);
    } catch (error) {
      fail(error);
    }
  });

function fail(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}

await program.parseAsync(process.argv);
