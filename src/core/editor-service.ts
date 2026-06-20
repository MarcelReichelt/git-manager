import { execa } from 'execa';
import { loadEffectiveConfig, getEditorCommand, getEditorArgs } from '../config/loader.js';

export function openEditor(worktreePath: string, layoutRoot?: string, editorFlag?: string): void {
  const effective = loadEffectiveConfig(layoutRoot);
  const command = editorFlag ?? getEditorCommand(effective);
  const args = [...getEditorArgs(effective), worktreePath];

  // execa resolves Windows `.cmd`/`.bat` shims (e.g. `code`, `cursor`) that
  // `child_process.spawn` cannot launch directly without `shell: true`.
  const child = execa(command, args, {
    detached: true,
    stdio: 'ignore',
    cleanup: false,
  });
  child.unref();
  // Keep `reject: true` (the default) so spawn failures (e.g. editor command
  // not found) reject the promise and are surfaced by this handler.
  child.catch((err: unknown) => {
    console.error(`Failed to open editor "${command}": ${(err as Error).message}`);
  });
}
