export interface ColorSwatch {
  name: string;
  color: string;
}

const originalSidebar = '#1a3c2b';
const originalContent = '#f7f7f5';
const originalTerminalBackground = '#1e1e1e';
const originalTerminalForeground = '#d4d4d4';

const primeNgFamilies = [
  ['Emerald', '#065f46', '#ecfdf5'],
  ['Green', '#166534', '#f0fdf4'],
  ['Lime', '#3f6212', '#f7fee7'],
  ['Red', '#991b1b', '#fef2f2'],
  ['Orange', '#9a3412', '#fff7ed'],
  ['Amber', '#92400e', '#fffbeb'],
  ['Yellow', '#854d0e', '#fefce8'],
  ['Teal', '#115e59', '#f0fdfa'],
  ['Cyan', '#155e75', '#ecfeff'],
  ['Sky', '#075985', '#f0f9ff'],
  ['Blue', '#1e40af', '#eff6ff'],
  ['Indigo', '#3730a3', '#eef2ff'],
  ['Violet', '#5b21b6', '#f5f3ff'],
  ['Purple', '#6b21a8', '#faf5ff'],
  ['Fuchsia', '#86198f', '#fdf4ff'],
  ['Pink', '#9d174d', '#fdf2f8'],
  ['Rose', '#9f1239', '#fff1f2'],
  ['Slate', '#1e293b', '#f8fafc'],
] as const;

export const sidebarSwatches: ColorSwatch[] = [
  { name: 'Original', color: originalSidebar },
  ...primeNgFamilies.map(([name, color]) => ({ name, color })),
];

export const contentSwatches: ColorSwatch[] = [
  { name: 'Original', color: originalContent },
  ...primeNgFamilies.map(([name, , color]) => ({ name, color })),
];

export const terminalBackgroundSwatches: ColorSwatch[] = [
  { name: 'Original', color: originalTerminalBackground },
  ...primeNgFamilies.map(([name, color]) => ({ name, color })),
];

export const terminalForegroundSwatches: ColorSwatch[] = [
  { name: 'Original', color: originalTerminalForeground },
  { name: 'White', color: '#ffffff' },
];
