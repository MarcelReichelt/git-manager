import { execFileSync } from 'node:child_process';
import { createJiti } from 'jiti';
import { resolve } from 'node:path';

export type CreateHookContext = {
  phase: 'pre' | 'post';
  branch: string;
  worktreePath: string;
  repoPath: string;
};

export type GitManagerPlugin = {
  name: string;
  preWorktreeCreate?(context: CreateHookContext): Promise<'abort' | void> | 'abort' | void;
  postWorktreeCreate?(context: CreateHookContext): Promise<void> | void;
};

export class HookAbortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HookAbortError';
  }
}

export function runCreateShellCommands(commands: string[], context: CreateHookContext): void {
  for (const command of commands) {
    try {
      execFileSync('sh', ['-c', command], {
        cwd: context.repoPath,
        env: {
          ...process.env,
          GIT_MANAGER_BRANCH: context.branch,
          GIT_MANAGER_WORKTREE: context.worktreePath,
          GIT_MANAGER_REPO: context.repoPath,
        },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      const stderr =
        error instanceof Error && 'stderr' in error ? String((error as { stderr?: unknown }).stderr).trim() : '';
      throw new HookAbortError(stderr || `Create hook failed: ${command}`);
    }
  }
}

export async function runCreatePlugins(pluginPaths: string[], context: CreateHookContext): Promise<void> {
  const jiti = createJiti(import.meta.url);
  for (const pluginPath of pluginPaths) {
    const loaded = (await jiti.import(resolve(context.repoPath, pluginPath))) as {
      default?: GitManagerPlugin;
    } & GitManagerPlugin;
    const plugin = loaded.default ?? loaded;
    const method = context.phase === 'pre' ? plugin.preWorktreeCreate : plugin.postWorktreeCreate;
    if (!method) {
      continue;
    }
    const result = await method.call(plugin, context);
    if (context.phase === 'pre' && result === 'abort') {
      const name = plugin.name || pluginPath;
      throw new HookAbortError(`${name} aborted worktree creation`);
    }
  }
}
