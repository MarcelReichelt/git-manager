import { describe, it, expect } from 'vitest';
import { sliceScrollLines, scrollIndicator } from '../src/tui/scroll.js';

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
  });

  it('clamps scroll offset to maxScroll', () => {
    const result = sliceScrollLines(lines, 10, 999);
    expect(result.hiddenBelow).toBe(0);
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
