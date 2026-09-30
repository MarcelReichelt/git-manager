import { InjectionToken } from '@angular/core';
import type { RegisteredRepository } from '../core/registered-repositories.js';
import { REGISTERED_REPOSITORY_REGISTRY_HOST } from './registered-repository-host.js';

export type { RegisteredRepository };
export { REGISTERED_REPOSITORY_REGISTRY_HOST };

export interface RegisteredRepositoryRegistry {
  list(): readonly RegisteredRepository[];
  add(path: string, displayName: string): void;
  unregister(path: string): void;
}

export const REGISTERED_REPOSITORY_REGISTRY = new InjectionToken<RegisteredRepositoryRegistry>(
  'Registered repository registry',
  {
    factory: () => {
      const host: unknown = Reflect.get(globalThis, REGISTERED_REPOSITORY_REGISTRY_HOST);
      if (!isRegisteredRepositoryRegistry(host)) {
        throw new Error('Registered repository registry is unavailable');
      }
      return host;
    },
  },
);

function isRegisteredRepositoryRegistry(host: unknown): host is RegisteredRepositoryRegistry {
  if (typeof host !== 'object' || host === null) {
    return false;
  }
  return (
    'list' in host &&
    'add' in host &&
    'unregister' in host &&
    typeof host.list === 'function' &&
    typeof host.add === 'function' &&
    typeof host.unregister === 'function'
  );
}
