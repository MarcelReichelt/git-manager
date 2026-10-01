# Plugins

A create plugin is a TypeScript or JavaScript module loaded with jiti. Paths in `[hooks].plugins` are relative to the repository.

```ts
import type { GitManagerPlugin } from '../src/hooks.js';

const plugin: GitManagerPlugin = {
  name: 'setup-db',
  preWorktreeCreate() {
    return 'abort';
  },
  postWorktreeCreate(context) {
    console.log(context.branch, context.worktreePath);
  },
};

export default plugin;
```

`preWorktreeCreate` runs after a remote-only branch is fetched and before the worktree is created. Return `'abort'` to refuse the worktree. `postWorktreeCreate` runs after it exists.

The context is the phase (`pre` or `post`), the branch, the worktree path, and the repository path.

`plugins/setup-db.ts` is an example that logs on `postWorktreeCreate`. Shell commands for the same moments live in `[hooks.create]`. See [Configuration](configuration.md).
