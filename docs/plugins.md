# Plugins

A plugin is a TypeScript or JavaScript module. `[hooks].modules` lists paths relative to the registered repository. They load with **jiti**, so there is no separate compile step.

The default export has a `name`. It may define `preWorktreeCreate`, `postWorktreeCreate`, `preWorktreeRemove`, and `postWorktreeRemove`. Create methods receive the create context. Remove methods receive the remove context. A pre method may return `'abort'`, which cancels that action with `<name> aborted worktree create` or `<name> aborted worktree remove`.

```ts
const plugin = {
  name: 'mark',
  preWorktreeCreate(ctx: {
    branch: string;
    worktreePath: string;
    repositoryPath: string;
  }): 'abort' | void {
    console.log(ctx.branch);
    return;
  },
};

export default plugin;
```

`branch` is the branch name. `worktreePath` is the worktree folder create will use. During `preWorktreeCreate` that folder does not exist yet. During `postWorktreeCreate` the worktree exists, and the files in `[copy].files` are already copied. `repositoryPath` is the primary checkout.

`branchSource` says where the branch came from:

- `{ kind: 'local' }` — the branch already existed locally
- `{ kind: 'new' }` — create adds a new local branch at the primary checkout's current commit
- `{ kind: 'remote', remote }` — create checks out that remote's branch

Remove passes `branch`, `worktreePath`, `repositoryPath`, and `deleteBranch`. `deleteBranch` is true when the local branch will be deleted. During `preWorktreeRemove` the worktree still exists. During `postWorktreeRemove` the checkout is gone, and the local branch is gone when `deleteBranch` is true. A remote branch is left in place.

Shell commands in the same config run in the primary checkout, before the plugin methods for that phase. Their environment includes `GIT_WORKTREE_MANAGER_BRANCH`, `GIT_WORKTREE_MANAGER_WORKTREE_PATH`, and `GIT_WORKTREE_MANAGER_REPOSITORY_PATH`. Create also sets `GIT_WORKTREE_MANAGER_BRANCH_SOURCE` (`local`, `new`, or `remote`) and, when the branch comes from a remote, `GIT_WORKTREE_MANAGER_REMOTE`. Remove sets `GIT_WORKTREE_MANAGER_DELETE_BRANCH` to `true` or `false`.

```toml
[hooks]
modules = ["./plugins/mark.ts"]

[hooks.pre_worktree_create]
commands = ["node hooks/mark.mjs"]

[hooks.post_worktree_create]
commands = ["yarn"]

[hooks.pre_worktree_remove]
commands = ["node hooks/before-remove.mjs"]

[hooks.post_worktree_remove]
commands = ["node hooks/after-remove.mjs"]
```

Order on create:

1. Fetch, when the name is not a local branch and a remote can be asked. A missing remote branch still continues as a new local branch.
2. Pre-create commands, then each plugin's `preWorktreeCreate`.
3. `git worktree add`, then the files in `[copy].files`.
4. Post-create commands, then each plugin's `postWorktreeCreate`.

Order on remove:

1. Pre-remove commands, then each plugin's `preWorktreeRemove`.
2. `git worktree remove`, then `git branch -D` when the local branch is being deleted.
3. Post-remove commands, then each plugin's `postWorktreeRemove`.

`plugins/setup-db.ts` logs the branch and worktree path from `postWorktreeCreate`. It does not create a database. `plugins/install-deps.ts` exports `postMerge`, and `plugins/merge-guard.ts` exports `preMerge`. The loader calls the create and remove methods only.
