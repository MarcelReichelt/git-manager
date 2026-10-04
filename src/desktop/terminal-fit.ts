import type { Terminal } from '@xterm/xterm';

interface FittedPty {
  cols: number;
  rows: number;
  resize(columns: number, rows: number): void;
}

export function fitTerminalGrid(host: HTMLElement, term: Terminal, pty: FittedPty | null): void {
  const next = proposedGrid(host, term.cols, term.rows);
  if (!next) {
    return;
  }
  if (next.cols !== term.cols || next.rows !== term.rows) {
    term.resize(next.cols, next.rows);
  }
  if (!pty || (pty.cols === next.cols && pty.rows === next.rows)) {
    return;
  }
  try {
    pty.resize(next.cols, next.rows);
  } catch {
    // The process already exited.
  }
}

export function watchTerminalBox(host: HTMLElement, fit: () => void): () => void {
  let observer: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => fit());
    observer.observe(host);
  }
  const styles = new MutationObserver(() => fit());
  styles.observe(host, { attributes: true, attributeFilter: ['style'] });
  return () => {
    observer?.disconnect();
    styles.disconnect();
  };
}

function proposedGrid(
  host: HTMLElement,
  cols: number,
  rows: number,
): { cols: number; rows: number } | null {
  const screen = host.querySelector('.xterm-screen');
  if (!(screen instanceof HTMLElement) || cols < 1 || rows < 1) {
    return null;
  }
  const canvasWidth = Number.parseFloat(screen.style.width);
  const canvasHeight = Number.parseFloat(screen.style.height);
  if (!(canvasWidth > 0) || !(canvasHeight > 0)) {
    return null;
  }
  const cellWidth = canvasWidth / cols;
  const cellHeight = canvasHeight / rows;
  const box = paneBox(host);
  if (!(box.width > 0) || !(box.height > 0) || !(cellWidth > 0) || !(cellHeight > 0)) {
    return null;
  }
  return {
    cols: Math.max(2, Math.floor(box.width / cellWidth)),
    rows: Math.max(1, Math.floor(box.height / cellHeight)),
  };
}

function paneBox(host: HTMLElement): { width: number; height: number } {
  const style = getComputedStyle(host);
  const styledWidth = Number.parseFloat(style.width);
  const styledHeight = Number.parseFloat(style.height);
  return {
    width: host.clientWidth > 0 ? host.clientWidth : styledWidth,
    height: host.clientHeight > 0 ? host.clientHeight : styledHeight,
  };
}
