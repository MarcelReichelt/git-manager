#!/usr/bin/env node
import { confirm } from '@inquirer/prompts';
import { Command } from 'commander';
import { addRepository, listRepositories, unregisterRepository } from './registry.js';
import { mergeIntoMaster, updateFromMaster } from './merge.js';
import { assertWorktreeRemovable, createWorktree, removeWorktree } from './worktrees.js';

const program = new Command();
program.name('git-worktree-manager');

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
  .option('--delete-branch', 'Delete the local branch after removing the worktree')
  .option('--keep-branch', 'Keep the local branch after removing the worktree')
  .option('--force', 'Remove the worktree even when it has changes')
  .action(async (
    branch: string,
    options: { repo: string; deleteBranch?: boolean; keepBranch?: boolean; force?: boolean },
  ) => {
    if (options.deleteBranch && options.keepBranch) {
      throw new Error('Pass only one of --delete-branch or --keep-branch');
    }
    assertWorktreeRemovable(options.repo, branch);
    const deleteBranch = await chooseDeleteBranch(branch, options.deleteBranch, options.keepBranch);
    await removeWorktree(options.repo, branch, { deleteBranch, force: options.force === true });
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

async function chooseDeleteBranch(
  branch: string,
  deleteBranch: boolean | undefined,
  keepBranch: boolean | undefined,
): Promise<boolean> {
  if (deleteBranch) {
    return true;
  }
  if (keepBranch) {
    return false;
  }
  if (process.stdin.isTTY !== true) {
    throw new Error('Pass --delete-branch or --keep-branch');
  }
  return confirm({
    message: `Delete the local branch ${branch}? The remote branch stays.`,
    default: false,
  });
}

try {
  await program.parseAsync(process.argv);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
