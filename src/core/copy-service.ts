import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { loadRepoConfig } from '../config/loader.js';

export function copyConfiguredFiles(
  layoutRoot: string,
  gitRoot: string,
  worktreePath: string,
): string[] {
  const config = loadRepoConfig(layoutRoot);
  const copied: string[] = [];
  const warnings: string[] = [];

  for (const file of config.copy.files) {
    const source = join(gitRoot, file);
    const target = join(worktreePath, file);
    if (!existsSync(source)) {
      warnings.push(`Skipping missing file: ${file}`);
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    copied.push(file);
  }

  for (const warning of warnings) {
    console.warn(warning);
  }

  return copied;
}
