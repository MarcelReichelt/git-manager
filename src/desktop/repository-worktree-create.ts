import { InjectionToken } from '@angular/core';

export const REPOSITORY_WORKTREE_CREATE_HOST = 'gitManagerWorktreeCreate';

export interface RepositoryWorktreeCreate {
  create(repositoryPath: string, branch: string): void;
}

export const REPOSITORY_WORKTREE_CREATE = new InjectionToken<RepositoryWorktreeCreate>(
  'Repository worktree create',
  {
    factory: () => {
      const host: unknown = Reflect.get(globalThis, REPOSITORY_WORKTREE_CREATE_HOST);
      if (!isRepositoryWorktreeCreate(host)) {
        throw new Error('Worktree create is unavailable');
      }
      return host;
    },
  },
);

function isRepositoryWorktreeCreate(host: unknown): host is RepositoryWorktreeCreate {
  return typeof host === 'object' && host !== null && 'create' in host && typeof host.create === 'function';
}
