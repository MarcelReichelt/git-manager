#!/usr/bin/env node
import { Command } from 'commander';
import { addRepository, listRepositories, unregisterRepository } from './registry.js';
import { mergeIntoMaster, updateFromMaster } from './merge.js';
import { createWorktree, removeWorktree } from './worktrees.js';

const program = new Command();
program.name('git-manager');

program
  .command('add')
  .requiredOption('--path <path>')
  .requiredOption('--name <name>')
  .action((options: { path: string; name: string }) => {
    addRepository(options.path, options.name);
  });

program
  .command('list')
  .action(() => {
    for (const repository of listRepositories()) {
      process.stdout.write(`${repository.displayName}\t${repository.path}\n`);
    }
  });

program
  .command('unregister')
  .requiredOption('--path <path>')
  .action((options: { path: string }) => {
    unregisterRepository(options.path);
  });

const worktree = program.command('worktree');
worktree
  .command('create')
  .argument('<branch>')
  .requiredOption('--repo <path-or-name>')
  .action(async (branch: string, options: { repo: string }) => {
    const checkout = await createWorktree(options.repo, branch);
    process.stdout.write(`${checkout}\n`);
  });
worktree
  .command('remove')
  .argument('<branch>')
  .requiredOption('--repo <path-or-name>')
  .action((branch: string, options: { repo: string }) => {
    removeWorktree(options.repo, branch);
  });

program
  .command('merge')
  .requiredOption('--repo <path-or-name>')
  .option('--update-from-master <branch>')
  .option('--into-master <branch>')
  .option('--squash')
  .action(
    (options: {
      repo: string;
      updateFromMaster?: string;
      intoMaster?: string;
      squash?: boolean;
    }) => {
      const squash = options.squash ?? false;
      if (options.updateFromMaster && options.intoMaster) {
        throw new Error('Pass only one of --update-from-master or --into-master');
      }
      if (options.updateFromMaster) {
        updateFromMaster(options.repo, options.updateFromMaster, squash);
        return;
      }
      if (options.intoMaster) {
        mergeIntoMaster(options.repo, options.intoMaster, squash);
        return;
      }
      throw new Error('Pass --update-from-master or --into-master');
    },
  );

try {
  await program.parseAsync(process.argv);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
