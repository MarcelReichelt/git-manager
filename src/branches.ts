import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export type BranchStatus = 'local-only' | 'local-and-remote' | 'remote-only' | 'remote-deleted';

export interface BranchRow {
  name: string;
  status: BranchStatus;
  changedFileCount: number;
  ahead: number;
  behind: number;
}

export interface ChangedFile {
  path: string;
  previousPath: string | null;
  added: number | null;
  deleted: number | null;
  binary: boolean;
}

export interface BranchCommit {
  sha: string;
  subject: string;
}

interface WorktreeEntry {
  path: string;
  branch: string | null;
}

function gitText(cwd: string, args: string[], allowDiff = false): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const failed = error as { stdout?: string | Buffer; stderr?: string | Buffer; status?: number };
    const stdout = typeof failed.stdout === 'string' ? failed.stdout : '';
    if (allowDiff && failed.status === 1) {
      return stdout;
    }
    const stderr = typeof failed.stderr === 'string' ? failed.stderr.trim() : '';
    throw new Error(stderr || 'git failed');
  }
}

function gitOptional(cwd: string, args: string[]): string | undefined {
  try {
    const output = gitText(cwd, args).trim();
    return output === '' ? undefined : output;
  } catch {
    return undefined;
  }
}

function hasRef(repoPath: string, ref: string): boolean {
  try {
    execFileSync('git', ['show-ref', '--verify', '--quiet', ref], {
      cwd: repoPath,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function listWorktrees(repoPath: string): WorktreeEntry[] {
  const output = gitText(repoPath, ['worktree', 'list', '--porcelain']);
  const entries: WorktreeEntry[] = [];
  for (const block of output.split('\n\n')) {
    let path: string | undefined;
    let branch: string | null = null;
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length);
      } else if (line.startsWith('branch ')) {
        branch = line.slice('branch refs/heads/'.length);
      }
    }
    if (path) {
      entries.push({ path, branch });
    }
  }
  return entries;
}

function worktreePath(repoPath: string, branch: string): string | undefined {
  const match = listWorktrees(repoPath).find((entry) => entry.branch === branch);
  return match ? resolve(match.path) : undefined;
}

export function listRemoteBranchesWithoutWorktree(repoPath: string): string[] {
  const checkedOut = new Set(
    listWorktrees(repoPath)
      .map((entry) => entry.branch)
      .filter((branch): branch is string => branch !== null),
  );
  return gitText(repoPath, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin'])
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name.startsWith('origin/') && name !== 'origin/HEAD')
    .map((name) => name.slice('origin/'.length))
    .filter((name) => name !== '' && !checkedOut.has(name));
}

function upstreamRef(repoPath: string, branch: string): string | undefined {
  const remote = gitOptional(repoPath, ['config', '--get', `branch.${branch}.remote`]);
  const merge = gitOptional(repoPath, ['config', '--get', `branch.${branch}.merge`]);
  if (!remote || !merge || !merge.startsWith('refs/heads/')) {
    return undefined;
  }
  const short = merge.slice('refs/heads/'.length);
  if (remote === '.') {
    return merge;
  }
  return `refs/remotes/${remote}/${short}`;
}

function aheadBehind(repoPath: string, branch: string, base: string): { ahead: number; behind: number } {
  const output = gitText(repoPath, ['rev-list', '--left-right', '--count', `${base}...${branch}`]).trim();
  const [behindText, aheadText] = output.split(/\s+/);
  return { behind: Number(behindText), ahead: Number(aheadText) };
}

function parseNumstat(raw: string): ChangedFile[] {
  if (raw.trim() === '') {
    return [];
  }
  const parts = raw.split('\0');
  if (parts.at(-1) === '') {
    parts.pop();
  }
  const files: ChangedFile[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const header = /^(-|\d+)\t(-|\d+)\t(.*)$/.exec(parts[index] ?? '');
    if (!header) {
      continue;
    }
    const binary = header[1] === '-' || header[2] === '-';
    let path = header[3] ?? '';
    let previousPath: string | null = null;
    if (path === '') {
      previousPath = parts[index + 1] ?? null;
      path = parts[index + 2] ?? '';
      index += 2;
    }
    files.push({
      path,
      previousPath,
      added: binary ? null : Number(header[1]),
      deleted: binary ? null : Number(header[2]),
      binary,
    });
  }
  return files;
}

function untrackedFiles(worktree: string): ChangedFile[] {
  const raw = gitText(worktree, ['ls-files', '--others', '--exclude-standard', '-z']);
  if (raw === '') {
    return [];
  }
  const paths = raw.split('\0').filter((path) => path !== '');
  return paths.map((path) => {
    const numstat = gitText(
      worktree,
      ['diff', '--numstat', '--no-index', '--', '/dev/null', path],
      true,
    );
    const parsed = parseNumstat(`${numstat.trim()}\0`);
    const file = parsed[0];
    if (!file) {
      return { path, previousPath: null, added: null, deleted: null, binary: true };
    }
    return { ...file, path, previousPath: null };
  });
}

function changedFilesInWorktree(worktree: string): ChangedFile[] {
  const tracked = parseNumstat(gitText(worktree, ['diff', '-M', '--numstat', '-z', 'HEAD']));
  return [...tracked, ...untrackedFiles(worktree)];
}

export function listBranches(repoPath: string): BranchRow[] {
  const fallbackBase = aheadBehindBase(repoPath);
  const localNames = gitText(repoPath, ['for-each-ref', '--format=%(refname:short)', 'refs/heads'])
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name !== '');
  const local = new Set(localNames);
  const rows: BranchRow[] = localNames.map((name) => {
    const configuredUpstream = upstreamRef(repoPath, name);
    const upstreamExists = configuredUpstream ? hasRef(repoPath, configuredUpstream) : false;
    let status: BranchStatus = 'local-only';
    let base = fallbackBase;
    if (configuredUpstream && upstreamExists) {
      status = 'local-and-remote';
      base = configuredUpstream;
    } else if (configuredUpstream) {
      status = 'remote-deleted';
    }
    const counts = aheadBehind(repoPath, name, base);
    const checkout = worktreePath(repoPath, name);
    return {
      name,
      status,
      changedFileCount: checkout ? changedFilesInWorktree(checkout).length : 0,
      ahead: counts.ahead,
      behind: counts.behind,
    };
  });

  const remoteNames = gitText(repoPath, [
    'for-each-ref',
    '--format=%(refname:short)',
    'refs/remotes/origin',
  ])
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name.startsWith('origin/') && name !== 'origin/HEAD');

  for (const name of remoteNames) {
    const localName = name.slice('origin/'.length);
    if (local.has(localName)) {
      continue;
    }
    const counts = aheadBehind(repoPath, name, fallbackBase);
    rows.push({
      name,
      status: 'remote-only',
      changedFileCount: 0,
      ahead: counts.ahead,
      behind: counts.behind,
    });
  }

  return pinDefaultBranch(rows, defaultBranchName(repoPath));
}

export function pinDefaultBranch<T extends { name: string }>(
  branches: readonly T[],
  defaultBranch: string | undefined,
): T[] {
  const index =
    defaultBranch === undefined ? -1 : branches.findIndex((branch) => branch.name === defaultBranch);
  if (index <= 0) {
    return branches.slice();
  }
  const pinned = branches[index];
  return [pinned, ...branches.slice(0, index), ...branches.slice(index + 1)];
}

function aheadBehindBase(repoPath: string): string {
  return defaultBranchName(repoPath) ?? 'HEAD';
}

export function readDefaultBranch(repoPath: string): string | undefined {
  return defaultBranchName(repoPath);
}

function defaultBranchName(repoPath: string): string | undefined {
  const originHead = gitOptional(repoPath, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']);
  if (originHead?.startsWith('origin/')) {
    const name = originHead.slice('origin/'.length);
    if (name !== '') {
      return name;
    }
  }
  const hasMaster = hasRef(repoPath, 'refs/heads/master');
  const hasMain = hasRef(repoPath, 'refs/heads/main');
  if (hasMaster && !hasMain) {
    return 'master';
  }
  if (hasMain && !hasMaster) {
    return 'main';
  }
  const checkedOut = checkedOutBranch(repoPath);
  if (checkedOut === 'master' || checkedOut === 'main') {
    return checkedOut;
  }
  if (hasMaster) {
    return 'master';
  }
  if (hasMain) {
    return 'main';
  }
  return checkedOut;
}

function checkedOutBranch(repoPath: string): string | undefined {
  const name = gitOptional(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (name === undefined || name === 'HEAD') {
    return undefined;
  }
  return name;
}

export function readChangedFiles(repoPath: string, branch: string): ChangedFile[] {
  const checkout = worktreePath(repoPath, branch);
  if (!checkout) {
    return [];
  }
  return changedFilesInWorktree(checkout);
}

export const recentCommitPageSize = 30;

export function readRecentCommits(repoPath: string, branch: string, offset = 0): BranchCommit[] {
  return parseCommitLog(
    gitText(repoPath, [
      'log',
      '--format=%H%x09%s',
      `--max-count=${recentCommitPageSize}`,
      `--skip=${offset}`,
      branch,
    ]),
  );
}

export function readCommitsOnlyOnBranch(repoPath: string, branch: string): BranchCommit[] {
  const base = defaultBranchName(repoPath) ?? 'master';
  return parseCommitLog(gitText(repoPath, ['log', '--format=%H%x09%s', `${base}..${branch}`]));
}

function parseCommitLog(output: string): BranchCommit[] {
  const trimmed = output.trim();
  if (trimmed === '') {
    return [];
  }
  return trimmed.split('\n').map((line) => {
    const tab = line.indexOf('\t');
    return { sha: line.slice(0, tab), subject: line.slice(tab + 1) };
  });
}

export function readWorkingTreeDiff(repoPath: string, branch: string, filePath: string): string {
  const checkout = worktreePath(repoPath, branch);
  if (!checkout) {
    throw new Error(`No worktree for branch: ${branch}`);
  }
  const tracked = gitText(checkout, ['diff', '-M', 'HEAD', '--', filePath], true);
  if (tracked !== '') {
    return tracked;
  }
  if (gitOptional(checkout, ['ls-files', '--error-unmatch', '--', filePath]) !== undefined) {
    return '';
  }
  return gitText(checkout, ['diff', '--no-index', '--', '/dev/null', filePath], true);
}

export function readCommitFiles(repoPath: string, sha: string): ChangedFile[] {
  return parseNumstat(gitText(repoPath, ['show', '-M', '--numstat', '-z', '--format=', sha]));
}

export function readCommitFileDiff(repoPath: string, sha: string, filePath: string): string {
  return gitText(repoPath, ['show', '-M', '--format=', sha, '--', filePath], true);
}
