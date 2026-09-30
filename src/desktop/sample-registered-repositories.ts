import { InjectionToken } from '@angular/core';

export interface SampleRegisteredRepository {
  readonly displayName: string;
  readonly path: string;
}

export const sampleRegisteredRepositories: readonly SampleRegisteredRepository[] = [
  { displayName: 'Harbor', path: '/samples/harbor' },
  { displayName: 'Northwind', path: '/samples/northwind' },
  { displayName: 'Papertrail', path: '/samples/papertrail' },
];

export const SAMPLE_REGISTERED_REPOSITORIES = new InjectionToken<readonly SampleRegisteredRepository[]>(
  'Sample registered repositories',
  {
    factory: () => sampleRegisteredRepositories,
  },
);
