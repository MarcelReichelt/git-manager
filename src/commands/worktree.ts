import { getActiveContext, resolveWorktree } from '../core/active-session.js';
import { listWorktrees } from '../core/registry.js';
import { createWorktree, removeWorktreeEntry } from '../core/worktree-service.js';
import { pullWorktree, pushWorktree, pullAllWorktrees } from '../core/sync-service.js';
import { openEditor } from '../core/editor-service.js';
import { globalOptions } from '../core/global-options.js';
import { confirm } from '@inquirer/prompts';
import { getChangesForPath } from '../core/changes-service.js';

export async function listWorktreesCmd(): Promise<void> {
  const ctx = getActiveContext();
  if (!ctx) {
    console.error('No active repository');
    return;
  }
  const worktrees = listWorktrees(ctx.repository.id);
  for (const wt of worktrees) {
    const active = wt.id === ctx.worktree.id ? '* ' : '  ';
    const pathInfo = globalOptions.verbose ? `  ${wt.path}` : '';
    console.log(`${active}${wt.label ?? wt.branch} (${wt.branch})${pathInfo}`);
  }
}

export async function switchWorktreeCmd(query?: string): Promise<void> {
  const ctx = getActiveContext();
  if (!ctx) {
    console.error('No active repository');
    return;
  }
  const { switchWorktree } = await import('../core/active-session.js');
  const wt = switchWorktree(ctx.repository.id, query ?? ctx.worktree.label ?? ctx.worktree.branch);
  console.log(`Active worktree: ${wt.label ?? wt.branch} (${wt.branch})`);
}

export async function worktreePath(query?: string): Promise<void> {
  const ctx = getActiveContext();
  if (!ctx) {
    console.error('No active repository');
    return;
  }
  const wt = resolveWorktree(ctx.repository.id, query);
  console.log(wt.path);
}

export async function openWorktree(query?: string, editor?: string): Promise<void> {
  const ctx = getActiveContext();
  if (!ctx) {
    console.error('No active repository');
    return;
  }
  const wt = query ? resolveWorktree(ctx.repository.id, query) : ctx.worktree;
  if (query) {
    const { switchWorktree } = await import('../core/active-session.js');
    switchWorktree(ctx.repository.id, query);
  }
  openEditor(wt.path, ctx.repository.path, editor);
  console.log(`Opened editor for ${wt.label ?? wt.branch}`);
}

export async function createWorktreeCmd(
  branch: string,
  options: { newBranch?: boolean } = {},
): Promise<void> {
  const ctx = getActiveContext();
  if (!ctx) {
    console.error('No active repository');
    return;
  }
  const wt = await createWorktree(ctx.repository, branch, { newBranch: options.newBranch });
  console.log(`Created worktree: ${wt.label ?? wt.branch}`);
}

export async function removeWorktreeCmd(
  query: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const ctx = getActiveContext();
  if (!ctx) {
    console.error('No active repository');
    return;
  }
  const wt = resolveWorktree(ctx.repository.id, query);
  if (!options.force) {
    const changes = await getChangesForPath(wt.path, {
      worktreeId: wt.id,
      label: wt.label ?? wt.branch,
      branch: wt.branch,
    });
    if (!changes.isClean) {
      const ok = await confirm({
        message: 'Worktree has uncommitted changes. Force remove?',
        default: false,
      });
      if (!ok) return;
      options.force = true;
    }
  }
  await removeWorktreeEntry(ctx.repository, wt, { force: options.force });
  console.log(`Removed worktree: ${wt.label ?? wt.branch}`);
}

export async function pullWorktreeCmd(
  query?: string,
  options: { rebase?: boolean; all?: boolean } = {},
): Promise<void> {
  const ctx = getActiveContext();
  if (!ctx) {
    console.error('No active repository');
    return;
  }
  if (options.all) {
    await pullAllWorktrees(ctx.repository, listWorktrees(ctx.repository.id));
    return;
  }
  const wt = resolveWorktree(ctx.repository.id, query);
  await pullWorktree(ctx.repository, wt, { rebase: options.rebase });
  console.log(`Pulled ${wt.label ?? wt.branch}`);
}

export async function pushWorktreeCmd(
  query?: string,
  options: { setUpstream?: boolean; strict?: boolean; forceWithLease?: boolean } = {},
): Promise<void> {
  const ctx = getActiveContext();
  if (!ctx) {
    console.error('No active repository');
    return;
  }
  const wt = resolveWorktree(ctx.repository.id, query);
  await pushWorktree(ctx.repository, wt, options);
  console.log(`Pushed ${wt.label ?? wt.branch}`);
}
