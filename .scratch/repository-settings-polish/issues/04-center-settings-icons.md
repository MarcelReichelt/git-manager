# 04: Center the repository and app settings icons

**What to build:** The repository settings icon and the app settings icon sit in the center of their buttons.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Both buttons lay out their icon with centered alignment on both axes, with no padding that shoves the glyph off the middle. The app settings button is included; it currently has no centering layout.
- [ ] The glyph itself is centered in its 16 by 16 box. The current gear is drawn high in that box. Replace it with a gear whose artwork is centered (Primer octicon `gear-16` is a known-centered gear: the inner hole is a circle at the center of the view box). Do not nudge the old path with a translate or a shifted view box.
- [ ] Both buttons keep their accessible names, Repository settings and App settings, and still open the same dialogs.

**Seam:** The top bar as rendered in `tests/desktop-workspace.test.ts`. Assert centering with computed style (`display`, `align-items`, `justify-content`, and a block-level svg so the glyph does not sit on the text baseline).
