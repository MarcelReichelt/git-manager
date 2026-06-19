import { isGitRepo } from './git-service.js';
import { registerFromCwd } from './register-service.js';
import { getActiveRepository } from './active-session.js';
import { repoPicker } from '../commands/repo.js';

export async function ensureActiveRepository(options: { promptIfMissing?: boolean } = {}): Promise<void> {
  if (await isGitRepo(process.cwd())) {
    await registerFromCwd();
    return;
  }
  if (!getActiveRepository() && options.promptIfMissing !== false) {
    await repoPicker();
  }
}
