# Desktop

`yarn desktop` opens the window. It needs a display. App settings chooses the terminal mode for a new terminal: an in-app terminal, a tmux session, or no terminal section. Terminal is the default.

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

A row also shows the changed-file count, and how many commits the branch is ahead and behind. Those counts use the upstream when it exists, and the default branch otherwise. A terminal count appears while terminals for that worktree are running, and it is hidden at zero. The count is the number of running terminals, so a tab with two terminals side by side counts as two.

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

The terminal is a row at the bottom of the worktree, under the changes, the commits, and the diff. The row starts expanded. Drag the horizontal splitter to resize it. That height stays for the life of the workspace, including when you switch worktrees. The chevron collapses the row to the header and hides the splitter. Expanding restores that height. While the row is collapsed, the header shows how many terminals are running for the selected worktree when that count is greater than zero. Killing the last terminal collapses the row. Opening it starts a terminal when the worktree has none.

Selecting a worktree opens a terminal in that checkout when the worktree has none and the terminal mode is Terminal or Tmux. The row stays collapsed when it was already collapsed. A worktree keeps its tabs while another worktree is selected, and while the row is collapsed.

The terminals for a worktree sit in numbered tabs in the header. A tab holds one terminal, or two side by side. The number is the tab's position, starting at 1. Closing a tab renumbers the tabs after it. Inserting a tab renumbers the tabs after the insertion, so a new tab between 1 and 2 becomes 2 and the old 2 becomes 3.

New, Split, and Kill are icon buttons. New adds a tab at the end with one terminal. On a collapsed header, New also expands the row. Split adds a second terminal to the current tab. The two panes sit side by side with a splitter between them. Split is disabled when the current tab already has two. Kill on the header kills the focused terminal. Killing a terminal closes it. The last terminal in a tab closes the tab.

With no custom name, a one-terminal tab shows its number and the foreground process name, such as `1 bash`. A split tab shows both names, such as `1 bash · npm`, and each pane shows its own name. The process name is the running command, and the shell name again when that command exits. A tooltip on a terminal says `tmux session` or `in-app terminal`.

Right-click a tab that holds one terminal for Rename, Kill, and Split. Right-click a terminal inside a split tab for Rename, Kill, Split, and Unsplit. Split is disabled there. Right-click the tab of a split tab for Rename and Kill of the whole tab. Kill on a tab kills every terminal in it. Unsplit moves the right-clicked terminal into a new tab immediately after the current tab and focuses that new tab. The other terminal stays.

Rename turns the name into a field. Enter commits it. An empty name clears it, and the process name comes back. Escape closes the menu without renaming. Splitting a renamed one-terminal tab keeps that name on the existing terminal. The new terminal starts from its process name. Renaming a split tab replaces the chip until the name is cleared. The pane headers still show each terminal's name. Renaming a terminal inside a split tab sets that terminal's name until it is cleared. Unsplit keeps a renamed terminal's name on its new tab. When one terminal of a pair is closed, a custom tab name stays and the remaining terminal's name is dropped. Without a custom tab name, the remaining terminal's name becomes the tab name.

App settings chooses the terminal mode: None, Terminal, or Tmux. Terminal is the default, including when tmux is installed. None removes the terminal section, so there is no row, chevron, or New, and selecting a worktree starts nothing. Terminal starts an in-app terminal. Tmux starts a tmux session. New and Split create a terminal of the selected mode.

The Terminal option has an edit button for the shell command. The shell command is one program path, with no arguments, stored in app settings. A blank shell command starts the login shell, then `/bin/bash`, then `powershell.exe` on Windows, using the first one that can start. The login shell is `SHELL` when that is a non-empty path, and otherwise the OS user shell. The shell starts interactive, so its own config loads. A path that fails to start shows the workspace error. Changing the shell command leaves terminals that are already running, and terminals started afterward use the new command. Tmux mode ignores the shell command.

The Tmux option is disabled when tmux is not on PATH. Its tooltip is "tmux is not installed". Windows does not hide that option when tmux is installed. If the saved mode is Tmux and tmux is missing, the app behaves as Terminal mode and does not rewrite the saved setting.

Changing mode asks only when the mode you are leaving still has a running terminal of that mode. None has no terminals of its own, so leaving None does not ask. A switch with nothing running does not ask. The dialog offers Keep, Kill, and Cancel. Cancel leaves the mode and the terminals unchanged. Keep leaves those terminals running and shows them on the same tab strip as the mode you are entering. A split tab can hold one in-app terminal and one tmux session when the mode changes between the two panes. Kill stops every terminal of the mode you are leaving, and only that mode. Leaving Terminal kills in-app terminals. Leaving Tmux kills the app's tmux sessions, including sessions for repositories that are not open, and leaves tmux sessions that are not the app's. If the selected worktree then has no terminals, the section collapses, and opening it starts one terminal of the new mode. If any terminals remain, the section stays as it was, expanded or collapsed, and shows them.

Switching to None hides the section. Keep leaves the terminals running, and they show again when you leave None and select that worktree. Switching repository ends the open workspace's in-app terminals. Tmux sessions keep running. In-app terminals exist only for the open workspace. Tmux sessions for another repository stay off this workspace's tab strip and appear when that repository is open. While the mode is Terminal, tmux sessions for the open repository still appear on the tab strip. They stay hidden while the mode is None.

In Tmux mode, the session name starts with `gm_`, a short hash of the repository path, and the branch. A branch of letters, digits, and hyphens is used as itself. A slash in the branch stays in the session name. A character tmux cannot keep is encoded, and a short hash of the branch is added when that encoding would otherwise be a tmux-safe name. That name is the tmux session, not the tab label. `tmux list-sessions` shows the same sessions, and `tmux attach` opens one outside the window.

Opening a repository looks for this app's tmux sessions that were created before a session recorded its branch. Those sessions have no recorded branch. The old name replaced every character outside letters, digits, and hyphens with a hyphen, so `feature/foo` and `feature-foo` both produced a name containing `feature-foo`. When that old name matches one current branch, the app records that branch on the session and does not ask. The session keeps its old name and keeps running. A branch created later that would use the same old name does not list that session. When the old name matches more than one current branch, the app asks before keeping the session. The question lists each of those sessions for the repository being opened. For each one it offers the matching branches, Kill, and leaving the session unchanged. Choosing a branch records that branch, keeps the old name, leaves the session running, and lists it only for that branch. The session is not renamed onto the newer prefix. Kill ends that session, so the other matching branch does not list it. Leaving a session unchanged does not record a branch and does not kill it. The workspace still opens, and opening that repository again asks again. Escape, or a click on the backdrop, leaves every remaining session unchanged. A session whose old name matches no current branch is left running, and the app does not ask about it. A tmux session that is not this app's stays running and does not appear in the question. Sessions for a repository that is not being opened are left until that repository is opened.

App settings chooses the terminal font and the terminal background and foreground. The font family is `UbuntuMono Nerd Font Mono` by default, and the terminal uses that name followed by `monospace`. The background starts at `#1e1e1e` and the foreground at `#d4d4d4`. A terminal that is already open uses a new font or color immediately. The header stays `#252526`.

## Remotes

Repository settings lists each remote under Remotes. The name is a label. The URL is the fetch URL, and it is read-only. Hovering or focusing a row shows the edit icon.

Add remote opens a dialog for the name and URL. That URL is used for fetch and push. Edit remote changes the name and the fetch URL, or removes the remote. A push URL that already differs from the fetch URL is left as it is. A failed change is rolled back to the previous name and URLs.

## Dismiss

Escape closes one layer. Add repository, Add remote, and Edit remote close before Repository settings. Merge into master and Create worktree close before the repository switcher. The branch menu closes after those. A click on a dialog's backdrop closes that dialog. A click outside the branch menu closes the menu. Close on the switcher card closes the switcher.
