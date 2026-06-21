import { describe, it, expect } from 'vitest';
import {
  sliceScrollLines,
  scrollIndicator,
  diffPanelViewport,
  borderedPanelInsideHeight,
} from '../src/tui/scroll.js';
import {
  collectHunkHeaders,
  currentHunkIndex,
  jumpDiffHunkOffset,
} from '../src/tui/diff-hunk.js';

describe('sliceScrollLines', () => {
  const lines = Array.from({ length: 50 }, (_, i) => `line-${i}`);

  it('returns all lines when they fit', () => {
    const result = sliceScrollLines(lines, 60, 0);
    expect(result.visible).toHaveLength(50);
    expect(result.maxScroll).toBe(0);
  });

  it('scrolls down through a long list', () => {
    const first = sliceScrollLines(lines, 10, 0);
    expect(first.hiddenBelow).toBeGreaterThan(0);
    const scrolled = sliceScrollLines(lines, 10, 5);
    expect(scrolled.hiddenAbove).toBe(5);
    expect(scrolled.visible[0]).toBe('line-5');
    expect(scrolled.visible).toHaveLength(10);
  });

  it('clamps scroll offset to maxScroll', () => {
    const result = sliceScrollLines(lines, 10, 999);
    expect(result.hiddenBelow).toBe(0);
    expect(result.visible[0]).toBe('line-40');
  });
});

describe('scrollIndicator', () => {
  it('returns null when nothing is hidden', () => {
    expect(scrollIndicator(0, 0)).toBeNull();
  });

  it('shows both directions when needed', () => {
    expect(scrollIndicator(3, 12)).toContain('↑3');
    expect(scrollIndicator(3, 12)).toContain('↓12');
  });
});

describe('diffPanelViewport', () => {
  it('accounts for border, title, and scroll indicator rows', () => {
    expect(borderedPanelInsideHeight(24)).toBe(22);
    expect(diffPanelViewport(24, 0, 5)).toBe(21);
    expect(diffPanelViewport(24, 10, 100)).toBe(20);
  });
});

describe('jumpDiffHunkOffset', () => {
  const body = Array.from({ length: 30 }, (_, i) => ` line ${i}`);
  const lines = [
    '--- a/f',
    '+++ b/f',
    '@@ hunk1 @@',
    ...body.slice(0, 5),
    '@@ hunk2 @@',
    ...body.slice(5, 15),
    '@@ hunk3 @@',
    ...body.slice(15),
    ...Array.from({ length: 12 }, (_, i) => ` tail ${i}`),
  ];
  const panelHeight = 24;

  it('collects @@ headers', () => {
    expect(collectHunkHeaders(lines)).toEqual([2, 8, 19]);
  });

  it('finds the current hunk index from scroll offset', () => {
    expect(currentHunkIndex([2, 8, 19], 0)).toBe(-1);
    expect(currentHunkIndex([2, 8, 19], 2)).toBe(0);
    expect(currentHunkIndex([2, 8, 19], 11)).toBe(1);
  });

  it('places the next hunk header on the first visible line', () => {
    let offset = 0;
    offset = jumpDiffHunkOffset(lines, offset, 1, panelHeight);
    expect(offset).toBe(2);
    let viewport = diffPanelViewport(panelHeight, offset, lines.length);
    let { visible } = sliceScrollLines(lines, viewport, offset);
    expect(visible[0]).toBe('@@ hunk1 @@');

    offset = jumpDiffHunkOffset(lines, offset, 1, panelHeight);
    expect(offset).toBe(8);
    viewport = diffPanelViewport(panelHeight, offset, lines.length);
    ({ visible } = sliceScrollLines(lines, viewport, offset));
    expect(visible[0]).toBe('@@ hunk2 @@');

    offset = jumpDiffHunkOffset(lines, offset, 1, panelHeight);
    expect(offset).toBe(19);
    viewport = diffPanelViewport(panelHeight, offset, lines.length);
    ({ visible } = sliceScrollLines(lines, viewport, offset));
    expect(visible[0]).toBe('@@ hunk3 @@');
  });

  it('snaps to the current hunk before moving to the previous one', () => {
    const offset = jumpDiffHunkOffset(lines, 11, -1, panelHeight);
    expect(offset).toBe(8);
    const viewport = diffPanelViewport(panelHeight, offset, lines.length);
    const { visible } = sliceScrollLines(lines, viewport, offset);
    expect(visible[0]).toBe('@@ hunk2 @@');
  });
});
