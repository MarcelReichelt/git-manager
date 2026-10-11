# Checkout presets merge a committed file with a gitignored overlay

A checkout's presets are read from `.git-worktree-manager/terminals.toml` and `.git-worktree-manager/terminals.override.toml` in that checkout. Either file may be absent. The overlay is gitignored. An overlay preset replaces a committed preset of the same name and stays in that position, or it is appended when the name is new. The overlay cannot remove a committed preset.

A single per-branch file in the primary checkout was rejected because removing the worktree should remove the overlay, and hooks already receive the worktree path. Replacing the whole list whenever an overlay file exists was rejected because a hook then has to copy every committed preset to change one. Tombstones were rejected because hiding a shared preset is an edit to the committed file.
