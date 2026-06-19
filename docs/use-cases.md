# Use cases

## Parallel feature development

1. `git-manager branch fetch`
2. `git-manager worktree create feature/login`
3. `git-manager worktree open feature/login`

## Hotfix on primary branch

1. `git-manager worktree switch main`
2. Make fix, commit, push
3. `git-manager merge from-primary --to feature/login`

## Post-merge install

Add to `.git-manager/config.toml`:

```toml
[hooks.post_merge]
commands = ["yarn"]
```

Or use a plugin from `plugins/install-deps.ts`.
