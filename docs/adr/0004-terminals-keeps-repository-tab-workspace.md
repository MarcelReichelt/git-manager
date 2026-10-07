# Terminals keeps each repository tab's workspace

Terminals is the window-bar control before the repository tabs. Choosing a worktree there shows that worktree's maximized terminal section and leaves the repository tabs unselected. The branch and the terminal section height of each repository tab stay as they were, and the next launch still selects the last repository tab. Switching into that repository tab and maximizing there was rejected, because that would replace the grouped list and overwrite the workspace the repository tab had been showing.
