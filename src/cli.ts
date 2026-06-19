#!/usr/bin/env node
import { Command } from 'commander';
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

const program = new Command();

program
  .name('git-manager')
  .description('TypeScript git repository manager with worktrees, merge, and TUI')
  .version('0.1.0')
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
  .command('create <branch>')
  .option('--new')
  .action(async (branchName, opts) => {
    await ensureSetup();
    await createWorktreeCmd(branchName, { newBranch: opts.new });
  });
wt
  .command('remove [label]')
  .option('--force')
  .action(async (label, opts) => {
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

const merge = program.command('merge').description('Merge between worktrees');
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

function handleError(err: unknown): void {
  if (err instanceof HookAbortError) {
    console.log(err.message);
    process.exit(0);
  }
  console.error((err as Error).message ?? err);
  process.exit(1);
}

program.parseAsync(process.argv);
