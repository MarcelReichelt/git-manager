import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import TOML from '@iarna/toml';

export type LayoutMode = 'workspaces' | 'sibling';

export type RepoConfig = {
  layout: LayoutMode;
  copy: string[];
  plugins: string[];
  createPre: string[];
  createPost: string[];
};

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

export function loadRepoConfig(repoPath: string): RepoConfig {
  const configPath = join(repoPath, '.git-manager', 'config.toml');
  if (!existsSync(configPath)) {
    throw new Error(`Repository config does not set a layout: ${configPath}`);
  }
  const raw = TOML.parse(readFileSync(configPath, 'utf8')) as {
    layout?: unknown;
    copy?: unknown;
    hooks?: {
      plugins?: unknown;
      create?: { pre?: unknown; post?: unknown };
    };
  };
  if (raw.layout !== 'workspaces' && raw.layout !== 'sibling') {
    throw new Error('Repository layout must be workspaces or sibling');
  }
  return {
    layout: raw.layout,
    copy: stringList(raw.copy),
    plugins: stringList(raw.hooks?.plugins),
    createPre: stringList(raw.hooks?.create?.pre),
    createPost: stringList(raw.hooks?.create?.post),
  };
}
