import { getActiveContext, resolveWorktree } from '../core/active-session.js';
import {
  mergeIntoPrimary,
  mergeFromPrimary,
  mergeWorktrees,
} from '../core/merge-service.js';

export async function mergeIntoPrimaryCmd(from?: string, options: { force?: boolean } = {}): Promise<void> {
  const ctx = getActiveContext();
  if (!ctx) {
    console.error('No active repository');
    return;
  }
  const source = from ?? ctx.worktree.label ?? ctx.worktree.branch;
  await mergeIntoPrimary(ctx.repository, source, options);
  console.log(`Merged ${source} into primary`);
}

export async function mergeFromPrimaryCmd(to?: string, options: { force?: boolean } = {}): Promise<void> {
  const ctx = getActiveContext();
  if (!ctx) {
    console.error('No active repository');
    return;
  }
  const target = to ?? ctx.worktree.label ?? ctx.worktree.branch;
  await mergeFromPrimary(ctx.repository, target, options);
  console.log(`Merged primary into ${target}`);
}

export async function mergeWorktreesCmd(
  source: string,
  target: string,
  options: { force?: boolean } = {},
): Promise<void> {
  const ctx = getActiveContext();
  if (!ctx) {
    console.error('No active repository');
    return;
  }
  await mergeWorktrees(ctx.repository, source, target, options);
  console.log(`Merged ${source} into ${target}`);
}
