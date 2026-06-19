export const globalOptions = {
  noHooks: false,
  noPreHooks: false,
  noPostHooks: false,
  verbose: false,
};

export function setGlobalOptions(opts: Partial<typeof globalOptions>): void {
  Object.assign(globalOptions, opts);
}
