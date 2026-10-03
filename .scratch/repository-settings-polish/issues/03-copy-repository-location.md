# 03: Copy the repository location from settings

**What to build:** In repository settings, hovering the location shows a copy icon the way the branch name does, and clicking the location copies that path to the clipboard.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The location control shows the repository path, and its copy icon is hidden until hover or keyboard focus, then shown, matching the branch-name copy icon.
- [ ] Clicking the location copies the path and nothing else. The title says Copy location.
- [ ] The existing click on the repository name in the top bar still copies the same path.

**Seam:** Repository settings as rendered in `tests/desktop-workspace.test.ts`, using the test double for copying text.
