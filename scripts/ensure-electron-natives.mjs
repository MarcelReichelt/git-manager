#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const electronVersion = packageJson.devDependencies?.electron;

if (!electronVersion || /^[\^~]/.test(electronVersion)) {
  console.error('Electron native rebuild needs an exact electron version in devDependencies.');
  process.exit(1);
}

const modules = [
  { name: 'better-sqlite3', binary: 'better_sqlite3.node' },
  { name: 'node-pty', binary: 'pty.node' },
];

const outDir = join(root, 'native', 'electron');
const stampPath = join(outDir, 'stamp.json');

function moduleVersion(name) {
  const manifest = JSON.parse(
    readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8'),
  );
  return manifest.version;
}

const stamp = {
  electron: electronVersion,
  platform: process.platform,
  arch: process.arch,
  modules: Object.fromEntries(modules.map((mod) => [mod.name, moduleVersion(mod.name)])),
};

function stampMatches() {
  if (!existsSync(stampPath)) {
    return false;
  }
  const current = JSON.parse(readFileSync(stampPath, 'utf8'));
  if (JSON.stringify(current) !== JSON.stringify(stamp)) {
    return false;
  }
  return modules.every((mod) => existsSync(join(outDir, mod.binary)));
}

if (stampMatches()) {
  console.log(`Electron natives already built for ${electronVersion}.`);
  process.exit(0);
}

const nodeGyp = join(root, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js');
mkdirSync(outDir, { recursive: true });

for (const mod of modules) {
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
    const built = join(buildDir, 'Release', mod.binary);
    if (result.error) {
      console.error(result.error.message);
      status = 1;
    } else if ((result.status ?? 1) !== 0) {
      status = result.status ?? 1;
    } else if (!existsSync(built)) {
      console.error(`Electron rebuild did not produce ${built}`);
      status = 1;
    } else {
      copyFileSync(built, join(outDir, mod.binary));
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

writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`);
console.log(`Electron natives written to ${outDir}`);
