# Desktop

`yarn desktop` opens the window. It needs a display. On Linux and macOS the branch terminal uses `tmux`.

With nothing selected, a centered card lists registered repositories. An empty card says a repository needs to be added.

## Add a repository

**+** opens Add repository.

Location is a text field. Type or paste a path, or use the folder button. A git directory fills Display name from the repository folder. A bare repository uses the git directory's name. Editing the display name keeps your text when the path changes.

A path that is not a git repository shows that error under Location and disables Add repository. An empty location reports `Choose a repository folder` when Add repository is clicked. An empty display name reports `Enter a display name`. Adding a path that is already registered updates the display name.

## Workspace

The top bar shows the display name. Hovering it shows the location. Clicking it copies the location.

Switch repository opens the card over the workspace. Repository settings shows the location and the remotes. Minimize, maximize, and close sit on the right. Drag the top bar to move the window.

## Worktrees

The sidebar heading is Worktrees. Each row is a branch `git worktree list` has checked out. The default branch is first when it has a checkout. A branch with no checkout is absent. Opening the repository prunes remote-tracking refs whose remote branch is gone.

The color beside the name is the status. Hovering it shows the title:

| Title | When |
| --- | --- |
| Local only | No upstream is configured |
| Local and remote | The configured upstream ref exists |
| Remote deleted | An upstream is configured and that ref is gone |

A row also shows the changed-file count, and how many commits the branch is ahead and behind. Those counts use the upstream when it exists, and the default branch otherwise. A terminal count appears while a terminal for that worktree is running. On Linux and macOS that count is the number of `tmux` sessions for the branch. On Windows it is 1 while the shell for the selected worktree is open.

Click a row to open it. **···** opens the branch actions: Update from master, Merge into master, and Remove worktree. Update from master merges `master` into that checkout. Merge into master opens a dialog with a Squash checkbox, and the primary checkout has to be on `master`. Remove worktree deletes the extra checkout and keeps the branch. The primary checkout stays.

## Create a worktree

Create worktree opens a dialog. The name field is New branch. Existing branches lists names that have no checkout, including a branch that exists only on a remote, and omits a branch whose remote copy was deleted. The heading is absent when that list is empty. Choosing a row fills the name field.

Confirm runs the same create as the CLI. The typed name has to be a local branch or a branch on a remote. A remote-only branch is fetched first. Pre-create hooks run before the worktree is added. Post-create hooks run after checkout. See [Worktrees and layouts](worktrees-and-layouts.md).

## Content

The heading is the branch name. Click it to copy the name.

The default branch is the name in `origin/HEAD` when that ref is set. Otherwise it is `master` or `main` when only one of those local branches exists. When both exist, it is whichever of them is checked out on the primary checkout, and `master` when the checkout is neither. When neither exists, it is the branch checked out on the primary checkout.

Changes lists files in that checkout, with lines added and deleted. Click a file to show its diff.

On the default branch, Commits is `git log` for that branch, 30 commits at a time, and scrolling the list loads the next page. On any other branch, the list is commits only on that branch, compared with the default branch. Click a commit to show the files it changed and the diff for the selected file.

Drag the splitters between the panes to resize them. Each region scrolls on its own.

## Terminal

Selecting a worktree opens a terminal in that checkout.

On Linux and macOS the terminal is a `tmux` session. The name starts with `gm_`, a short hash of the repository path, and the branch. New, Split, and Kill manage the sessions for that branch. `tmux list-sessions` shows the same sessions, and `tmux attach` opens one outside the window.

On Windows the pane is one shell in the worktree directory.

## Remotes

Repository settings lists each remote under Remotes. The name is a label. The URL is the fetch URL, and it is read-only. Hovering or focusing a row shows the edit icon.

Add remote opens a dialog for the name and URL. That URL is used for fetch and push. Edit remote changes the name and the fetch URL, or removes the remote. A push URL that already differs from the fetch URL is left as it is. A failed change is rolled back to the previous name and URLs.

## Dismiss

Escape closes one layer. Add repository, Add remote, and Edit remote close before Repository settings. Merge into master and Create worktree close before the repository switcher. The branch menu closes after those. A click on a dialog's backdrop closes that dialog. A click outside the branch menu closes the menu. Close on the switcher card closes the switcher.
