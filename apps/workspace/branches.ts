import { execFileSync } from 'node:child_process';

export type BranchStatus = 'local-only' | 'local-and-remote' | 'remote-only' | 'remote-deleted';

export type BranchRow = {
  name: string;
  status: BranchStatus;
};

export function primaryCheckoutBranch(repoPath: string): string {
  return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: repoPath,
    encoding: 'utf8',
  }).trim();
}

export function commitsOnBranch(
  repoPath: string,
  branch: string,
): { ahead: number; behind: number; subjects: string[] } {
  const base = primaryCheckoutBranch(repoPath);
  const counts = execFileSync('git', ['rev-list', '--left-right', '--count', `${base}...${branch}`], {
    cwd: repoPath,
    encoding: 'utf8',
  }).trim();
  const [behindText, aheadText] = counts.split(/\s+/);
  const log = execFileSync('git', ['log', '--format=%s', `${base}..${branch}`], {
    cwd: repoPath,
    encoding: 'utf8',
  }).trim();
  return {
    ahead: Number(aheadText),
    behind: Number(behindText),
    subjects: log.length === 0 ? [] : log.split('\n'),
  };
}

export function listBranches(repoPath: string): BranchRow[] {
  const headOutput = gitOutput(repoPath, [
    'for-each-ref',
    '--format=%(refname:short)%00%(upstream)%00%(upstream:track)',
    'refs/heads',
  ]);
  const locals =
    headOutput.length === 0
      ? []
      : headOutput.split('\n').map((line) => {
          const [name, upstream, track] = line.split('\0');
          return { name, upstream: upstream ?? '', track: track ?? '' };
        });

  const remoteOutput = gitOutput(repoPath, ['for-each-ref', '--format=%(refname:short)', 'refs/remotes']);
  const remoteList = gitOutput(repoPath, ['remote']);
  const remotePrefixes = new Set(remoteList.length === 0 ? [] : remoteList.split('\n').filter((name) => name.length > 0));
  const onRemote = new Set<string>();
  const remoteOnly: string[] = [];
  if (remoteOutput.length > 0) {
    for (const short of remoteOutput.split('\n')) {
      const slash = short.indexOf('/');
      if (slash <= 0) {
        continue;
      }
      const remote = short.slice(0, slash);
      const name = short.slice(slash + 1);
      if (!remotePrefixes.has(remote) || name === 'HEAD') {
        continue;
      }
      onRemote.add(name);
      remoteOnly.push(name);
    }
  }

  const localNames = new Set(locals.map((branch) => branch.name));
  const rows: BranchRow[] = locals.map((branch) => ({
    name: branch.name,
    status: statusForLocal(branch.upstream, branch.track, onRemote.has(branch.name)),
  }));
  const seen = new Set(localNames);
  for (const name of remoteOnly) {
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    rows.push({ name, status: 'remote-only' });
  }
  return rows.sort((left, right) => left.name.localeCompare(right.name));
}

function statusForLocal(upstream: string, track: string, published: boolean): BranchStatus {
  if (upstream.length > 0 && track.includes('[gone]')) {
    return 'remote-deleted';
  }
  if (upstream.length > 0 || published) {
    return 'local-and-remote';
  }
  return 'local-only';
}

function gitOutput(repoPath: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoPath,
    encoding: 'utf8',
  }).trim();
}

export function findWorktree(repoPath: string, branch: string): string | undefined {
  const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repoPath,
    encoding: 'utf8',
  });
  const blocks = output.split('\n\n');
  for (const block of blocks) {
    const lines = block.split('\n');
    const pathLine = lines.find((line) => line.startsWith('worktree '));
    const branchLine = lines.find((line) => line.startsWith('branch '));
    if (!pathLine || !branchLine) {
      continue;
    }
    const name = branchLine.slice('branch refs/heads/'.length);
    if (name === branch) {
      return pathLine.slice('worktree '.length);
    }
  }
  return undefined;
}
