# Git workspace manager

git-manager is the desktop app for working in one selected repository at a time, with a checkout per branch.

## Language

**Workspace**:
The desktop window for one selected repository.
_Avoid_: workspaces

**Registered repository**:
A local git repository the app knows how to open, recorded by its path and display name.
_Avoid_: project

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

**App default**:
The layout used when a registered repository has not chosen Sibling or Workspaces.
_Avoid_: unset layout
