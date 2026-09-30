import { InjectionToken } from '@angular/core';
import type { BranchChange, BranchCommit, RepositoryBranchList } from './repository-branches.js';

function textEdit(path: string, linesAdded: number, linesDeleted: number, diff: readonly string[]): BranchChange {
  return { kind: 'edit', path, linesAdded, linesDeleted, diff: diff.join('\n') };
}

function renamedFile(
  path: string,
  previousPath: string,
  linesAdded: number,
  linesDeleted: number,
  diff: readonly string[],
): BranchChange {
  return { kind: 'rename', path, previousPath, linesAdded, linesDeleted, diff: diff.join('\n') };
}

function commits(
  prefix: string,
  subjects: readonly string[],
  files: readonly (readonly BranchChange[])[] = [],
): readonly BranchCommit[] {
  return subjects.map((subject, index) => ({
    id: `${prefix}${index + 1}`,
    subject,
    files: files[index] ?? [],
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
          {
            kind: 'edit',
            path: 'notes/today.md',
            linesAdded: 4,
            linesDeleted: 1,
            diff: [
              '--- a/notes/today.md',
              '+++ b/notes/today.md',
              '@@ -1,2 +1,5 @@',
              ' # Today',
              '-Tide chart',
              '+Harbor tide chart',
              '+Mooring notes',
              '+Weather',
              '+Crew',
            ].join('\n'),
          },
          {
            kind: 'edit',
            path: 'notes/todo.md',
            linesAdded: 2,
            linesDeleted: 0,
            diff: [
              '--- a/notes/todo.md',
              '+++ b/notes/todo.md',
              '@@ -1 +1,3 @@',
              ' # Todo',
              '+Paint the hull',
              '+Check the lines',
            ].join('\n'),
          },
        ],
        commitsAhead: commits(
          'notes-ahead-',
          ['Draft notes'],
          [
            [
              textEdit('notes/today.md', 3, 1, [
                '--- a/notes/today.md',
                '+++ b/notes/today.md',
                '@@ -1,2 +1,4 @@',
                ' # Today',
                '-Tide chart',
                '+Harbor tide chart',
                '+Mooring notes',
                '+Weather',
              ]),
              textEdit('notes/todo.md', 1, 0, [
                '--- a/notes/todo.md',
                '+++ b/notes/todo.md',
                '@@ -1 +1,2 @@',
                ' # Todo',
                '+Paint the hull',
              ]),
            ],
          ],
        ),
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
        changes: [
          {
            kind: 'edit',
            path: 'src/legacy.ts',
            linesAdded: 6,
            linesDeleted: 2,
            diff: [
              '--- a/src/legacy.ts',
              '+++ b/src/legacy.ts',
              '@@ -1,3 +1,7 @@',
              ' export function legacy() {',
              '-  return 0;',
              '-  return 1;',
              '+  return 2;',
              '+  return 3;',
              '+  return 4;',
              '+  return 5;',
              '+  return 6;',
              '+  return 7;',
              ' }',
            ].join('\n'),
          },
        ],
        commitsAhead: commits(
          'abandoned-ahead-',
          ['Start the experiment', 'Adjust the experiment', 'Keep the experiment', 'Leave the experiment'],
          [
            [
              textEdit('src/legacy.ts', 2, 0, [
                '--- a/src/legacy.ts',
                '+++ b/src/legacy.ts',
                '@@ -1 +1,3 @@',
                ' export {}',
                '+const started = true;',
                '+const attempt = 1;',
              ]),
            ],
            [
              textEdit('src/legacy.ts', 1, 1, [
                '--- a/src/legacy.ts',
                '+++ b/src/legacy.ts',
                '@@ -2 +2 @@',
                '-const attempt = 1;',
                '+const attempt = 2;',
              ]),
            ],
            [
              textEdit('src/legacy.ts', 2, 1, [
                '--- a/src/legacy.ts',
                '+++ b/src/legacy.ts',
                '@@ -2,2 +2,3 @@',
                '-const attempt = 2;',
                '+const attempt = 3;',
                '+const kept = true;',
              ]),
            ],
            [
              textEdit('src/legacy.ts', 1, 0, [
                '--- a/src/legacy.ts',
                '+++ b/src/legacy.ts',
                '@@ -3 +3,2 @@',
                ' const kept = true;',
                '+const left = true;',
              ]),
            ],
          ],
        ),
        commitsBehind: commits('abandoned-behind-', ['Upstream moved on']),
        runningTerminals: 0,
      },
      {
        detached: false,
        name: 'sketch',
        tracking: 'local-only',
        hasWorktree: false,
        changes: [],
        commitsAhead: commits(
          'sketch-ahead-',
          ['Sketch the idea', 'Sketch the follow-up'],
          [
            [
              textEdit('notes/sketch.md', 5, 0, [
                '--- /dev/null',
                '+++ b/notes/sketch.md',
                '@@ -0,0 +1,5 @@',
                '+# Sketch',
                '+Hull',
                '+Rig',
                '+Keel',
                '+Sail',
              ]),
            ],
            [
              textEdit('notes/sketch.md', 2, 1, [
                '--- a/notes/sketch.md',
                '+++ b/notes/sketch.md',
                '@@ -1,2 +1,3 @@',
                ' # Sketch',
                '-Hull',
                '+Hull shape',
                '+Deck',
              ]),
            ],
          ],
        ),
        commitsBehind: [],
        runningTerminals: 0,
      },
      {
        detached: false,
        name: 'rename-docs',
        tracking: 'local-and-remote',
        hasWorktree: true,
        changes: [
          renamedFile('docs/guide.md', 'docs/old-guide.md', 2, 1, [
            'diff --git a/docs/old-guide.md b/docs/guide.md',
            'rename from docs/old-guide.md',
            'rename to docs/guide.md',
            '--- a/docs/old-guide.md',
            '+++ b/docs/guide.md',
            '@@ -1,3 +1,4 @@',
            ' # Guide',
            ' Keep the berth notes.',
            '-Old heading',
            '+New heading',
            '+One more line',
          ]),
        ],
        commitsAhead: commits(
          'rename-ahead-',
          ['Rename the guide', 'Fix a heading', 'Fix a link'],
          [
            [
              renamedFile('docs/guide.md', 'docs/old-guide.md', 0, 0, [
                'diff --git a/docs/old-guide.md b/docs/guide.md',
                'rename from docs/old-guide.md',
                'rename to docs/guide.md',
              ]),
            ],
            [
              textEdit('docs/guide.md', 1, 1, [
                '--- a/docs/guide.md',
                '+++ b/docs/guide.md',
                '@@ -1 +1 @@',
                '-# Old guide',
                '+# Guide',
              ]),
            ],
            [
              textEdit('docs/guide.md', 1, 1, [
                '--- a/docs/guide.md',
                '+++ b/docs/guide.md',
                '@@ -3 +3 @@',
                '-[old page](old.md)',
                '+[page](guide.md)',
              ]),
            ],
          ],
        ),
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
        changes: [
          {
            kind: 'edit',
            path: 'src/review.ts',
            linesAdded: 3,
            linesDeleted: 2,
            diff: [
              '--- a/src/review.ts',
              '+++ b/src/review.ts',
              '@@ -1,4 +1,5 @@',
              ' export function review() {',
              '-  const open = false;',
              '-  return open;',
              '+  const open = true;',
              '+  const notes = "ready";',
              '+  return notes;',
              ' }',
            ].join('\n'),
          },
        ],
        commitsAhead: commits(
          'review-ahead-',
          ['Open the review'],
          [
            [
              textEdit('src/review.ts', 7, 1, [
                '--- a/src/review.ts',
                '+++ b/src/review.ts',
                '@@ -1 +1,7 @@',
                '-export function review() {}',
                '+export function review() {',
                '+  return "open";',
                '+}',
                '+',
                '+export function notes() {',
                '+  return "draft";',
                '+}',
              ]),
              { kind: 'binary', path: 'assets/badge.bin' },
            ],
          ],
        ),
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
