import 'zone.js';
import 'zone.js/testing';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

getTestBed().initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
);

// jsdom returns var(--token) as the computed color. Resolve the custom property
// from the rendered element so screen assertions see the used color.
const nativeGetComputedStyle = window.getComputedStyle.bind(window);
const customPropertyUse = /^var\(\s*(--[\w-]+)\s*\)$/;

window.getComputedStyle = (element: Element, pseudoElt?: string | null): CSSStyleDeclaration => {
  const style = nativeGetComputedStyle(element, pseudoElt);
  resolveCustomColor(style, element, 'backgroundColor');
  resolveCustomColor(style, element, 'color');
  return style;
};

function resolveCustomColor(
  style: CSSStyleDeclaration,
  element: Element,
  property: 'backgroundColor' | 'color',
): void {
  const token = customPropertyUse.exec(style[property]);
  if (!token) {
    return;
  }
  const specified = specifiedCustomProperty(element, token[1]);
  const used = specified ? hexToRgb(specified) : null;
  if (used) {
    style[property] = used;
  }
}

function specifiedCustomProperty(element: Element, name: string): string {
  let node: Element | null = element;
  while (node) {
    const value = nativeGetComputedStyle(node).getPropertyValue(name).trim();
    if (value) {
      return value;
    }
    node = node.parentElement;
  }
  return '';
}

function hexToRgb(color: string): string | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color);
  if (!hex) {
    return null;
  }
  const value = Number.parseInt(hex[1], 16);
  return `rgb(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255})`;
}

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList,
});

Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 800 });
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 400 });

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value(): CanvasRenderingContext2D {
    return {
      measureText: () => ({ width: 8 }),
      fillRect: () => undefined,
      clearRect: () => undefined,
      getImageData: () => ({ data: [] }),
      putImageData: () => undefined,
      createImageData: () => [],
      setTransform: () => undefined,
      drawImage: () => undefined,
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      closePath: () => undefined,
      stroke: () => undefined,
      translate: () => undefined,
      scale: () => undefined,
      rotate: () => undefined,
      arc: () => undefined,
      fill: () => undefined,
      rect: () => undefined,
      clip: () => undefined,
    } as unknown as CanvasRenderingContext2D;
  },
});
