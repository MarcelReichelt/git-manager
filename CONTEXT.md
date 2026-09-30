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

**Sibling**:
The worktree layout where the branch checkout is a folder next to the main repo folder, named from the branch.
_Avoid_: side-by-side

**Workspaces**:
The worktree layout where branch checkouts are subfolders under `.workspaces`.
_Avoid_: subfolder mode
