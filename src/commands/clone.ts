import { mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { input } from '@inquirer/prompts';
import { loadGlobalConfig, loadRepoConfig } from '../config/loader.js';
import { expandHome } from '../config/paths.js';
import { cloneRepository, getDefaultBranch, repoNameFromUrl } from '../core/git-service.js';
import { resolveFromGitRoot } from '../core/context.js';
import { registerContext } from '../core/register-service.js';
import { runHooks } from '../core/hook-runner.js';
import type { LayoutMode } from '../config/schema.js';
import type { CloneHookContext } from '../hooks/types.js';

export interface CloneOptions {
  dir?: string;
  here?: boolean;
  path?: string;
  layout?: LayoutMode;
}

export async function cloneRepo(url: string, options: CloneOptions = {}): Promise<void> {
  const global = loadGlobalConfig();
  const layoutMode = options.layout ?? global.defaults.layout_mode;
  const repoName = options.dir ?? repoNameFromUrl(url);

  let layoutRoot: string;
  if (options.here) {
    layoutRoot = resolve(process.cwd());
  } else if (options.path) {
    layoutRoot = resolve(options.path);
  } else {
    const cloneRoot = expandHome(global.defaults.clone_root);
    layoutRoot = join(cloneRoot, repoName);
  }

  if (layoutMode === 'sibling') {
    mkdirSync(layoutRoot, { recursive: true });
  } else {
    mkdirSync(join(layoutRoot, '..'), { recursive: true });
  }

  const tempClonePath =
    layoutMode === 'sibling' ? join(layoutRoot, '_clone_tmp') : layoutRoot;

  if (existsSync(layoutRoot) && !options.here) {
    const entries = await import('node:fs').then((fs) =>
      fs.readdirSync(layoutRoot).filter((e) => !e.startsWith('.')),
    );
    if (entries.length > 0 && layoutMode !== 'sibling') {
      throw new Error(`Target directory not empty: ${layoutRoot}`);
    }
  }

  console.log(`Cloning ${url}...`);
  await cloneRepository(url, tempClonePath);

  const defaultBranch = await getDefaultBranch(tempClonePath);
  let gitRoot: string;

  if (layoutMode === 'sibling') {
    gitRoot = join(layoutRoot, defaultBranch);
    const { renameSync, rmSync } = await import('node:fs');
    if (existsSync(gitRoot)) {
      throw new Error(`Primary checkout path already exists: ${defaultBranch}`);
    }
    renameSync(tempClonePath, gitRoot);
    mkdirSync(join(layoutRoot, '.git-manager'), { recursive: true });
  } else {
    gitRoot = tempClonePath;
    layoutRoot = gitRoot;
    const { ensureGitignoreEntry } = await import('../core/git-service.js');
    await ensureGitignoreEntry(gitRoot, '.workspaces');
  }

  const ctx = await resolveFromGitRoot(gitRoot);
  const config = loadRepoConfig(ctx.layoutRoot);

  const hookCtx: CloneHookContext = {
    layoutRoot: ctx.layoutRoot,
    gitRoot: ctx.gitRoot,
    remoteUrl: url,
    layoutMode: ctx.layoutMode,
    config,
  };

  await runHooks('clone', 'pre', hookCtx, ctx.layoutRoot);
  const repo = await registerContext(ctx);
  await runHooks('clone', 'post', hookCtx, ctx.layoutRoot);

  console.log(`Cloned and registered: ${repo.name} (${ctx.layoutMode})`);
}

export async function interactiveClone(): Promise<void> {
  const url = await input({ message: 'Repository URL' });
  const global = loadGlobalConfig();
  const defaultDest = join(expandHome(global.defaults.clone_root), repoNameFromUrl(url));
  const dest = await input({ message: 'Destination', default: defaultDest });
  await cloneRepo(url, { path: dest });
}
