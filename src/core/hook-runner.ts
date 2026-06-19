import { createJiti } from 'jiti';
import { execa } from 'execa';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  getHookCommands,
  getHookConfig,
  loadEffectiveConfig,
  loadGlobalConfig,
  loadRepoConfig,
} from '../config/loader.js';
import { getGlobalPluginsDir } from '../config/paths.js';
import { globalOptions } from './global-options.js';
import type { HookAction } from '../config/schema.js';
import {
  HookAbortError,
  type GitManagerPlugin,
  type HookResult,
} from '../hooks/types.js';

const pluginCache = new Map<string, GitManagerPlugin>();

function methodName(phase: 'pre' | 'post', action: HookAction): keyof GitManagerPlugin {
  const camel =
    action
      .split('_')
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('');
  return `${phase}${camel}` as keyof GitManagerPlugin;
}

async function loadPlugin(modulePath: string): Promise<GitManagerPlugin | null> {
  const abs = resolve(modulePath);
  if (pluginCache.has(abs)) {
    return pluginCache.get(abs)!;
  }
  if (!existsSync(abs)) {
    console.warn(`Plugin not found: ${abs}`);
    return null;
  }
  const jiti = createJiti(import.meta.url);
  const mod = (await jiti.import(abs)) as { default?: GitManagerPlugin } & GitManagerPlugin;
  const plugin = mod.default ?? mod;
  if (!plugin.name) {
    console.warn(`Plugin missing name: ${abs}`);
    return null;
  }
  pluginCache.set(abs, plugin);
  return plugin;
}

async function getPlugins(layoutRoot: string): Promise<GitManagerPlugin[]> {
  const global = loadGlobalConfig();
  const repo = loadRepoConfig(layoutRoot);
  const paths: string[] = [];

  for (const file of global.hooks.global_modules) {
    paths.push(join(getGlobalPluginsDir(), file));
  }
  for (const mod of repo.hooks.modules) {
    paths.push(resolve(layoutRoot, mod));
  }

  const plugins: GitManagerPlugin[] = [];
  for (const p of paths) {
    const plugin = await loadPlugin(p);
    if (plugin) {
      plugins.push(plugin);
    }
  }
  return plugins;
}

function shouldSkip(phase: 'pre' | 'post'): boolean {
  if (globalOptions.noHooks) {
    return true;
  }
  if (phase === 'pre' && globalOptions.noPreHooks) {
    return true;
  }
  if (phase === 'post' && globalOptions.noPostHooks) {
    return true;
  }
  return false;
}

export async function runHooks(
  action: HookAction,
  phase: 'pre' | 'post',
  context: Record<string, unknown>,
  cwd: string,
): Promise<void> {
  if (shouldSkip(phase)) {
    return;
  }

  const layoutRoot = (context.layoutRoot as string) ?? cwd;
  const effective = loadEffectiveConfig(layoutRoot);
  const section = `${phase}_${action}`;
  const hookConfig = getHookConfig(effective, section);
  const commands = getHookCommands(effective, phase, action);

  for (const cmd of commands) {
    try {
      await execa(cmd, { shell: true, cwd, stdio: 'inherit' });
    } catch (err) {
      if (phase === 'pre') {
        throw err;
      }
      console.error(`Post-hook command failed: ${cmd}`, (err as Error).message);
    }
  }

  const plugins = await getPlugins(layoutRoot);
  const method = methodName(phase, action);

  for (const plugin of plugins) {
    const fn = plugin[method] as ((ctx: unknown) => Promise<HookResult> | HookResult) | undefined;
    if (!fn) {
      continue;
    }
    const ctx = { ...context, config: effective.repo ?? loadRepoConfig(layoutRoot), hookConfig };
    const result = await fn.call(plugin, ctx);
    if (phase === 'pre' && result === 'abort') {
      throw new HookAbortError(`${plugin.name} aborted ${action}`);
    }
  }
}

export { HookAbortError };
