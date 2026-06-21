export function sliceScrollLines<T>(
  lines: T[],
  viewportHeight: number,
  scrollOffset: number,
): {
  visible: T[];
  hiddenAbove: number;
  hiddenBelow: number;
  maxScroll: number;
} {
  const viewport = Math.max(1, viewportHeight);

  if (lines.length === 0) {
    return { visible: [], hiddenAbove: 0, hiddenBelow: 0, maxScroll: 0 };
  }

  if (lines.length <= viewport) {
    return {
      visible: lines,
      hiddenAbove: 0,
      hiddenBelow: 0,
      maxScroll: 0,
    };
  }

  // Viewport already excludes the panel title and scroll-indicator rows.
  const contentHeight = viewport;
  const maxScroll = Math.max(0, lines.length - contentHeight);
  const offset = Math.min(Math.max(0, scrollOffset), maxScroll);
  const visible = lines.slice(offset, offset + contentHeight);
  const hiddenAbove = offset;
  const hiddenBelow = Math.max(0, lines.length - offset - visible.length);

  return { visible, hiddenAbove, hiddenBelow, maxScroll };
}

/** Rows available for scrollable content inside a bordered panel. */
export function borderedPanelInsideHeight(outerHeight: number): number {
  return Math.max(1, outerHeight - 2);
}

/** Diff panel content rows: border + title + optional scroll indicator. */
export function diffPanelViewport(
  outerHeight: number,
  scrollOffset: number,
  lineCount: number,
): number {
  const insideBorder = borderedPanelInsideHeight(outerHeight);
  const needsIndicator =
    scrollOffset > 0 || lineCount > Math.max(1, insideBorder - 1);
  return Math.max(1, insideBorder - 1 - (needsIndicator ? 1 : 0));
}

export function scrollIndicator(hiddenAbove: number, hiddenBelow: number): string | null {
  if (hiddenAbove === 0 && hiddenBelow === 0) {
    return null;
  }
  const parts: string[] = [];
  if (hiddenAbove > 0) {
    parts.push(`↑${hiddenAbove}`);
  }
  if (hiddenBelow > 0) {
    parts.push(`↓${hiddenBelow}`);
  }
  return `${parts.join(' ')} — ↑/↓ scroll`;
}
