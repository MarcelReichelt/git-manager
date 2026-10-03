export function runtimeEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (env) {
    return env;
  }
  // The desktop bundle inlines any direct `process.env` reference. Building the
  // name keeps the running environment, including GIT_MANAGER_APP_SETTINGS_PATH
  // and GIT_MANAGER_REGISTRY_PATH.
  const processKey = 'pro' + 'cess';
  const host = globalThis as unknown as Record<string, { env?: NodeJS.ProcessEnv } | undefined>;
  return host[processKey]?.env ?? {};
}
