import { execFileSync } from 'node:child_process';
import type { Branch, BranchChange, BranchCommit, BranchTracking, ListedBranch } from './repository-branch-list.js';

interface GitRef {
  readonly refname: string;
  readonly upstream: string;
  readonly upstreamTrack: string;
}

interface Checkout {
  readonly path: string;
  readonly branch: string | null;
}

interface NumstatEntry {
  readonly added: string;
  readonly deleted: string;
  readonly path: string;
  readonly previousPath?: string;
}

interface CommitSummary {
  readonly id: string;
  readonly subject: string;
}

export function readRepositoryBranches(repositoryPath: string): readonly Branch[] {
  if (!isGitRepository(repositoryPath)) {
    return [];
  }
  const refs = readRefs(repositoryPath);
  const localRefs = refs.filter((ref) => ref.refname.startsWith('refs/heads/'));
  const remoteRefs = refs.filter(
    (ref) => ref.refname.startsWith('refs/remotes/') && branchName(ref.refname) !== null,
  );
  const remoteNames = new Set(remoteRefs.map((ref) => branchName(ref.refname) ?? ''));
  const localNames = localRefs.map((ref) => branchName(ref.refname) ?? '');
  const checkouts = readCheckouts(repositoryPath);
  const checkoutByBranch = new Map<string, string>();
  for (const checkout of checkouts) {
    if (checkout.branch) {
      checkoutByBranch.set(checkout.branch, checkout.path);
    }
  }
  const defaultRef = `refs/heads/${defaultBranchName(checkouts, localNames)}`;
  const branches: ListedBranch[] = [];

  for (const ref of localRefs) {
    const name = branchName(ref.refname) ?? '';
    const tracking = trackingOf(ref, remoteNames);
    const base = comparisonBase(ref, tracking, name, defaultRef, remoteRefs);
    const checkout = checkoutByBranch.get(name);
    branches.push({
      detached: false,
      name,
      tracking,
      hasWorktree: checkout !== undefined,
      changes: checkout ? readChanges(checkout) : [],
      commitsAhead: readAheadCommits(repositoryPath, base, ref.refname),
      commitsBehind: readBehindCommits(repositoryPath, ref.refname, base),
      runningTerminals: 0,
    });
  }

  const localNameSet = new Set(localNames);
  for (const ref of remoteRefs) {
    const name = branchName(ref.refname) ?? '';
    if (localNameSet.has(name)) {
      continue;
    }
    branches.push({
      detached: false,
      name,
      tracking: 'remote-only',
      hasWorktree: false,
      changes: [],
      commitsAhead: readAheadCommits(repositoryPath, defaultRef, ref.refname),
      commitsBehind: readBehindCommits(repositoryPath, ref.refname, defaultRef),
      runningTerminals: 0,
    });
  }

  branches.sort((left, right) => compareNames(left.name, right.name));
  return branches;
}

function trackingOf(ref: GitRef, remoteNames: ReadonlySet<string>): BranchTracking {
  if (ref.upstreamTrack.includes('gone')) {
    return 'remote-deleted';
  }
  const name = branchName(ref.refname);
  if ((name !== null && remoteNames.has(name)) || ref.upstream !== '') {
    return 'local-and-remote';
  }
  return 'local-only';
}

function comparisonBase(
  ref: GitRef,
  tracking: BranchTracking,
  name: string,
  defaultRef: string,
  remoteRefs: readonly GitRef[],
): string {
  if (tracking === 'local-and-remote') {
    if (ref.upstream !== '') {
      return ref.upstream;
    }
    const remote = remoteRefs.find((candidate) => branchName(candidate.refname) === name);
    if (remote) {
      return remote.refname;
    }
  }
  return defaultRef;
}

function defaultBranchName(checkouts: readonly Checkout[], localNames: readonly string[]): string {
  const main = checkouts[0];
  if (main?.branch) {
    return main.branch;
  }
  if (localNames.includes('master')) {
    return 'master';
  }
  if (localNames.includes('main')) {
    return 'main';
  }
  return localNames[0] ?? 'master';
}

function readAheadCommits(repositoryPath: string, fromRef: string, toRef: string): readonly BranchCommit[] {
  return listCommits(repositoryPath, fromRef, toRef).map((commit) => ({
    id: commit.id,
    subject: commit.subject,
    files: readCommitFiles(repositoryPath, commit.id),
  }));
}

function readBehindCommits(repositoryPath: string, fromRef: string, toRef: string): readonly BranchCommit[] {
  return listCommits(repositoryPath, fromRef, toRef).map((commit) => ({
    id: commit.id,
    subject: commit.subject,
    files: [],
  }));
}

function listCommits(repositoryPath: string, fromRef: string, toRef: string): readonly CommitSummary[] {
  if (fromRef === toRef) {
    return [];
  }
  const output = git(repositoryPath, ['log', '--reverse', '--format=%H%x00%s', `${fromRef}..${toRef}`]).trim();
  if (output === '') {
    return [];
  }
  return output.split('\n').map((line) => {
    const separator = line.indexOf('\0');
    return {
      id: line.slice(0, separator),
      subject: line.slice(separator + 1),
    };
  });
}

function readCommitFiles(repositoryPath: string, commitId: string): readonly BranchChange[] {
  const entries = parseNumstat(
    git(repositoryPath, ['diff-tree', '-M', '-r', '--numstat', '-z', '--root', '--no-commit-id', commitId]),
  );
  const changes = entries.map((entry) => commitChange(repositoryPath, commitId, entry));
  changes.sort((left, right) => compareNames(left.path, right.path));
  return changes;
}

function commitChange(repositoryPath: string, commitId: string, entry: NumstatEntry): BranchChange {
  if (entry.added === '-' || entry.deleted === '-') {
    return { kind: 'binary', path: entry.path };
  }
  const linesAdded = countLines(entry.added);
  const linesDeleted = countLines(entry.deleted);
  const diff = commitDiffText(repositoryPath, commitId, entry.path, entry.previousPath);
  if (entry.previousPath) {
    return { kind: 'rename', path: entry.path, previousPath: entry.previousPath, linesAdded, linesDeleted, diff };
  }
  return { kind: 'edit', path: entry.path, linesAdded, linesDeleted, diff };
}

function commitDiffText(repositoryPath: string, commitId: string, path: string, previousPath?: string): string {
  const args = ['show', '-M', '--format=', commitId, '--'];
  if (previousPath) {
    args.push(previousPath);
  }
  args.push(path);
  return git(repositoryPath, args).replace(/\n$/, '');
}

function readChanges(checkoutPath: string): readonly BranchChange[] {
  const tracked = parseNumstat(git(checkoutPath, ['diff', 'HEAD', '--numstat', '-M', '-z']));
  const untracked = git(checkoutPath, ['ls-files', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter((path) => path.length > 0);
  const changes = tracked.map((entry) => trackedChange(checkoutPath, entry));
  for (const path of untracked) {
    changes.push(untrackedChange(checkoutPath, path));
  }
  changes.sort((left, right) => compareNames(left.path, right.path));
  return changes;
}

function trackedChange(checkoutPath: string, entry: NumstatEntry): BranchChange {
  if (entry.added === '-' || entry.deleted === '-') {
    return { kind: 'binary', path: entry.path };
  }
  const linesAdded = countLines(entry.added);
  const linesDeleted = countLines(entry.deleted);
  const diff = diffText(checkoutPath, entry.path, entry.previousPath);
  if (entry.previousPath) {
    return { kind: 'rename', path: entry.path, previousPath: entry.previousPath, linesAdded, linesDeleted, diff };
  }
  return { kind: 'edit', path: entry.path, linesAdded, linesDeleted, diff };
}

function untrackedChange(checkoutPath: string, path: string): BranchChange {
  const numstat = gitAllowDiff(checkoutPath, ['diff', '--no-index', '--numstat', '--', '/dev/null', path]);
  const [added = '', deleted = ''] = numstat.split('\t');
  if (added === '-' || deleted === '-') {
    return { kind: 'binary', path };
  }
  const diff = gitAllowDiff(checkoutPath, ['diff', '--no-index', '--', '/dev/null', path]).replace(/\n$/, '');
  return {
    kind: 'edit',
    path,
    linesAdded: countLines(added),
    linesDeleted: countLines(deleted),
    diff,
  };
}

function diffText(checkoutPath: string, path: string, previousPath?: string): string {
  const args = ['diff', 'HEAD', '-M', '--'];
  if (previousPath) {
    args.push(previousPath);
  }
  args.push(path);
  return git(checkoutPath, args).replace(/\n$/, '');
}

function parseNumstat(output: string): readonly NumstatEntry[] {
  const entries: NumstatEntry[] = [];
  let index = 0;
  while (index < output.length) {
    const headerEnd = output.indexOf('\0', index);
    if (headerEnd === -1) {
      break;
    }
    const header = output.slice(index, headerEnd);
    const firstTab = header.indexOf('\t');
    const secondTab = firstTab === -1 ? -1 : header.indexOf('\t', firstTab + 1);
    if (firstTab === -1 || secondTab === -1) {
      break;
    }
    const added = header.slice(0, firstTab);
    const deleted = header.slice(firstTab + 1, secondTab);
    const path = header.slice(secondTab + 1);
    index = headerEnd + 1;
    if (path !== '') {
      entries.push({ added, deleted, path });
      continue;
    }
    const oldEnd = output.indexOf('\0', index);
    const newEnd = oldEnd === -1 ? -1 : output.indexOf('\0', oldEnd + 1);
    if (oldEnd === -1 || newEnd === -1) {
      break;
    }
    entries.push({
      added,
      deleted,
      previousPath: output.slice(index, oldEnd),
      path: output.slice(oldEnd + 1, newEnd),
    });
    index = newEnd + 1;
  }
  return entries;
}

function readRefs(repositoryPath: string): readonly GitRef[] {
  const output = git(repositoryPath, [
    'for-each-ref',
    '--format=%(refname)%00%(upstream)%00%(upstream:track)',
    'refs/heads',
    'refs/remotes',
  ]);
  return output
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const [refname = '', upstream = '', upstreamTrack = ''] = line.split('\0');
      return { refname, upstream, upstreamTrack };
    });
}

function readCheckouts(repositoryPath: string): readonly Checkout[] {
  const output = git(repositoryPath, ['worktree', 'list', '--porcelain']);
  const checkouts: Checkout[] = [];
  let current: { path?: string; branch?: string; detached?: boolean } = {};
  const push = (): void => {
    if (!current.path) {
      return;
    }
    checkouts.push({ path: current.path, branch: current.detached ? null : (current.branch ?? null) });
    current = {};
  };
  for (const line of output.split('\n')) {
    if (line.startsWith('worktree ')) {
      push();
      current = { path: line.slice('worktree '.length) };
    } else if (line.startsWith('branch refs/heads/')) {
      current.branch = line.slice('branch refs/heads/'.length);
    } else if (line === 'detached') {
      current.detached = true;
    } else if (line === '') {
      push();
    }
  }
  push();
  return checkouts;
}

function branchName(refname: string): string | null {
  const heads = 'refs/heads/';
  if (refname.startsWith(heads)) {
    return refname.slice(heads.length);
  }
  const remotes = 'refs/remotes/';
  if (!refname.startsWith(remotes)) {
    return null;
  }
  const rest = refname.slice(remotes.length);
  const slash = rest.indexOf('/');
  if (slash === -1) {
    return null;
  }
  const name = rest.slice(slash + 1);
  if (name === '' || name === 'HEAD') {
    return null;
  }
  return name;
}

function countLines(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function compareNames(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function isGitRepository(directory: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd: directory,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

function git(repositoryPath: string, args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd: repositoryPath,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function gitAllowDiff(repositoryPath: string, args: readonly string[]): string {
  try {
    return git(repositoryPath, args);
  } catch (error) {
    if (isDiffExit(error)) {
      return error.stdout;
    }
    throw error;
  }
}

function isDiffExit(error: unknown): error is { readonly status: number; readonly stdout: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 1 &&
    'stdout' in error &&
    typeof error.stdout === 'string'
  );
}
