#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'release');

function run(args, env = process.env) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

function installerNames() {
  if (!existsSync(releaseDir)) {
    return [];
  }
  return readdirSync(releaseDir).filter((name) =>
    /\.(AppImage|deb|exe|dmg|zip)$/.test(name),
  );
}

function unpackedExecutable() {
  const candidates = [
    join(releaseDir, 'linux-unpacked', 'git-manager'),
    join(releaseDir, 'win-unpacked', 'git-manager.exe'),
    join(releaseDir, 'mac', 'git-manager.app', 'Contents', 'MacOS', 'git-manager'),
    join(releaseDir, 'mac-arm64', 'git-manager.app', 'Contents', 'MacOS', 'git-manager'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function runSmoke(binary) {
  if (process.env.GIT_MANAGER_SKIP_DESKTOP_SMOKE === '1') {
    console.log('Skipping desktop smoke.');
    return;
  }
  if (process.platform !== 'linux') {
    console.log('Desktop smoke runs on Linux.');
    return;
  }
  const xvfb = spawnSync('which', ['xvfb-run'], { encoding: 'utf8' });
  if ((xvfb.status ?? 1) !== 0) {
    const message = 'xvfb-run is not installed, so the packaged app was not launched.';
    if (process.env.CI === 'true') {
      console.error(message);
      process.exit(1);
    }
    console.log(message);
    return;
  }
  console.log(`Launching ${binary}`);
  const result = spawnSync(
    'xvfb-run',
    ['-a', binary, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    {
      cwd: root,
      stdio: 'inherit',
      timeout: 90000,
      env: {
        ...process.env,
        GIT_MANAGER_DESKTOP_SMOKE: '1',
        ELECTRON_DISABLE_SANDBOX: '1',
      },
    },
  );
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if ((result.status ?? 1) !== 0) {
    process.exit(result.status ?? 1);
  }
}

run(['scripts/ensure-electron-natives.mjs']);
run([join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--config', 'vite.desktop.config.ts']);

const builderArgs = process.argv.slice(2);
const publishes = builderArgs.some((arg) => arg === '--publish' || arg.startsWith('--publish='));
const signing = process.env.CSC_IDENTITY_AUTO_DISCOVERY ?? 'false';
run(
  [
    join(root, 'node_modules', 'electron-builder', 'cli.js'),
    ...(publishes ? [] : ['--publish', 'never']),
    ...builderArgs,
  ],
  { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: signing },
);

const installers = installerNames();
if (installers.length === 0) {
  console.error('electron-builder produced no installer in release/.');
  process.exit(1);
}
console.log(`Desktop installers: ${installers.join(', ')}`);

const binary = unpackedExecutable();
if (!binary) {
  console.error('electron-builder produced no unpacked executable to smoke-test.');
  process.exit(1);
}
runSmoke(binary);
