import { describe, it, expect, afterEach } from 'vitest';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import {
  DEFAULT_DIFF_MAX_CHANGED_LINES,
  DEFAULT_DIFF_MAX_FILE_BYTES,
  formatByteSize,
  getDiffSkipMessage,
  resolveFileDiff,
} from '../src/core/diff-load-policy.js';
import { createTempDir, initRepo } from './helpers.js';

describe('formatByteSize', () => {
  it('formats common sizes', () => {
    expect(formatByteSize(512)).toBe('512 B');
    expect(formatByteSize(2048)).toBe('2.0 KB');
    expect(formatByteSize(1_572_864)).toBe('1.5 MB');
  });
});

describe('getDiffSkipMessage', () => {
  const baseDir = createTempDir('diff-policy-');
  const repoPath = join(baseDir, 'repo');

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('skips large untracked files', async () => {
    initRepo(repoPath);
    writeFileSync(join(repoPath, 'huge.txt'), 'x'.repeat(600_000));

    const message = await getDiffSkipMessage(repoPath, 'huge.txt', {
      untracked: true,
      maxFileBytes: 512_000,
    });

    expect(message?.[0]).toContain('Diff not loaded');
    expect(message?.[0]).toContain('too large');
  });

  it('allows small untracked files', async () => {
    initRepo(repoPath);
    writeFileSync(join(repoPath, 'small.txt'), 'hello\n');

    const message = await getDiffSkipMessage(repoPath, 'small.txt', {
      untracked: true,
      maxFileBytes: DEFAULT_DIFF_MAX_FILE_BYTES,
    });

    expect(message).toBeNull();
  });

  it('skips tracked files with too many changed lines', async () => {
    initRepo(repoPath);
    const lines = Array.from({ length: 200 }, (_, index) => `line ${index}`).join('\n');
    writeFileSync(join(repoPath, 'README.md'), `${lines}\n`);

    const message = await getDiffSkipMessage(repoPath, 'README.md', {
      maxChangedLines: 50,
      maxFileBytes: 0,
    });

    expect(message?.[0]).toContain('too many changed lines');
  });

  it('skips deleted files when blob size exceeds the limit', async () => {
    initRepo(repoPath);
    writeFileSync(join(repoPath, 'tracked.txt'), 'x'.repeat(600_000));
    execSync('git add tracked.txt && git commit -m "add large"', { cwd: repoPath, stdio: 'ignore' });
    execSync('git rm tracked.txt', { cwd: repoPath, stdio: 'ignore' });

    const message = await getDiffSkipMessage(repoPath, 'tracked.txt', {
      maxFileBytes: 512_000,
      maxChangedLines: 0,
    });

    expect(message?.[0]).toContain('too large');
  });
});

describe('resolveFileDiff', () => {
  const baseDir = createTempDir('diff-resolve-');
  const repoPath = join(baseDir, 'repo');

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('returns an informational message instead of loading a huge untracked file', async () => {
    initRepo(repoPath);
    writeFileSync(join(repoPath, 'huge.txt'), 'x'.repeat(600_000));

    const lines = await resolveFileDiff(repoPath, 'huge.txt', {
      untracked: true,
      maxFileBytes: DEFAULT_DIFF_MAX_FILE_BYTES,
      maxChangedLines: DEFAULT_DIFF_MAX_CHANGED_LINES,
    });

    expect(lines[0]).toContain('Diff not loaded');
    expect(lines).not.toContain(`+${'x'.repeat(100)}`);
  });

  it('loads a normal diff when within limits', async () => {
    initRepo(repoPath);
    writeFileSync(join(repoPath, 'note.txt'), 'updated\n');
    execSync('git add note.txt', { cwd: repoPath, stdio: 'ignore' });

    const lines = await resolveFileDiff(repoPath, 'note.txt', {
      staged: true,
      maxFileBytes: DEFAULT_DIFF_MAX_FILE_BYTES,
      maxChangedLines: DEFAULT_DIFF_MAX_CHANGED_LINES,
    });

    expect(lines.some((line) => line.includes('note.txt') || line.startsWith('+'))).toBe(true);
  });
});
