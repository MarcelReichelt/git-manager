const menuMargin = 8;

export interface MenuPoint {
  x: number;
  y: number;
}

export interface MenuSize {
  width: number;
  height: number;
}

export interface MenuViewport {
  width: number;
  height: number;
}

export function placeContextMenu(anchor: MenuPoint, size: MenuSize, viewport: MenuViewport): MenuPoint {
  const box = fittedSize(size, viewport);
  let x = anchor.x;
  let y = anchor.y;
  if (x + box.width > viewport.width - menuMargin) {
    x = anchor.x - box.width;
  }
  if (y + box.height > viewport.height - menuMargin) {
    y = anchor.y - box.height;
  }
  return {
    x: clamp(x, menuMargin, viewport.width - box.width - menuMargin),
    y: clamp(y, menuMargin, viewport.height - box.height - menuMargin),
  };
}

export function placeSubmenu(
  parent: { left: number; right: number; top: number },
  size: MenuSize,
  viewport: MenuViewport,
): MenuPoint {
  const box = fittedSize(size, viewport);
  const opensRight = parent.right + box.width <= viewport.width - menuMargin;
  const x = opensRight ? parent.right : Math.max(menuMargin, parent.left - box.width);
  let y = parent.top;
  if (y + box.height > viewport.height - menuMargin) {
    y = viewport.height - box.height - menuMargin;
  }
  return { x, y: Math.max(menuMargin, y) };
}

function fittedSize(size: MenuSize, viewport: MenuViewport): MenuSize {
  return {
    width: Math.min(size.width, Math.max(0, viewport.width - menuMargin * 2)),
    height: Math.min(size.height, Math.max(0, viewport.height - menuMargin * 2)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
