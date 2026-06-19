import { spawn } from 'node:child_process';
import { loadEffectiveConfig, getEditorCommand, getEditorArgs } from '../config/loader.js';

export function openEditor(worktreePath: string, layoutRoot?: string, editorFlag?: string): void {
  const effective = loadEffectiveConfig(layoutRoot);
  const command = editorFlag ?? getEditorCommand(effective);
  const args = [...getEditorArgs(effective), worktreePath];

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}
