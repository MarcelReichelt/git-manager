#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { electronNativeAddons } from '../src/desktop/electron-native-addons.cjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const electronVersion = packageJson.devDependencies?.electron;

if (!electronVersion || /^[\^~]/.test(electronVersion)) {
  console.error('Electron native rebuild needs an exact electron version in devDependencies.');
  process.exit(1);
}

const outDir = join(root, 'native', 'electron');
const stampPath = join(outDir, 'stamp.json');

function moduleVersion(name) {
  const manifest = JSON.parse(
    readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8'),
  );
  return manifest.version;
}

const stamp = {
  layout: 2,
  electron: electronVersion,
  platform: process.platform,
  arch: process.arch,
  modules: Object.fromEntries(
    electronNativeAddons.map((mod) => [mod.name, moduleVersion(mod.name)]),
  ),
};

function requiredBinaries() {
  const required = electronNativeAddons.map((mod) => mod.binary);
  if (process.platform === 'win32') {
    required.push(
      'conpty.node',
      'conpty_console_list.node',
      join('conpty', 'conpty.dll'),
      join('conpty', 'OpenConsole.exe'),
    );
  }
  if (process.platform === 'darwin') {
    required.push('spawn-helper');
  }
  return required;
}

function stampMatches() {
  if (!existsSync(stampPath)) {
    return false;
  }
  const current = JSON.parse(readFileSync(stampPath, 'utf8'));
  if (JSON.stringify(current) !== JSON.stringify(stamp)) {
    return false;
  }
  return requiredBinaries().every((file) => existsSync(join(outDir, file)));
}

function keepReleaseFile(name) {
  return (
    name.endsWith('.node') ||
    name === 'spawn-helper' ||
    name.endsWith('.dll') ||
    name.endsWith('.exe')
  );
}

function copyReleaseBinaries(releaseDir) {
  if (!existsSync(releaseDir)) {
    return;
  }
  for (const entry of readdirSync(releaseDir, { withFileTypes: true })) {
    const source = join(releaseDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'conpty') {
        cpSync(source, join(outDir, entry.name), { recursive: true });
      }
      continue;
    }
    if (keepReleaseFile(entry.name)) {
      copyFileSync(source, join(outDir, entry.name));
    }
  }
}

function ensureWindowsConpty(moduleDir, releaseDir) {
  if (process.platform !== 'win32' || existsSync(join(releaseDir, 'conpty', 'conpty.dll'))) {
    return;
  }
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  const conptyRoot = join(moduleDir, 'third_party', 'conpty');
  const versionFolder = readdirSync(conptyRoot)[0];
  if (!versionFolder) {
    console.error('node-pty is missing third_party/conpty.');
    process.exit(1);
  }
  const sourceDir = join(conptyRoot, versionFolder, `win10-${arch}`);
  const destDir = join(releaseDir, 'conpty');
  mkdirSync(destDir, { recursive: true });
  for (const file of ['conpty.dll', 'OpenConsole.exe']) {
    copyFileSync(join(sourceDir, file), join(destDir, file));
  }
}

if (stampMatches()) {
  console.log(`Electron natives already built for ${electronVersion}.`);
  process.exit(0);
}

const nodeGyp = join(root, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
mkdirSync(outDir, { recursive: true });

for (const mod of electronNativeAddons) {
  const moduleDir = join(root, 'node_modules', mod.name);
  const buildDir = join(moduleDir, 'build');
  const stashDir = join(tmpdir(), `git-manager-native-${mod.name}-${process.pid}`);
  const hadBuild = existsSync(buildDir);
  if (hadBuild) {
    cpSync(buildDir, stashDir, { recursive: true });
  }

  let status = 0;
  try {
    console.log(`Building ${mod.name} for Electron ${electronVersion}.`);
    const result = spawnSync(
      process.execPath,
      [
        nodeGyp,
        'rebuild',
        `--target=${electronVersion}`,
        `--arch=${process.arch}`,
        '--dist-url=https://electronjs.org/headers',
      ],
      { cwd: moduleDir, stdio: 'inherit' },
    );
    const releaseDir = join(buildDir, 'Release');
    const built = join(releaseDir, mod.binary);
    if (result.error) {
      console.error(result.error.message);
      status = 1;
    } else if ((result.status ?? 1) !== 0) {
      status = result.status ?? 1;
    } else if (!existsSync(built)) {
      console.error(`Electron rebuild did not produce ${built}`);
      status = 1;
    } else {
      if (mod.name === 'node-pty') {
        ensureWindowsConpty(moduleDir, releaseDir);
      }
      copyReleaseBinaries(releaseDir);
    }
  } finally {
    rmSync(buildDir, { recursive: true, force: true });
    if (hadBuild) {
      cpSync(stashDir, buildDir, { recursive: true });
      rmSync(stashDir, { recursive: true, force: true });
    }
  }

  if (status !== 0) {
    process.exit(status);
  }
}

const missing = requiredBinaries().filter((file) => !existsSync(join(outDir, file)));
if (missing.length > 0) {
  console.error(`Electron rebuild did not produce ${missing.join(', ')}`);
  process.exit(1);
}

writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);
console.log(`Electron natives written to ${outDir}`);
