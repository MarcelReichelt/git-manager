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

  const contentHeight = Math.max(1, viewport - 1);
  const maxScroll = Math.max(0, lines.length - contentHeight);
  const offset = Math.min(Math.max(0, scrollOffset), maxScroll);
  const visible = lines.slice(offset, offset + contentHeight);
  const hiddenAbove = offset;
  const hiddenBelow = Math.max(0, lines.length - offset - visible.length);

  return { visible, hiddenAbove, hiddenBelow, maxScroll };
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
