import { isGitRepo } from './git-service.js';
import { registerFromCwd } from './register-service.js';
import { repoPicker } from '../commands/repo.js';

export async function ensureActiveRepository(
  options: { promptIfMissing?: boolean } = {},
): Promise<{ outsideRepo: boolean }> {
  const outsideRepo = !(await isGitRepo(process.cwd()));
  if (!outsideRepo) {
    await registerFromCwd();
    return { outsideRepo: false };
  }
  if (options.promptIfMissing !== false) {
    await repoPicker();
  }
  return { outsideRepo: true };
}
