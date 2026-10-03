# 01: Choose the worktree mode in repository settings

**What to build:** Repository settings shows this repository's worktree mode and saves a choice of Workspaces or Sibling onto the repository. The next worktree create uses that mode. Checkouts that already exist stay where they are.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Repository settings has a Worktree mode section between Location and Remotes, with the same words the app already uses: Workspaces and Sibling.
- [ ] The section states whether that mode is set by this repository or is the app default, in the same words the create dialog already uses (`Workspaces, the app default`, `Sibling, set by this repository`, and the raw label for an unsupported mode).
- [ ] Choosing Workspaces or Sibling writes `[layout].mode` in the repository's `.git-manager/config.toml` immediately. Copy files, hooks, and any other existing tables stay readable. A missing config file is created. An unsupported or non-text mode is replaced by the choice.
- [ ] Until a choice is made, a repository with no mode keeps following the app default and does not gain a config file.
- [ ] Choosing a mode does not create, move, or delete checkouts. The create dialog then names the mode as set by this repository, and the next created worktree uses that layout.
- [ ] A repository with no path on disk does not throw and does not write a config file.

**Seam:** `createLayoutForRepository` plus the new save function in app settings, tested from `tests/app-settings.test.ts`. The settings radios and the following create, tested from `tests/desktop-workspace.test.ts`.
