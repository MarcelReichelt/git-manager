import 'zone.js';
import 'zone.js/testing';
import '@angular/compiler';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';

const testBed = getTestBed();
if (!testBed.platform) {
  testBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
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

const box = {
  x: 0,
  y: 0,
  width: 800,
  height: 400,
  top: 0,
  left: 0,
  right: 800,
  bottom: 400,
  toJSON(): object {
    return {};
  },
};

HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect(): DOMRect {
  return box as DOMRect;
};

Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 800 });
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 400 });

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  configurable: true,
  value(): CanvasRenderingContext2D {
    return {
      measureText: () => ({ width: 8 }),
    } as unknown as CanvasRenderingContext2D;
  },
});
