#!/usr/bin/env node
import { Command } from 'commander';
import {
  addRepository,
  listRepositories,
  unregisterRepository,
  type LayoutMode,
} from './registry.js';
import { mergeIntoMaster, updateFromMaster } from './merge.js';
import { createWorktree } from './worktrees.js';

const program = new Command();
program.name('git-manager');

function layoutMode(value: string): LayoutMode {
  if (value !== 'workspaces' && value !== 'sibling') {
    throw new Error(`Unsupported layout: ${value}`);
  }
  return value;
}

program
  .command('add')
  .requiredOption('--path <path>')
  .requiredOption('--name <name>')
  .option('--layout <layout>', 'worktree layout', 'workspaces')
  .action((options: { path: string; name: string; layout: string }) => {
    addRepository(options.path, options.name, layoutMode(options.layout));
  });

program
  .command('list')
  .action(() => {
    for (const repository of listRepositories()) {
      process.stdout.write(
        `${repository.displayName}\t${repository.path}\t${repository.layout}\n`,
      );
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
