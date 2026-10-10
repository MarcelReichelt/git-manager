# Presets

A preset is a named set of terminal tabs for one checkout. Run preset opens those tabs in the selected worktree. Selecting a worktree, or launching the app, does not run a preset. There is no shortcut.

The button is a play symbol, immediately to the left of Split, in the workspace and in Terminals. It is absent when the checkout resolves no preset. Terminal mode None removes the terminal section, so the button is absent there too.

The play button opens the presets in file order, including when there is only one. The list label is the preset name. The chosen entry appends that preset's tabs. Choosing the same preset again appends another set of tabs, even when the terminal names match.

A collapsed terminal section expands when a preset runs, and that does not also open an empty terminal. Expanding an empty section with the chevron still starts one terminal.

The first new tab is focused. A tab with two terminals focuses the left one.

## File

Each checkout has its own files, including the primary checkout and a linked worktree. The committed file is `.git-worktree-manager/terminals.toml` in that checkout. The gitignored overlay is `.git-worktree-manager/terminals.override.toml` in that same checkout. Gitignore the overlay. The app does not write that entry.

```toml
[[preset]]
name = "dev"

[[preset.tab]]
terminals = [
  { name = "api", command = "npm run dev", cwd = "packages/api" },
]

[[preset.tab]]
terminals = [
  { name = "web", command = "npm run dev", cwd = "packages/web" },
  { name = "logs", command = "tail -f log.txt" },
]

[[preset]]
name = "test"

[[preset.tab]]
terminals = [
  { name = "unit", command = "npm test" },
]
```

`name` on a preset is the menu label. It is not written on the tab. A further `[[preset]]` block starts the next preset. The tabs under it belong to that preset until the next one.

A tab holds one terminal, or two side by side. The first terminal in the tab is on the left. The panes share the tab equally. The tab label shows each terminal's name. A preset does not set a separate tab title.

`name` on a terminal is that label. It may be omitted. An omitted name, or a name that is only whitespace, uses the startup command as the label. With neither, the tab shows the foreground process name. `command` is the startup command. `cwd` is the terminal's directory. Both may be omitted. An omitted command types nothing. An omitted directory is the worktree checkout.

A relative directory is resolved from that checkout and must stay inside it after `.` and `..` are normalized. An absolute directory is used as written, including outside the checkout. `~` is not expanded.

The app's shell command stays the program an in-app terminal runs. The startup command is typed as one line and entered once the prompt has settled. A shell that redraws its prompt while starting, such as fish with a greeting or a prompt plugin, still receives the command after that redraw. Shell integration markers from Cursor or VS Code are honored the same way. In tmux mode each new terminal is a tmux session. The tab still shows the terminal's name from the preset. The generated session name stays off the tab. The startup command is delivered into the session once the prompt has settled. An omitted command opens the named session and types nothing. Tmux mode does not use the shell command.

While the worktree stays selected, Run preset follows both files on disk. Saving either file updates the button and the menu. A file that appears can show the button. A save that leaves no preset hides it. The next choice reads the files as saved and opens those tabs. That includes a linked worktree chosen in Terminals.

## Overlay

The committed file is the base, in its order. An overlay preset with the same name replaces that preset completely and keeps its place. A new overlay name is appended. Names match exactly, including case, after surrounding whitespace is removed. Either file may be absent. An overlay file with no committed file is the whole list. A committed preset left out of the overlay stays in the list.

An overlay preset that is skipped still consumes its name, so the committed preset of that name does not run. Its place stays empty. A skipped committed preset keeps its place for an overlay replacement of that name. With no replacement, that committed preset does not run.

## What is skipped

The workspace shows the error. When nothing remains to run, Run preset is absent and the error stays.

A file is dropped when its TOML is invalid or it contains two presets of the same name. The other file still resolves. Invalid TOML names the file that failed.

One bad preset or terminal is skipped, and the rest of that file still runs.

A preset is skipped when it has no name, no tabs, or a tab with more than two terminals. A preset name that is only whitespace counts as a missing name.

A terminal is skipped when its startup command contains a newline, its relative directory leaves the checkout, or its directory does not exist. The other terminals in that preset still start. A pair with one terminal that does not start becomes a single terminal tab. A pair where neither starts adds no tab. The other tabs in that preset still open.
