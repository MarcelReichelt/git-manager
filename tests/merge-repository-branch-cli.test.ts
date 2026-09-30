import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTempDir, initRepo, setupTestEnv } from './helpers.js';

const cliPath = join(process.cwd(), 'dist', 'cli.js');

describe('git-manager merge', () => {
  it('brings commits from master into the selected branch', () => {
    const env = setupTestEnv(createTempDir());
    const repoPath = join(env.configDir, '..', 'harbor');
    initDivergedRepository(repoPath);

    try {
      const help = runCli(['merge', '--help'], repoPath);
      expect(help.stdout).toContain('--path <path>');
      expect(help.stdout).toContain('--branch <name>');
      expect(help.stdout).toContain('--update-from-master');

      const merged = runCli(
        ['merge', '--path', repoPath, '--branch', 'notes', '--update-from-master'],
        repoPath,
      );
      expect(merged.status).toBe(0);
      expect(gitLog(repoPath, 'notes')).toContain('Record the harbor tide');
      expect(gitLog(repoPath, 'notes')).toContain('Sketch the notes margin');
    } finally {
      env.cleanup();
    }
  });

  it('merges the selected branch into master', () => {
    const env = setupTestEnv(createTempDir());
    const repoPath = join(env.configDir, '..', 'harbor');
    initDivergedRepository(repoPath);

    try {
      const help = runCli(['merge', '--help'], repoPath);
      expect(help.stdout).toContain('--into-master');

      const merged = runCli(
        ['merge', '--path', repoPath, '--branch', 'notes', '--into-master'],
        repoPath,
      );
      expect(merged.status).toBe(0);
      expect(gitLog(repoPath, 'master')).toContain('Sketch the notes margin');
      expect(gitLog(repoPath, 'master')).toContain('Record the harbor tide');
    } finally {
      env.cleanup();
    }
  });

  it('squashes master into the selected branch', () => {
    const env = setupTestEnv(createTempDir());
    const repoPath = join(env.configDir, '..', 'harbor');
    initDivergedRepository(repoPath);

    try {
      const help = runCli(['merge', '--help'], repoPath);
      expect(help.stdout).toContain('--squash');

      const merged = runCli(
        ['merge', '--path', repoPath, '--branch', 'notes', '--update-from-master', '--squash'],
        repoPath,
      );
      expect(merged.status).toBe(0);
      expect(gitLog(repoPath, 'notes')).toContain('Record the harbor tide');
      expect(gitSubjects(repoPath, 'notes')).toContain('Squashed commit of the following:');
      expect(gitSubjects(repoPath, 'notes')).not.toContain('Record the harbor tide');
      expect(gitSubjects(repoPath, 'notes')).toContain('Sketch the notes margin');
    } finally {
      env.cleanup();
    }
  });

  it('squashes the selected branch into master', () => {
    const env = setupTestEnv(createTempDir());
    const repoPath = join(env.configDir, '..', 'harbor');
    initDivergedRepository(repoPath);

    try {
      const merged = runCli(
        ['merge', '--path', repoPath, '--branch', 'notes', '--into-master', '--squash'],
        repoPath,
      );
      expect(merged.status).toBe(0);
      expect(gitLog(repoPath, 'master')).toContain('Sketch the notes margin');
      expect(gitSubjects(repoPath, 'master')).toContain('Squashed commit of the following:');
      expect(gitSubjects(repoPath, 'master')).not.toContain('Sketch the notes margin');
      expect(gitSubjects(repoPath, 'master')).toContain('Record the harbor tide');
    } finally {
      env.cleanup();
    }
  });
});

function initDivergedRepository(repoPath: string): void {
  initRepo(repoPath, { initialBranch: 'master' });
  execSync('git checkout -b notes', { cwd: repoPath, stdio: 'ignore' });
  writeFileSync(join(repoPath, 'notes.txt'), 'margin\n');
  execSync('git add notes.txt && git commit -m "Sketch the notes margin"', { cwd: repoPath, stdio: 'ignore' });
  execSync('git checkout master', { cwd: repoPath, stdio: 'ignore' });
  writeFileSync(join(repoPath, 'tide.txt'), 'tide\n');
  execSync('git add tide.txt && git commit -m "Record the harbor tide"', { cwd: repoPath, stdio: 'ignore' });
}

function gitLog(repoPath: string, branch: string): string {
  return execSync(`git log ${branch}`, { cwd: repoPath, encoding: 'utf8' });
}

function gitSubjects(repoPath: string, branch: string): string {
  return execSync(`git log ${branch} --format=%s`, { cwd: repoPath, encoding: 'utf8' });
}

function runCli(
  args: string[],
  cwd: string,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    env: process.env,
    encoding: 'utf8',
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}
