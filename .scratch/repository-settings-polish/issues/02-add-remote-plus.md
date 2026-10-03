# 02: Add remote is a plus on the Remotes header

**What to build:** In repository settings, Add remote is a plus button on the right side of the Remotes header. It still opens the add-remote dialog. The dialog footer no longer has an Add remote button.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The Remotes heading still reads Remotes, and a button whose visible text is only `+` sits on the right side of that header.
- [ ] The button's accessible name is still Add remote, and activating it opens the existing add-remote dialog.
- [ ] The repository settings footer no longer contains that button. Close stays in the footer. The dialog's confirm button still reads Add remote.
- [ ] The plus is a square control, with the glyph centered, in the same spirit as the Repositories header plus.

**Seam:** Repository settings as rendered in `tests/desktop-workspace.test.ts`.
