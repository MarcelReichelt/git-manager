import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const { electronNativeFile } = createRequire(import.meta.url)(
  '../src/desktop/install-electron-natives.cjs',
);

describe('desktop package', () => {
  it('builds an AppImage, a Windows setup, and a macOS disk image', () => {
    const config = readFileSync('electron-builder.yml', 'utf8');
    expect(config).toContain('target:\n    - AppImage\n    - deb');
    expect(config).toContain('target:\n    - nsis\n    - portable');
    expect(config).toContain('target:\n    - dmg\n    - zip');
    expect(config).toContain('npmRebuild: false');
    expect(config).toContain('native/electron/**/*');
    expect(config).toContain('src/desktop/shell-host.ts');
    expect(config).toContain('src/desktop/shell-prompt.ts');
  });

  it('loads jiti from the package when the desktop page has finished', () => {
    const config = readFileSync('vite.desktop.config.ts', 'utf8');
    expect(config).toContain('require.resolve("jiti")');
    expect(config).not.toContain('document.currentScript');
  });

  it('loads Electron natives before the main process starts a shell', () => {
    const main = readFileSync('src/desktop/shell-main.mjs', 'utf8');
    const install = main.indexOf('installElectronNatives()');
    const shell = main.indexOf("jiti('./shell-host.ts')");
    expect(install).toBeGreaterThan(-1);
    expect(shell).toBeGreaterThan(install);

    const preload = readFileSync('src/desktop/electron-preload.cjs', 'utf8');
    expect(preload.indexOf('installElectronNatives()')).toBeGreaterThan(-1);
  });

  it('uses the unpacked Electron binary from inside an asar package', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-worktree-manager-native-'));
    const asarDir = join(root, 'app.asar', 'native', 'electron');
    const unpackedDir = join(root, 'app.asar.unpacked', 'native', 'electron');
    mkdirSync(asarDir, { recursive: true });
    mkdirSync(unpackedDir, { recursive: true });
    writeFileSync(join(asarDir, 'pty.node'), 'asar');
    writeFileSync(join(unpackedDir, 'pty.node'), 'unpacked');
    const requested = join(root, 'app.asar', 'node_modules', 'node-pty', 'build', 'Release', 'pty.node');

    expect(electronNativeFile(requested, asarDir)).toBe(join(unpackedDir, 'pty.node'));
    rmSync(root, { recursive: true, force: true });
  });

  it('keeps the Node binary when no Electron build is present', () => {
    const root = mkdtempSync(join(tmpdir(), 'git-worktree-manager-native-'));
    const requested = join(root, 'node_modules', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node');
    mkdirSync(join(requested, '..'), { recursive: true });
    writeFileSync(requested, 'node');

    expect(electronNativeFile(requested, join(root, 'native', 'electron'))).toBeNull();
    rmSync(root, { recursive: true, force: true });
  });
});
