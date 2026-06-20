import { existsSync } from 'node:fs';
import { confirm } from '@inquirer/prompts';
import {
  listRepositories,
  listWorktrees,
  deleteWorktree,
  setActiveWorktree,
  getPrimaryWorktree,
  getActiveSession,
  type Repository,
} from './registry.js';
import {
  fetchAll,
  hasRemoteBranch,
  listWorktrees as gitListWorktrees,
  pruneWorktrees,
} from './git-service.js';
import { syncWorktreesFromGit } from './worktree-service.js';
import { pathsEqual, repoConfigPath } from '../config/paths.js';

export interface HealthIssue {
  type: string;
  repository: Repository;
  worktreeId?: number;
  label?: string;
  message: string;
  fixable: boolean;
}

export async function checkHealth(options: { all?: boolean } = {}): Promise<HealthIssue[]> {
  const repos = listRepositories();
  const activeOnly = !options.all;
  const { getActiveRepository } = await import('./active-session.js');
  const active = getActiveRepository();
  const toCheck = activeOnly && active ? [active] : repos;
  const issues: HealthIssue[] = [];

  for (const repo of toCheck) {
    if (!existsSync(repo.path)) {
      issues.push({
        type: 'layout-missing',
        repository: repo,
        message: `Layout root missing: ${repo.name}`,
        fixable: true,
      });
      continue;
    }

    if (!existsSync(repoConfigPath(repo.path))) {
      issues.push({
        type: 'config-missing',
        repository: repo,
        message: `Missing .git-manager/config.toml for ${repo.name}`,
        fixable: false,
      });
    }

    let gitEntries: Awaited<ReturnType<typeof gitListWorktrees>> = [];
    try {
      gitEntries = await gitListWorktrees(repo.git_root);
    } catch {
      issues.push({
        type: 'git-error',
        repository: repo,
        message: `Cannot read git worktrees for ${repo.name}`,
        fixable: false,
      });
      continue;
    }

    const worktrees = listWorktrees(repo.id);

    for (const wt of worktrees) {
      if (!existsSync(wt.path)) {
        issues.push({
          type: 'path-missing',
          repository: repo,
          worktreeId: wt.id,
          label: wt.label ?? wt.branch,
          message: `Worktree ${wt.label ?? wt.branch} path missing`,
          fixable: true,
        });
        continue;
      }
      if (!gitEntries.some((e) => pathsEqual(e.path, wt.path))) {
        issues.push({
          type: 'orphan-registry',
          repository: repo,
          worktreeId: wt.id,
          label: wt.label ?? wt.branch,
          message: `Worktree ${wt.label ?? wt.branch} not in git worktree list`,
          fixable: true,
        });
      }
    }

    for (const entry of gitEntries) {
      if (entry.isBare) continue;
      const found = worktrees.find((w) => pathsEqual(w.path, entry.path));
      if (!found) {
        issues.push({
          type: 'missing-registry',
          repository: repo,
          message: `Git worktree at ${entry.path} missing from registry`,
          fixable: true,
        });
      }
    }

    try {
      await fetchAll(repo.git_root);
      for (const wt of worktrees) {
        if (!existsSync(wt.path)) continue;
        const branch = wt.branch;
        try {
          const upstream = await import('./git-service.js').then((m) => m.getUpstream(wt.path));
          if (upstream) {
            const remoteBranch = upstream.replace(/^origin\//, '');
            const exists = await hasRemoteBranch(repo.git_root, remoteBranch);
            if (!exists) {
              issues.push({
                type: 'remote-gone',
                repository: repo,
                worktreeId: wt.id,
                label: wt.label ?? wt.branch,
                message: `Remote branch origin/${remoteBranch} gone for ${wt.label ?? wt.branch}`,
                fixable: true,
              });
            }
          }
        } catch {
          // skip
        }
      }
    } catch {
      // fetch failed — offline ok
    }

    const session = getActiveSession(repo.id);
    if (session) {
      const wt = worktrees.find((w) => w.id === session.worktree_id);
      if (!wt) {
        issues.push({
          type: 'orphan-session',
          repository: repo,
          message: `Active session points to missing worktree for ${repo.name}`,
          fixable: true,
        });
      }
    }
  }

  return issues;
}

export async function runStartupHealthCheck(): Promise<void> {
  const issues = await checkHealth({ all: false });
  for (const issue of issues) {
    if (!issue.fixable) {
      console.warn(issue.message);
      continue;
    }
    const label = issue.label ?? issue.repository.name;
    const fix = await confirm({
      message: `${issue.message}. Fix now?`,
      default: false,
    });
    if (fix) {
      await fixIssue(issue);
    } else {
      console.warn(`Skipped: ${label}`);
    }
  }
}

export async function runDoctor(options: { fix?: boolean } = {}): Promise<void> {
  const issues = await checkHealth({ all: true });
  if (issues.length === 0) {
    console.log('No issues found.');
    return;
  }
  for (const issue of issues) {
    console.log(`[${issue.type}] ${issue.message}`);
    if (options.fix && issue.fixable) {
      await fixIssue(issue);
    }
  }
}

async function fixIssue(issue: HealthIssue): Promise<void> {
  switch (issue.type) {
    case 'path-missing':
    case 'remote-gone':
    case 'orphan-registry':
      if (issue.worktreeId) {
        deleteWorktree(issue.worktreeId);
        console.log(`Removed worktree from registry: ${issue.label}`);
      }
      await pruneWorktrees(issue.repository.git_root);
      break;
    case 'layout-missing':
      const { deleteRepository } = await import('./registry.js');
      deleteRepository(issue.repository.id);
      console.log(`Unregistered repository: ${issue.repository.name}`);
      break;
    case 'missing-registry':
      await syncWorktreesFromGit(issue.repository);
      console.log(`Synced worktrees for ${issue.repository.name}`);
      break;
    case 'orphan-session': {
      const primary = getPrimaryWorktree(issue.repository.id);
      if (primary) {
        setActiveWorktree(issue.repository.id, primary.id);
        console.log(`Reset active worktree to primary for ${issue.repository.name}`);
      }
      break;
    }
    default:
      console.log(`No auto-fix for: ${issue.type}`);
  }
}
