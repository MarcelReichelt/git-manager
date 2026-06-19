import { fetchAll, listRemoteBranches } from '../core/git-service.js';
import { getActiveContext } from '../core/active-session.js';

export async function listBranches(): Promise<void> {
  const ctx = getActiveContext();
  if (!ctx) {
    console.error('No active repository');
    return;
  }
  const branches = await listRemoteBranches(ctx.repository.git_root);
  for (const b of branches) {
    console.log(`  origin/${b}`);
  }
}

export async function fetchBranches(): Promise<void> {
  const ctx = getActiveContext();
  if (!ctx) {
    console.error('No active repository');
    return;
  }
  await fetchAll(ctx.repository.git_root);
  console.log('Fetched all remotes');
}
