import type { Terminal } from '@xterm/xterm';

export function applyTerminalAppearance(
  term: Terminal,
  background: string,
  foreground: string,
  fontFamily: string,
): void {
  const theme = term.options.theme;
  term.options.theme = {
    ...theme,
    background,
    foreground,
  };
  term.options.fontFamily = fontFamily;
}
