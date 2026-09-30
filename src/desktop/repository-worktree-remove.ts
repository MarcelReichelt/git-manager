import { InjectionToken } from '@angular/core';

export const REPOSITORY_WORKTREE_REMOVE_HOST = 'gitManagerWorktreeRemove';

export interface RepositoryWorktreeRemove {
  remove(repositoryPath: string, branch: string): void;
}

export const REPOSITORY_WORKTREE_REMOVE = new InjectionToken<RepositoryWorktreeRemove>(
  'Repository worktree remove',
  {
    factory: () => {
      const host: unknown = Reflect.get(globalThis, REPOSITORY_WORKTREE_REMOVE_HOST);
      if (!isRepositoryWorktreeRemove(host)) {
        throw new Error('Worktree remove is unavailable');
      }
      return host;
    },
  },
);

function isRepositoryWorktreeRemove(host: unknown): host is RepositoryWorktreeRemove {
  return typeof host === 'object' && host !== null && 'remove' in host && typeof host.remove === 'function';
}
