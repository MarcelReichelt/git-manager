import { select } from '@inquirer/prompts';
import { ensureSetup } from './setup.js';
import { runStartupHealthCheck } from './doctor.js';
import { registerFromCwd } from '../core/register-service.js';
import { getActiveContext, getActiveRepository } from '../core/active-session.js';
import { printStatusHeader } from '../core/status-display.js';
import { getChangesForPath } from '../core/changes-service.js';
import { repoPicker } from './repo.js';
import { isGitRepo } from '../core/git-service.js';
import { showChanges } from './changes.js';
import { openWorktree } from './worktree.js';
import { editSettingsInteractive } from './settings.js';
import { pullWorktreeCmd, pushWorktreeCmd, createWorktreeCmd } from './worktree.js';
import { mergeIntoPrimaryCmd, mergeFromPrimaryCmd } from './merge.js';
import { listRemoteBranches } from '../core/git-service.js';
import { input } from '@inquirer/prompts';

export async function runDefaultCommand(): Promise<void> {
  await ensureSetup();
  await runStartupHealthCheck();

  if (await isGitRepo(process.cwd())) {
    await registerFromCwd();
  } else if (!getActiveRepository()) {
    await repoPicker();
  }

  const ctx = getActiveContext();
  let changes;
  if (ctx) {
    changes = await getChangesForPath(ctx.worktree.path, {
      worktreeId: ctx.worktree.id,
      label: ctx.worktree.label ?? ctx.worktree.branch,
      branch: ctx.worktree.branch,
    });
  }
  printStatusHeader(changes);

  const choice = await select({
    message: 'What would you like to do?',
    choices: [
      { name: 'Open editor', value: 'open' },
      { name: 'Show changes', value: 'changes' },
      { name: 'Switch worktree', value: 'worktree' },
      { name: 'Change repository', value: 'repo' },
      { name: 'Pull worktree', value: 'pull' },
      { name: 'Push worktree', value: 'push' },
      { name: 'Create worktree', value: 'create' },
      { name: 'Merge into primary', value: 'merge-in' },
      { name: 'Merge from primary', value: 'merge-from' },
      { name: 'Settings', value: 'settings' },
      { name: 'Launch TUI', value: 'tui' },
      { name: 'Exit', value: 'exit' },
    ],
  });

  switch (choice) {
    case 'open':
      await openWorktree();
      break;
    case 'changes':
      await showChanges();
      break;
    case 'worktree': {
      const { switchWorktreeCmd } = await import('./worktree.js');
      const q = await input({ message: 'Worktree label or branch' });
      await switchWorktreeCmd(q);
      break;
    }
    case 'repo':
      await repoPicker();
      break;
    case 'pull':
      await pullWorktreeCmd();
      break;
    case 'push':
      await pushWorktreeCmd();
      break;
    case 'create': {
      const ctx2 = getActiveContext();
      if (ctx2) {
        const branches = await listRemoteBranches(ctx2.repository.git_root);
        const branch = await select({
          message: 'Branch',
          choices: branches.map((b) => ({ name: b, value: b })),
        });
        await createWorktreeCmd(branch);
      }
      break;
    }
    case 'merge-in':
      await mergeIntoPrimaryCmd();
      break;
    case 'merge-from':
      await mergeFromPrimaryCmd();
      break;
    case 'settings':
      await editSettingsInteractive();
      break;
    case 'tui': {
      const { launchTui } = await import('./ui.js');
      await launchTui();
      break;
    }
    default:
      break;
  }
}
