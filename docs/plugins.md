# Plugins

A plugin is a TypeScript or JavaScript module. `[hooks].modules` lists paths relative to the registered repository. They load with **jiti**, so there is no separate compile step.

The default export has a `name`. It may define `preWorktreeCreate` and `postWorktreeCreate`. The loader calls those methods with no arguments. `preWorktreeCreate` may return `'abort'`, which cancels create with `<name> aborted worktree create`.

```ts
const plugin = {
  name: 'mark',
  preWorktreeCreate(): 'abort' | void {
    return;
  },
};

export default plugin;
```

Shell commands in the same config run in the registered repository, and they run before the plugin methods for that phase:

```toml
[hooks]
modules = ["./plugins/mark.ts"]

[hooks.pre_worktree_create]
commands = ["node hooks/mark.mjs"]

[hooks.post_worktree_create]
commands = ["yarn"]
```

Order on create:

1. Fetch, when the name is not a local branch and a remote can be asked. A missing remote branch still continues as a new local branch.
2. Pre-create commands, then each plugin's `preWorktreeCreate`.
3. `git worktree add`, then the files in `[copy].files`.
4. Post-create commands, then each plugin's `postWorktreeCreate`.

`plugins/setup-db.ts` exports `postWorktreeCreate` and reads a context argument the loader does not pass. `plugins/install-deps.ts` exports `postMerge`, and `plugins/merge-guard.ts` exports `preMerge`. The loader calls `preWorktreeCreate` and `postWorktreeCreate` only.
