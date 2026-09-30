import { InjectionToken } from '@angular/core';

export const REPOSITORY_BRANCH_MERGE_HOST = 'gitManagerBranchMerge';

export interface RepositoryBranchMerge {
  merge(
    repositoryPath: string,
    branch: string,
    direction: 'update-from-master' | 'into-master',
    squash: boolean,
  ): void;
}

export const REPOSITORY_BRANCH_MERGE = new InjectionToken<RepositoryBranchMerge>('Repository branch merge', {
  factory: () => {
    const host: unknown = Reflect.get(globalThis, REPOSITORY_BRANCH_MERGE_HOST);
    if (!isRepositoryBranchMerge(host)) {
      throw new Error('Branch merge is unavailable');
    }
    return host;
  },
});

function isRepositoryBranchMerge(host: unknown): host is RepositoryBranchMerge {
  return typeof host === 'object' && host !== null && 'merge' in host && typeof host.merge === 'function';
}
