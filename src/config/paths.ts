import { homedir } from 'node:os';
import { join } from 'node:path';

export function expandHome(path: string): string {
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  if (path === '~') {
    return homedir();
  }
  return path;
}

export function getGlobalConfigDir(): string {
  return process.env.GIT_MANAGER_CONFIG_DIR ?? expandHome('~/.config/git-manager');
}

export function getGlobalConfigPath(): string {
  return join(getGlobalConfigDir(), 'config.toml');
}

export function getGlobalPluginsDir(): string {
  return join(getGlobalConfigDir(), 'plugins');
}

export function getRegistryPathDefault(): string {
  return process.env.GIT_MANAGER_REGISTRY_PATH ?? join(getGlobalConfigDir(), 'registry.db');
}

/** @deprecated use getGlobalConfigDir() */
export const GLOBAL_CONFIG_DIR = getGlobalConfigDir();
/** @deprecated use getGlobalConfigPath() */
export const GLOBAL_CONFIG_PATH = getGlobalConfigPath();
/** @deprecated use getGlobalPluginsDir() */
export const GLOBAL_PLUGINS_DIR = getGlobalPluginsDir();
/** @deprecated use getRegistryPathDefault() */
export const REGISTRY_DB_PATH = getRegistryPathDefault();

export const REPO_CONFIG_DIR = '.git-manager';
export const REPO_CONFIG_FILE = 'config.toml';

export function repoConfigPath(layoutRoot: string): string {
  return join(layoutRoot, REPO_CONFIG_DIR, REPO_CONFIG_FILE);
}

export function packageRoot(): string {
  return join(import.meta.dirname ?? '.', '..');
}

export function docsPath(topic?: string): string {
  const root = join(packageRoot(), 'docs');
  if (!topic) {
    return root;
  }
  const map: Record<string, string> = {
    'getting-started': 'getting-started.md',
    configuration: 'configuration.md',
    plugins: 'plugins.md',
    troubleshooting: 'troubleshooting.md',
    tui: 'tui-guide.md',
    cli: 'cli-reference.md',
    'use-cases': 'use-cases.md',
    worktrees: 'worktrees-and-layouts.md',
  };
  const file = map[topic] ?? `${topic}.md`;
  return join(root, file);
}
