import { execFile, execFileSync } from 'node:child_process';
import { lstatSync, readFileSync } from 'node:fs';
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

function checkedOutBranches(repoPath: string): Set<string> {
  const names = new Set<string>();
  for (const entry of listWorktrees(repoPath)) {
    if (entry.branch) {
      names.add(entry.branch);
    }
  }
  return names;
}

function configuredRemotes(repoPath: string): string[] {
  return gitText(repoPath, ['remote'])
    .split('\n')
    .map((name) => name.trim())
    .filter((name) => name !== '');
}

function branchPrefixes(remotes: string[]): string[] {
  return remotes.includes('origin') ? remotes : ['origin', ...remotes];
}

function stripRemotePrefix(name: string, remotes: string[]): string {
  const match = remotes
    .filter((remote) => name.startsWith(`${remote}/`))
    .sort((left, right) => right.length - left.length)[0];
  if (!match) {
    return name;
  }
  return name.slice(match.length + 1);
}

function shortRemoteBranch(name: string, remotes: string[]): string {
  return stripRemotePrefix(name, branchPrefixes(remotes));
}

function remoteShortNames(repoPath: string, remotes: string[]): string[] {
  const refs = gitText(repoPath, ['for-each-ref', '--format=%(refname)', 'refs/remotes'])
    .split('\n')
    .map((ref) => ref.trim())
    .filter((ref) => ref !== '');
  const names: string[] = [];
  for (const ref of refs) {
    if (remotes.some((remote) => ref === `refs/remotes/${remote}/HEAD`)) {
      continue;
    }
    const rest = ref.startsWith('refs/remotes/') ? ref.slice('refs/remotes/'.length) : ref;
    const short = stripRemotePrefix(rest, remotes);
    if (short !== '' && short !== rest) {
      names.push(short);
    }
  }
  return names;
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
  return nulPaths(gitText(worktree, ['ls-files', '--others', '--exclude-standard', '-z'])).map((path) => {
    const stat = untrackedLineStat(worktree, path);
    return {
      path,
      previousPath: null,
      added: stat.added,
      deleted: stat.deleted,
      binary: stat.binary,
    };
  });
}

function untrackedLineStat(
  worktree: string,
  path: string,
): { added: number | null; deleted: number | null; binary: boolean } {
  const absolute = resolve(worktree, path);
  let info: ReturnType<typeof lstatSync>;
  try {
    info = lstatSync(absolute);
  } catch {
    return { added: null, deleted: null, binary: true };
  }
  if (!info.isFile()) {
    return gitUntrackedLineStat(worktree, path);
  }
  const data = readFileSync(absolute);
  if (data.includes(0)) {
    return { added: null, deleted: null, binary: true };
  }
  return { added: lineCount(data), deleted: 0, binary: false };
}

function gitUntrackedLineStat(
  worktree: string,
  path: string,
): { added: number | null; deleted: number | null; binary: boolean } {
  const numstat = gitText(worktree, ['diff', '--numstat', '--no-index', '--', '/dev/null', path], true);
  const file = parseNumstat(`${numstat.trim()}\0`)[0];
  if (!file) {
    return { added: null, deleted: null, binary: true };
  }
  return { added: file.added, deleted: file.deleted, binary: file.binary };
}

function lineCount(data: Buffer): number {
  if (data.length === 0) {
    return 0;
  }
  let lines = 0;
  for (const byte of data) {
    if (byte === 10) {
      lines += 1;
    }
  }
  if (data[data.length - 1] !== 10) {
    lines += 1;
  }
  return lines;
}

function nulPaths(raw: string): string[] {
  if (raw === '') {
    return [];
  }
  return raw.split('\0').filter((path) => path !== '');
}

function changedFilesInWorktree(worktree: string): ChangedFile[] {
  const tracked = parseNumstat(gitText(worktree, ['diff', '-M', '--numstat', '-z', 'HEAD']));
  return [...tracked, ...untrackedFiles(worktree)];
}

export function ensureGitRepository(repoPath: string): void {
  gitText(repoPath, ['rev-parse', '--is-inside-work-tree']);
}

export function pruneRemoteTrackingRefs(repoPath: string): void {
  for (const remote of configuredRemotes(repoPath)) {
    try {
      execFileSync('git', ['remote', 'prune', remote], {
        cwd: repoPath,
        stdio: 'ignore',
        timeout: 15000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
    } catch {
      // An unreachable remote keeps the tracking refs already stored locally.
    }
  }
}

function changedFileCount(worktree: string): number {
  const tracked = nulPaths(gitText(worktree, ['diff', '-M', '--name-only', '-z', 'HEAD']));
  const untracked = nulPaths(gitText(worktree, ['ls-files', '--others', '--exclude-standard', '-z']));
  return tracked.length + untracked.length;
}

interface DescribedBranch {
  name: string;
  status: BranchStatus;
  ahead: number;
  behind: number;
}

function describeBranches(repoPath: string): { rows: DescribedBranch[]; defaultBranch: string | undefined } {
  const base = aheadBehindBase(repoPath);
  const comparison = aheadBehindAtom(repoPath, base);
  const localAtoms = ['%(refname:short)', '%(upstream)', '%(upstream:track)'];
  if (comparison) {
    localAtoms.push(comparison);
  }
  const locals = forEachFields(repoPath, localAtoms, 'refs/heads');
  const localNames = new Set(locals.map((fields) => fields[0] ?? ''));
  const rows: DescribedBranch[] = locals.map((fields) => describeLocalBranch(repoPath, base, fields));
  const remoteAtoms = ['%(refname:short)'];
  if (comparison) {
    remoteAtoms.push(comparison);
  }
  for (const fields of forEachFields(repoPath, remoteAtoms, 'refs/remotes/origin')) {
    const name = fields[0] ?? '';
    if (!name.startsWith('origin/') || name === 'origin/HEAD') {
      continue;
    }
    const localName = name.slice('origin/'.length);
    if (localNames.has(localName)) {
      continue;
    }
    const counts = countsFromField(repoPath, name, base, fields[1]);
    rows.push({ name, status: 'remote-only', ahead: counts.ahead, behind: counts.behind });
  }
  return { rows, defaultBranch: base === 'HEAD' ? defaultBranchName(repoPath) : base };
}

function describeLocalBranch(repoPath: string, base: string, fields: readonly string[]): DescribedBranch {
  const name = fields[0] ?? '';
  const upstream = fields[1] ?? '';
  const track = parseUpstreamTrack(fields[2] ?? '');
  if (upstream === '') {
    const counts = countsFromField(repoPath, name, base, fields[3]);
    return { name, status: 'local-only', ahead: counts.ahead, behind: counts.behind };
  }
  if (track === 'gone') {
    const counts = countsFromField(repoPath, name, base, fields[3]);
    return { name, status: 'remote-deleted', ahead: counts.ahead, behind: counts.behind };
  }
  if (track === 'none') {
    return { name, status: 'local-and-remote', ahead: 0, behind: 0 };
  }
  return { name, status: 'local-and-remote', ahead: track.ahead, behind: track.behind };
}

function aheadBehindAtom(repoPath: string, base: string): string | undefined {
  if (!/^[A-Za-z0-9._/-]+$/.test(base)) {
    return undefined;
  }
  if (gitOptional(repoPath, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]) === undefined) {
    return undefined;
  }
  return `%(ahead-behind:${base})`;
}

function countsFromField(
  repoPath: string,
  branch: string,
  base: string,
  field: string | undefined,
): { ahead: number; behind: number } {
  const parsed = field === undefined ? undefined : parseAheadBehind(field);
  if (parsed) {
    return parsed;
  }
  return aheadBehind(repoPath, branch, base);
}

function forEachFields(repoPath: string, atoms: readonly string[], ref: string): string[][] {
  const output = gitText(repoPath, ['for-each-ref', `--format=${atoms.join('%00')}`, ref]);
  if (output === '') {
    return [];
  }
  return output
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split('\0'));
}

// %(ahead-behind:<base>) prints "ahead behind". rev-list --left-right prints "behind ahead".
function parseAheadBehind(value: string): { ahead: number; behind: number } | undefined {
  const match = /^(\d+) (\d+)$/.exec(value.trim());
  if (!match) {
    return undefined;
  }
  return { ahead: Number(match[1]), behind: Number(match[2]) };
}

function parseUpstreamTrack(
  value: string,
): { ahead: number; behind: number } | 'gone' | 'none' {
  const track = value.trim();
  if (track === '') {
    return 'none';
  }
  if (track === '[gone]') {
    return 'gone';
  }
  const ahead = /ahead (\d+)/.exec(track);
  const behind = /behind (\d+)/.exec(track);
  if (!ahead && !behind) {
    return 'none';
  }
  return { ahead: ahead ? Number(ahead[1]) : 0, behind: behind ? Number(behind[1]) : 0 };
}

export function listBranches(repoPath: string): BranchRow[] {
  const described = describeBranches(repoPath);
  const checkouts = checkoutPaths(repoPath);
  const rows = described.rows.map((row) => {
    const checkout = checkouts.get(row.name);
    return {
      name: row.name,
      status: row.status,
      changedFileCount: checkout ? changedFileCount(checkout) : 0,
      ahead: row.ahead,
      behind: row.behind,
    };
  });
  return pinDefaultBranch(rows, described.defaultBranch);
}

function checkoutPaths(repoPath: string): Map<string, string> {
  const paths = new Map<string, string>();
  for (const entry of listWorktrees(repoPath)) {
    if (entry.branch) {
      paths.set(entry.branch, resolve(entry.path));
    }
  }
  return paths;
}

export function listWorktreeBranches(repoPath: string, known?: readonly BranchRow[]): BranchRow[] {
  const checkedOut = checkedOutBranches(repoPath);
  return (known ?? listBranches(repoPath)).filter((branch) => checkedOut.has(branch.name));
}

export interface AvailableBranch {
  name: string;
  status: BranchStatus;
}

export function listBranchesWithoutWorktree(repoPath: string): AvailableBranch[] {
  const taken = checkedOutBranches(repoPath);
  const remotes = configuredRemotes(repoPath);
  const seen = new Set<string>();
  const available: AvailableBranch[] = [];

  const add = (name: string, status: BranchStatus): void => {
    if (name === '' || taken.has(name) || seen.has(name)) {
      return;
    }
    seen.add(name);
    available.push({ name, status });
  };

  for (const row of describeBranches(repoPath).rows) {
    if (row.status === 'remote-deleted') {
      continue;
    }
    const name = row.status === 'remote-only' ? shortRemoteBranch(row.name, remotes) : row.name;
    add(name, row.status);
  }
  for (const name of remoteShortNames(repoPath, branchPrefixes(remotes))) {
    add(name, 'remote-only');
  }
  return available;
}

export function listRemoteBranchesWithoutWorktree(repoPath: string): string[] {
  return listBranchesWithoutWorktree(repoPath).map((branch) => branch.name);
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

const remoteHeadAnswers = new Map<string, string | undefined>();
const resolvedDefaults = new Map<string, string | undefined>();

function aheadBehindBase(repoPath: string): string {
  return defaultBranchName(repoPath) ?? 'HEAD';
}

export function refreshRemoteHead(repoPath: string): void {
  const remote = preferredRemote(repoPath);
  if (!remote) {
    return;
  }
  rememberRemoteHead(repoPath, remote, queryRemoteHead(repoPath, remote));
}

let remoteRefreshes = 0;
const remoteRefreshIdle: Array<() => void> = [];

export function whenRemoteRefreshIdle(): Promise<void> {
  if (remoteRefreshes === 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    remoteRefreshIdle.push(resolve);
  });
}

export function refreshOpenRepositoryRemotes(repoPath: string): Promise<boolean> {
  const remotes = configuredRemotes(repoPath);
  if (remotes.length === 0) {
    return Promise.resolve(false);
  }
  remoteRefreshes += 1;
  return pruneRemotes(repoPath, remotes)
    .then(() => askRemoteHead(repoPath))
    .then(() => true)
    .finally(() => {
      remoteRefreshes -= 1;
      if (remoteRefreshes > 0) {
        return;
      }
      setTimeout(() => {
        if (remoteRefreshes > 0) {
          return;
        }
        const waiting = remoteRefreshIdle.splice(0);
        for (const resolve of waiting) {
          resolve();
        }
      }, 0);
    });
}

function pruneRemotes(repoPath: string, remotes: readonly string[]): Promise<void> {
  return remotes.reduce(
    (chain, remote) => chain.then(() => gitFinished(repoPath, ['remote', 'prune', remote])),
    Promise.resolve(),
  );
}

function askRemoteHead(repoPath: string): Promise<void> {
  const remote = preferredRemote(repoPath);
  if (!remote) {
    return Promise.resolve();
  }
  return gitFinished(repoPath, ['remote', 'set-head', remote, '--auto']).then((asked) => {
    rememberRemoteHead(repoPath, remote, asked ? storedRemoteHead(repoPath, remote) : undefined);
  });
}

function gitFinished(cwd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout: 15000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        windowsHide: true,
      },
      (error) => {
        resolve(error === null);
      },
    );
  });
}

export function readDefaultBranch(repoPath: string): string | undefined {
  return defaultBranchName(repoPath);
}

function defaultBranchName(repoPath: string): string | undefined {
  const key = resolve(repoPath);
  if (resolvedDefaults.has(key)) {
    return resolvedDefaults.get(key);
  }
  const name = uncachedDefaultBranchName(repoPath);
  resolvedDefaults.set(key, name);
  return name;
}

function uncachedDefaultBranchName(repoPath: string): string | undefined {
  const remote = preferredRemote(repoPath);
  if (remote) {
    const asked = rememberedRemoteHead(repoPath, remote);
    if (asked && refResolves(repoPath, asked)) {
      return asked;
    }
    const stored = storedRemoteHead(repoPath, remote);
    if (stored && refResolves(repoPath, stored)) {
      return stored;
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

function preferredRemote(repoPath: string): string | undefined {
  const remotes = configuredRemotes(repoPath);
  if (remotes.includes('origin')) {
    return 'origin';
  }
  return remotes[0];
}

function remoteHeadKey(repoPath: string, remote: string): string {
  return `${resolve(repoPath)}\0${remote}`;
}

function rememberedRemoteHead(repoPath: string, remote: string): string | undefined {
  return remoteHeadAnswers.get(remoteHeadKey(repoPath, remote));
}

function rememberRemoteHead(repoPath: string, remote: string, name: string | undefined): void {
  remoteHeadAnswers.set(remoteHeadKey(repoPath, remote), name);
  resolvedDefaults.delete(resolve(repoPath));
}

function queryRemoteHead(repoPath: string, remote: string): string | undefined {
  try {
    execFileSync('git', ['remote', 'set-head', remote, '--auto'], {
      cwd: repoPath,
      stdio: 'ignore',
      timeout: 15000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  } catch {
    // An unreachable remote keeps the remote HEAD ref already stored locally.
    return undefined;
  }
  return storedRemoteHead(repoPath, remote);
}

function refResolves(repoPath: string, name: string): boolean {
  return gitOptional(repoPath, ['rev-parse', '--verify', '--quiet', `${name}^{commit}`]) !== undefined;
}

function storedRemoteHead(repoPath: string, remote: string): string | undefined {
  const head = gitOptional(repoPath, ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`]);
  const prefix = `${remote}/`;
  if (!head?.startsWith(prefix)) {
    return undefined;
  }
  const name = head.slice(prefix.length);
  return name === '' ? undefined : name;
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

export function countBranchHistory(repoPath: string, branch: string): number | undefined {
  return parseCommitCount(gitOptional(repoPath, ['rev-list', '--count', branch]));
}

export function readCommitsOnlyOnBranch(repoPath: string, branch: string, offset = 0): BranchCommit[] {
  return parseCommitLog(
    gitText(repoPath, [
      'log',
      '--format=%H%x09%s',
      `--max-count=${recentCommitPageSize}`,
      `--skip=${offset}`,
      commitsOnlyOnBranchRevision(repoPath, branch),
    ]),
  );
}

export function countCommitsOnlyOnBranch(repoPath: string, branch: string): number | undefined {
  return parseCommitCount(
    gitOptional(repoPath, ['rev-list', '--count', commitsOnlyOnBranchRevision(repoPath, branch)]),
  );
}

function commitsOnlyOnBranchRevision(repoPath: string, branch: string): string {
  const base = defaultBranchName(repoPath) ?? 'master';
  return `${base}..${branch}`;
}

function parseCommitCount(output: string | undefined): number | undefined {
  if (output === undefined || !/^\d+$/.test(output)) {
    return undefined;
  }
  return Number(output);
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
  return parseNumstat(gitText(repoPath, ['show', '-m', '--first-parent', '-M', '--numstat', '-z', '--format=', sha]));
}

export function readCommitFileDiff(repoPath: string, sha: string, filePath: string): string {
  return gitText(repoPath, ['show', '-m', '--first-parent', '-M', '--format=', sha, '--', filePath], true);
}
