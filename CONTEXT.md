# Git workspace manager

git-manager is the desktop app for working in one selected repository at a time, with a checkout per branch.

## Language

**Workspace**:
The desktop window for one selected repository.
_Avoid_: workspaces

**Content**:
The region of a workspace beside the list of branches. It shows the branch heading, the changed files, the commits, and the diff.
_Avoid_: sheet

**Changes**:
The files that differ in the selected checkout.
_Avoid_: status, diff

**Commits**:
The commits of the selected branch. On the default branch, that is that branch's history. On any other branch, that is the commits that are not on the default branch.
_Avoid_: history, log

**Terminal section**:
The row under the content. It holds the terminal tabs for the selected worktree.
_Avoid_: terminal panel

**Arrangement**:
The app-wide sizes of the content and the terminal section, and whether the terminal section is collapsed.
_Avoid_: layout

**Registered repository**:
A local git repository the app knows how to open, recorded by its path and display name.
_Avoid_: project

**Primary checkout**:
The checkout at the registered repository's path.
_Avoid_: master tree, worktree, main repo

**Default branch**:
The branch this repository treats as its base. Update from master and Merge into master mean this branch, and merging another branch into it is how that branch is finished.
_Avoid_: master, main, primary branch

**Worktree**:
A checkout of a single branch, in either the sibling layout or the workspaces layout.
_Avoid_: workspace

**Terminal**:
A running shell for a worktree. It lives in a terminal tab.
_Avoid_: multiplexer, tab

**Terminal tab**:
A numbered view in the terminal section. It holds one terminal, or two side by side.
_Avoid_: session

**Terminal mode**:
The app setting that chooses which kind a new terminal is: an in-app terminal or a tmux session. None removes the terminal section. The default is an in-app terminal.
_Avoid_: shell mode

**Shell command**:
The program an in-app terminal runs. Tmux mode does not use it.
_Avoid_: terminal command

**Sibling**:
The worktree layout where the branch checkout is a folder next to the main repo folder, named from the branch.
_Avoid_: side-by-side

**Workspaces**:
The worktree layout where branch checkouts are subfolders under `.workspaces`.
_Avoid_: subfolder mode

**Repository layout**:
One registered repository's choice of Sibling or Workspaces. When it has none, create uses the app default.
_Avoid_: arrangement, app default

**App default**:
The layout used when a registered repository has not chosen Sibling or Workspaces.
_Avoid_: unset layout

**App settings**:
The settings that apply to every registered repository: the app default, the terminal mode, the shell command, the colors, the terminal font, and the IDE command.
_Avoid_: repository settings

**Repository settings**:
The location, the display name, the remotes, the sidebar color, and the sidebar text of one registered repository.
_Avoid_: app settings

**Remote**:
A name and a fetch URL on the open repository.
_Avoid_: origin, upstream
