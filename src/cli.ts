#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';

const { version } = createRequire(import.meta.url)('../package.json') as { version: string };
import { setGlobalOptions } from './core/global-options.js';
import { ensureSetup } from './commands/setup.js';
import { runDefaultCommand } from './commands/default.js';
import { cloneRepo } from './commands/clone.js';
import {
  repoPicker,
  listRepos,
  showCurrentRepo,
  unregisterRepo,
  addExistingRepo,
  registerCurrent,
} from './commands/repo.js';
import {
  listWorktreesCmd,
  switchWorktreeCmd,
  worktreePath,
  openWorktree,
  createWorktreeCmd,
  removeWorktreeCmd,
  pullWorktreeCmd,
  pushWorktreeCmd,
} from './commands/worktree.js';
import { listBranches, fetchBranches } from './commands/branch.js';
import { showChanges } from './commands/changes.js';
import {
  mergeIntoPrimaryCmd,
  mergeFromPrimaryCmd,
  mergeWorktreesCmd,
} from './commands/merge.js';
import { runDoctor } from './commands/doctor.js';
import {
  showSettings,
  editSettingsInteractive,
  setSetting,
  resetSettings,
  runSetupWizard,
} from './commands/settings.js';
import { showEffectiveConfig, initRepoConfig } from './commands/config.js';
import { showDocs } from './commands/docs.js';
import { launchTui } from './commands/ui.js';
import { HookAbortError } from './hooks/types.js';
import {
  addRegisteredRepository,
  listRegisteredRepositories,
  unregisterRegisteredRepository,
} from './core/registered-repositories.js';
import { createRepositoryWorktree } from './core/create-repository-worktree.js';
import { mergeRepositoryBranch, type RepositoryMergeDirection } from './core/merge-repository-branch.js';
import { removeRepositoryWorktree } from './core/remove-repository-worktree.js';

const program = new Command();

program
  .name('git-manager')
  .description('TypeScript git repository manager with worktrees, merge, and TUI')
  .version(version)
  .option('--verbose', 'Show filesystem paths')
  .option('--no-hooks', 'Skip all hooks')
  .option('--no-pre-hooks', 'Skip pre hooks')
  .option('--no-post-hooks', 'Skip post hooks')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    setGlobalOptions({
      verbose: opts.verbose ?? false,
      noHooks: opts.noHooks ?? false,
      noPreHooks: opts.noPreHooks ?? false,
      noPostHooks: opts.noPostHooks ?? false,
    });
  });

program
  .action(async () => {
    try {
      await runDefaultCommand();
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('add')
  .description('Register an existing local git repository')
  .requiredOption('--path <path>', 'Path to the existing local git repository')
  .requiredOption('--display-name <name>', 'Display name to show for this repository')
  .action((opts: { path: string; displayName: string }) => {
    try {
      addRegisteredRepository(opts.path, opts.displayName);
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('list')
  .description('List registered repositories by display name and path')
  .action(() => {
    for (const repository of listRegisteredRepositories()) {
      console.log(`${repository.displayName}\t${repository.path}`);
    }
  });

program
  .command('unregister')
  .description('Remove a registered repository from the registry')
  .requiredOption('--path <path>', 'Path of the registered repository to remove')
  .action((opts: { path: string }) => {
    try {
      unregisterRegisteredRepository(opts.path);
    } catch (err) {
      handleError(err);
    }
  });

program
  .command('setup')
  .description('Run first-run settings wizard')
  .action(async () => {
    try {
      await runSetupWizard();
    } catch (err) {
      handleError(err);
    }
  });

const settings = program.command('settings').description('Manage global settings');
settings
  .command('show')
  .action(() => showSettings());
settings
  .command('edit')
  .action(async () => {
    await ensureSetup();
    await editSettingsInteractive();
  });
settings
  .command('set')
  .argument('<key>')
  .argument('<value>')
  .action((key, value) => setSetting(key, value));
settings
  .command('reset')
  .argument('[key]')
  .action(async (key) => resetSettings(key));
settings
  .command('wizard')
  .action(async () => runSetupWizard());

const repo = program.command('repo').description('Manage registered repositories');
repo.command('list').option('--changes').action(async (opts) => listRepos(opts));
repo.command('current').action(() => showCurrentRepo());
repo
  .command('switch [name]')
  .option('--worktree <label>')
  .option('--open')
  .action(async (name, opts) => {
    await ensureSetup();
    await repoPicker({ name, worktree: opts.worktree, open: opts.open });
  });
repo
  .command('add')
  .option('--path <dir>')
  .action(async (opts) => {
    await ensureSetup();
    await addExistingRepo(opts.path);
  });
repo
  .command('unregister [name]')
  .action(async (name) => unregisterRepo(name));

program
  .command('register')
  .description('Register current git repository')
  .action(async () => {
    await ensureSetup();
    await registerCurrent();
  });

program
  .command('clone <url>')
  .option('--dir <name>')
  .option('--here')
  .option('--path <absolute>')
  .option('--layout <mode>')
  .action(async (url, opts) => {
    await ensureSetup();
    await cloneRepo(url, opts);
  });

const branch = program.command('branch').description('Remote branch operations');
branch.command('list').action(async () => {
  await ensureSetup();
  await listBranches();
});
branch.command('fetch').action(async () => {
  await ensureSetup();
  await fetchBranches();
});

const wt = program.command('worktree').description('Worktree operations');
wt.command('list').action(async () => {
  await ensureSetup();
  await listWorktreesCmd();
});
wt
  .command('switch [label]')
  .action(async (label) => {
    await ensureSetup();
    await switchWorktreeCmd(label);
  });
wt
  .command('path [label]')
  .action(async (label) => {
    await ensureSetup();
    await worktreePath(label);
  });
wt
  .command('open [label]')
  .option('--editor <cmd>')
  .action(async (label, opts) => {
    await ensureSetup();
    await openWorktree(label, opts.editor);
  });
wt
  .command('create [branch]')
  .description('Create a worktree for a branch')
  .option('--new', 'Create a new branch in the active repository')
  .option('--path <path>', 'Path to the main repository')
  .option('--branch <name>', 'Branch to check out in that repository')
  .action(async (branchName: string | undefined, opts: { new?: boolean; path?: string; branch?: string }) => {
    if (opts.path !== undefined || opts.branch !== undefined) {
      try {
        if (typeof opts.path !== 'string' || typeof opts.branch !== 'string') {
          throw new Error('Both --path and --branch are required');
        }
        console.log(createRepositoryWorktree(opts.path, opts.branch));
      } catch (err) {
        handleError(err);
      }
      return;
    }
    if (!branchName) {
      console.error('Branch is required');
      process.exit(1);
    }
    await ensureSetup();
    await createWorktreeCmd(branchName, { newBranch: opts.new });
  });
wt
  .command('remove [label]')
  .description('Remove a worktree for a branch')
  .option('--force')
  .option('--path <path>', 'Path to the repository')
  .option('--branch <name>', 'Branch whose worktree to remove')
  .action(async (label: string | undefined, opts: { force?: boolean; path?: string; branch?: string }) => {
    if (opts.path !== undefined || opts.branch !== undefined) {
      try {
        if (typeof opts.path !== 'string' || typeof opts.branch !== 'string') {
          throw new Error('Both --path and --branch are required');
        }
        removeRepositoryWorktree(opts.path, opts.branch);
      } catch (err) {
        handleError(err);
      }
      return;
    }
    await ensureSetup();
    if (!label) {
      console.error('Label required');
      process.exit(1);
    }
    await removeWorktreeCmd(label, { force: opts.force });
  });
wt
  .command('pull [label]')
  .option('--rebase')
  .option('--all')
  .action(async (label, opts) => {
    await ensureSetup();
    await pullWorktreeCmd(label, opts);
  });
wt
  .command('push [label]')
  .option('--set-upstream')
  .option('--strict')
  .option('--force-with-lease')
  .action(async (label, opts) => {
    await ensureSetup();
    await pushWorktreeCmd(label, opts);
  });

program
  .command('changes')
  .option('--worktree <label>')
  .option('--all')
  .option('--files')
  .action(async (opts) => {
    await ensureSetup();
    await showChanges(opts);
  });

const merge = program
  .command('merge')
  .description('Merge between worktrees')
  .option('--path <path>', 'Path to the repository')
  .option('--branch <name>', 'Branch to update from master or merge into master')
  .option('--update-from-master', 'Bring commits from master into the branch')
  .option('--into-master', 'Merge the branch into master')
  .option('--squash', 'Squash that merge into one commit')
  .action((opts: RepositoryMergeOptions) => {
    if (!isRepositoryMerge(opts)) {
      merge.help({ error: true });
    }
    try {
      mergeRepositoryBranch(requiredPath(opts), requiredBranch(opts), mergeDirection(opts), {
        squash: opts.squash === true,
      });
    } catch (err) {
      handleError(err);
    }
  });
merge
  .command('into-primary')
  .option('--from <label>')
  .option('--force')
  .action(async (opts) => {
    await ensureSetup();
    await mergeIntoPrimaryCmd(opts.from, { force: opts.force });
  });
merge
  .command('from-primary')
  .option('--to <label>')
  .option('--force')
  .action(async (opts) => {
    await ensureSetup();
    await mergeFromPrimaryCmd(opts.to, { force: opts.force });
  });
merge
  .command('<source> <target>')
  .option('--force')
  .action(async (source, target, opts) => {
    await ensureSetup();
    await mergeWorktreesCmd(source, target, { force: opts.force });
  });

program
  .command('doctor')
  .option('--fix')
  .action(async (opts) => {
    await ensureSetup();
    await runDoctor(opts);
  });

program
  .command('docs [topic]')
  .action((topic) => showDocs(topic));

const config = program.command('config').description('Per-repo configuration');
config.command('init').action(async () => {
  await ensureSetup();
  initRepoConfig();
});
config.command('show').action(async () => {
  await ensureSetup();
  showEffectiveConfig();
});

program
  .command('ui')
  .description('Launch Ink TUI')
  .action(async () => {
    try {
      await ensureSetup();
      await launchTui();
    } catch (err) {
      handleError(err);
    }
  });

interface RepositoryMergeOptions {
  readonly path?: string;
  readonly branch?: string;
  readonly updateFromMaster?: boolean;
  readonly intoMaster?: boolean;
  readonly squash?: boolean;
}

function isRepositoryMerge(opts: RepositoryMergeOptions): boolean {
  return (
    opts.path !== undefined ||
    opts.branch !== undefined ||
    opts.updateFromMaster === true ||
    opts.intoMaster === true ||
    opts.squash === true
  );
}

function requiredPath(opts: RepositoryMergeOptions): string {
  if (typeof opts.path !== 'string') {
    throw new Error('Both --path and --branch are required');
  }
  return opts.path;
}

function requiredBranch(opts: RepositoryMergeOptions): string {
  if (typeof opts.branch !== 'string') {
    throw new Error('Both --path and --branch are required');
  }
  return opts.branch;
}

function mergeDirection(opts: RepositoryMergeOptions): RepositoryMergeDirection {
  if (opts.updateFromMaster === true && opts.intoMaster === true) {
    throw new Error('Choose either --update-from-master or --into-master');
  }
  if (opts.updateFromMaster === true) {
    return 'update-from-master';
  }
  if (opts.intoMaster === true) {
    return 'into-master';
  }
  throw new Error('Choose --update-from-master or --into-master');
}

function handleError(err: unknown): void {
  if (err instanceof HookAbortError) {
    console.log(err.message);
    process.exit(0);
  }
  console.error((err as Error).message ?? err);
  process.exit(1);
}

program.parseAsync(process.argv);
