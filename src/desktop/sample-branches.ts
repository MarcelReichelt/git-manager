import { InjectionToken } from '@angular/core';
import type { BranchCommit, RepositoryBranchList } from './repository-branches.js';

function commits(prefix: string, subjects: readonly string[]): readonly BranchCommit[] {
  return subjects.map((subject, index) => ({
    id: `${prefix}${index + 1}`,
    subject,
  }));
}

export const sampleRepositoryBranches: readonly RepositoryBranchList[] = [
  {
    repositoryPath: '/samples/harbor',
    branches: [
      {
        detached: false,
        name: 'notes',
        tracking: 'local-only',
        hasWorktree: true,
        changes: [
          { kind: 'edit', path: 'notes/today.md' },
          { kind: 'edit', path: 'notes/todo.md' },
        ],
        commitsAhead: commits('notes-ahead-', ['Draft notes']),
        commitsBehind: [],
        runningTerminals: 0,
      },
      {
        detached: false,
        name: 'main',
        tracking: 'local-and-remote',
        hasWorktree: true,
        changes: [],
        commitsAhead: [],
        commitsBehind: [],
        runningTerminals: 0,
      },
      {
        detached: false,
        name: 'release',
        tracking: 'remote-only',
        hasWorktree: false,
        changes: [],
        commitsAhead: [],
        commitsBehind: commits('release-behind-', [
          'Cut the release branch',
          'Bump the version',
          'Update the changelog',
          'Tag the release',
        ]),
        runningTerminals: 0,
      },
      {
        detached: false,
        name: 'abandoned',
        tracking: 'remote-deleted',
        hasWorktree: true,
        changes: [{ kind: 'edit', path: 'src/legacy.ts' }],
        commitsAhead: commits('abandoned-ahead-', [
          'Start the experiment',
          'Adjust the experiment',
          'Keep the experiment',
          'Leave the experiment',
        ]),
        commitsBehind: commits('abandoned-behind-', ['Upstream moved on']),
        runningTerminals: 0,
      },
      {
        detached: false,
        name: 'sketch',
        tracking: 'local-only',
        hasWorktree: false,
        changes: [],
        commitsAhead: commits('sketch-ahead-', ['Sketch the idea', 'Sketch the follow-up']),
        commitsBehind: [],
        runningTerminals: 0,
      },
      {
        detached: false,
        name: 'rename-docs',
        tracking: 'local-and-remote',
        hasWorktree: true,
        changes: [{ kind: 'rename', path: 'docs/guide.md', previousPath: 'docs/old-guide.md' }],
        commitsAhead: commits('rename-ahead-', ['Rename the guide', 'Fix a heading', 'Fix a link']),
        commitsBehind: commits('rename-behind-', ['Document the remote', 'Document the layout']),
        runningTerminals: 0,
      },
      {
        detached: false,
        name: 'assets',
        tracking: 'local-and-remote',
        hasWorktree: true,
        changes: [{ kind: 'binary', path: 'assets/logo.png' }],
        commitsAhead: [],
        commitsBehind: commits('assets-behind-', [
          'Add the first asset',
          'Add the second asset',
          'Add the third asset',
          'Add the fourth asset',
          'Add the fifth asset',
        ]),
        runningTerminals: 0,
      },
      {
        detached: false,
        name: 'review',
        tracking: 'local-and-remote',
        hasWorktree: true,
        changes: [{ kind: 'edit', path: 'src/review.ts' }],
        commitsAhead: commits('review-ahead-', ['Open the review']),
        commitsBehind: commits('review-behind-', ['Land the review base']),
        runningTerminals: 2,
      },
      {
        detached: true,
        name: 'HEAD',
        commitId: 'deadbee',
        subject: 'Detached experiment',
      },
    ],
  },
  {
    repositoryPath: '/samples/northwind',
    branches: [
      {
        detached: false,
        name: 'ledger',
        tracking: 'local-and-remote',
        hasWorktree: true,
        changes: [],
        commitsAhead: [],
        commitsBehind: [],
        runningTerminals: 0,
      },
    ],
  },
  {
    repositoryPath: '/samples/papertrail',
    branches: [
      {
        detached: false,
        name: 'edition',
        tracking: 'local-and-remote',
        hasWorktree: true,
        changes: [],
        commitsAhead: [],
        commitsBehind: [],
        runningTerminals: 0,
      },
    ],
  },
];

export const REPOSITORY_BRANCHES = new InjectionToken<readonly RepositoryBranchList[]>('Repository branches', {
  factory: () => sampleRepositoryBranches,
});
