import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { git, type FileDiffOptions } from './git-service.js';

export const DEFAULT_DIFF_MAX_FILE_BYTES = 512_000;
export const DEFAULT_DIFF_MAX_CHANGED_LINES = 8_000;

export interface DiffLoadLimits {
  maxFileBytes?: number;
  maxChangedLines?: number;
}

export function formatByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function skipMessage(reason: string): string[] {
  return [reason, 'Open the file in your editor to view changes.'];
}

function workingTreeFileSize(cwd: string, file: string): number | null {
  const fullPath = join(cwd, file);
  if (!existsSync(fullPath)) {
    return null;
  }
  try {
    return statSync(fullPath).size;
  } catch {
    return null;
  }
}

async function gitObjectSize(cwd: string, file: string, staged: boolean): Promise<number | null> {
  const specs = staged ? [`:${file}`, `HEAD:${file}`] : [`HEAD:${file}`, `:${file}`];
  for (const spec of specs) {
    try {
      const output = await git(cwd).raw(['cat-file', '-s', spec]);
      const size = Number.parseInt(output.trim(), 10);
      if (Number.isFinite(size)) {
        return size;
      }
    } catch {
      // try next spec
    }
  }
  return null;
}

async function changedLineCount(
  cwd: string,
  file: string,
  staged: boolean,
): Promise<number | null> {
  const args = ['diff', '--numstat'];
  if (staged) {
    args.push('--staged');
  }
  args.push('--', file);
  try {
    const output = (await git(cwd).raw(args)).trim();
    if (!output) {
      return 0;
    }
    const [addedRaw, deletedRaw] = output.split('\t');
    const added = addedRaw === '-' ? 0 : Number.parseInt(addedRaw, 10);
    const deleted = deletedRaw === '-' ? 0 : Number.parseInt(deletedRaw, 10);
    if (!Number.isFinite(added) || !Number.isFinite(deleted)) {
      return null;
    }
    return added + deleted;
  } catch {
    return null;
  }
}

export async function getDiffSkipMessage(
  cwd: string,
  file: string,
  options: FileDiffOptions & DiffLoadLimits = {},
): Promise<string[] | null> {
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_DIFF_MAX_FILE_BYTES;
  const maxChangedLines = options.maxChangedLines ?? DEFAULT_DIFF_MAX_CHANGED_LINES;

  if (options.untracked) {
    if (maxFileBytes > 0) {
      const size = workingTreeFileSize(cwd, file);
      if (size !== null && size > maxFileBytes) {
        return skipMessage(
          `Diff not loaded — file is too large (${formatByteSize(size)}, limit ${formatByteSize(maxFileBytes)}).`,
        );
      }
    }
    return null;
  }

  if (maxFileBytes > 0) {
    const size = workingTreeFileSize(cwd, file) ?? (await gitObjectSize(cwd, file, options.staged ?? false));
    if (size !== null && size > maxFileBytes) {
      return skipMessage(
        `Diff not loaded — file is too large (${formatByteSize(size)}, limit ${formatByteSize(maxFileBytes)}).`,
      );
    }
  }

  if (maxChangedLines > 0) {
    const lines = await changedLineCount(cwd, file, options.staged ?? false);
    if (lines !== null && lines > maxChangedLines) {
      return skipMessage(
        `Diff not loaded — too many changed lines (${lines.toLocaleString()}, limit ${maxChangedLines.toLocaleString()}).`,
      );
    }
  }

  return null;
}

export async function resolveFileDiff(
  cwd: string,
  file: string,
  options: FileDiffOptions & DiffLoadLimits = {},
): Promise<string[]> {
  const { getFileDiff } = await import('./git-service.js');
  const skipMessage = await getDiffSkipMessage(cwd, file, options);
  if (skipMessage) {
    return skipMessage;
  }
  return getFileDiff(cwd, file, options);
}
