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
