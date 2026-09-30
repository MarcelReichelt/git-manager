import { InjectionToken } from '@angular/core';
import type { Branch } from './repository-branches.js';

export const REPOSITORY_BRANCH_SOURCE_HOST = 'gitManagerRepositoryBranches';

export interface RepositoryBranchSource {
  list(repositoryPath: string): readonly Branch[];
}

export const REPOSITORY_BRANCH_SOURCE = new InjectionToken<RepositoryBranchSource>('Repository branch source', {
  factory: () => {
    const host: unknown = Reflect.get(globalThis, REPOSITORY_BRANCH_SOURCE_HOST);
    if (!isRepositoryBranchSource(host)) {
      throw new Error('Repository branches are unavailable');
    }
    return host;
  },
});

function isRepositoryBranchSource(host: unknown): host is RepositoryBranchSource {
  return typeof host === 'object' && host !== null && 'list' in host && typeof host.list === 'function';
}
