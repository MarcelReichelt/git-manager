#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { addRepository, listRepositories, unregisterRepository } from './registry.js';
import { mergeFromMasterTree, mergeIntoMasterTree, mergeSourceIntoTarget } from './merge.js';
import { createWorktree, removeWorktree } from './worktrees.js';

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

worktree
  .command('remove <branch>')
  .description('Remove a branch worktree')
  .requiredOption('--repo <repo>', 'Registered repository path or display name')
  .action((branch: string, opts: { repo: string }) => {
    try {
      removeWorktree(opts.repo, branch);
    } catch (error) {
      fail(error);
    }
  });

program
  .command('merge')
  .description('Merge into or from the master tree')
  .requiredOption('--repo <repo>', 'Registered repository path or display name')
  .option('--into-master-tree <branch>', 'Merge this branch into the master tree')
  .option('--from-master-tree <branch>', 'Merge the master tree into this branch')
  .option('--source <branch>', 'Branch to merge from')
  .option('--target <branch>', 'Branch to merge into')
  .option('--squash', 'Squash the merge into one commit')
  .action(
    (opts: {
      repo: string;
      intoMasterTree?: string;
      fromMasterTree?: string;
      source?: string;
      target?: string;
      squash?: boolean;
    }) => {
      try {
        const squash = opts.squash === true;
        if (opts.intoMasterTree && opts.fromMasterTree) {
          throw new Error('Choose either into the master tree or from the master tree');
        }
        if ((opts.intoMasterTree || opts.fromMasterTree) && (opts.source || opts.target)) {
          throw new Error('Use master-tree options or an explicit source and target');
        }
        if (opts.intoMasterTree) {
          mergeIntoMasterTree(opts.repo, opts.intoMasterTree, squash);
          return;
        }
        if (opts.fromMasterTree) {
          mergeFromMasterTree(opts.repo, opts.fromMasterTree, squash);
          return;
        }
        if (opts.source || opts.target) {
          if (!opts.source || !opts.target) {
            throw new Error('Name both a source and a target');
          }
          mergeSourceIntoTarget(opts.repo, opts.source, opts.target, squash);
          return;
        }
        throw new Error('Name the branch to merge into or from the master tree');
      } catch (error) {
        fail(error);
      }
    },
  );

function fail(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}

await program.parseAsync(process.argv);
