import { diffPanelViewport, sliceScrollLines } from './scroll.js';

export function collectHunkHeaders(lines: string[]): number[] {
  const headers: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('@@')) {
      headers.push(i);
    }
  }
  return headers;
}

export function currentHunkIndex(headers: number[], offset: number): number {
  let idx = -1;
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] <= offset) {
      idx = i;
    } else {
      break;
    }
  }
  return idx;
}

function clampHunkScroll(
  lines: string[],
  target: number,
  panelOuterHeight: number,
): number {
  const viewport = diffPanelViewport(panelOuterHeight, target, lines.length);
  const max = sliceScrollLines(lines, viewport, 0).maxScroll;
  return Math.min(Math.max(0, target), max);
}

export function jumpDiffHunkOffset(
  lines: string[],
  offset: number,
  direction: 1 | -1,
  panelOuterHeight: number,
): number {
  const headers = collectHunkHeaders(lines);
  if (headers.length === 0) {
    return offset;
  }

  const hunkIdx = currentHunkIndex(headers, offset);

  if (direction === 1) {
    if (hunkIdx === -1) {
      return clampHunkScroll(lines, headers[0], panelOuterHeight);
    }
    const nextIdx = hunkIdx + 1;
    if (nextIdx >= headers.length) {
      return offset;
    }
    return clampHunkScroll(lines, headers[nextIdx], panelOuterHeight);
  }

  if (hunkIdx === -1) {
    return offset;
  }
  if (offset > headers[hunkIdx]) {
    return clampHunkScroll(lines, headers[hunkIdx], panelOuterHeight);
  }
  if (hunkIdx === 0) {
    return offset;
  }
  return clampHunkScroll(lines, headers[hunkIdx - 1], panelOuterHeight);
}
