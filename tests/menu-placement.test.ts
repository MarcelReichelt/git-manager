import { describe, expect, it } from 'vitest';
import { placeContextMenu, placeSubmenu } from '../src/desktop/menu-placement';

const viewport = { width: 800, height: 600 };
const menu = { width: 160, height: 120 };

describe('placeContextMenu', () => {
  it('leaves a menu that fits below and to the right of the pointer', () => {
    expect(placeContextMenu({ x: 40, y: 64 }, menu, viewport)).toEqual({ x: 40, y: 64 });
  });

  it('opens upward when the pointer is at the bottom edge', () => {
    expect(placeContextMenu({ x: 40, y: 560 }, menu, viewport)).toEqual({ x: 40, y: 440 });
  });

  it('opens to the left when the pointer is at the right edge', () => {
    expect(placeContextMenu({ x: 780, y: 64 }, menu, viewport)).toEqual({ x: 620, y: 64 });
  });

  it('stays inside both edges when the pointer is in the corner', () => {
    expect(placeContextMenu({ x: 780, y: 560 }, menu, viewport)).toEqual({ x: 620, y: 440 });
  });

  it('pins a menu taller than the window to the margin', () => {
    expect(placeContextMenu({ x: 40, y: 560 }, { width: 160, height: 700 }, viewport)).toEqual({ x: 40, y: 8 });
  });
});

describe('placeSubmenu', () => {
  it('opens to the right of its parent item', () => {
    expect(placeSubmenu({ left: 40, right: 200, top: 64 }, menu, viewport)).toEqual({ x: 200, y: 64 });
  });

  it('opens to the left when the right edge has no room', () => {
    expect(placeSubmenu({ left: 640, right: 800, top: 64 }, menu, viewport)).toEqual({ x: 480, y: 64 });
  });

  it('shifts up when the parent item is at the bottom edge', () => {
    expect(placeSubmenu({ left: 40, right: 200, top: 560 }, menu, viewport)).toEqual({ x: 200, y: 472 });
  });
});
