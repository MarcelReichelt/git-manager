# CLI reference

## Global flags

- `--verbose` — show filesystem paths
- `--no-hooks` — skip all hooks
- `--no-pre-hooks` / `--no-post-hooks` — partial skip

## Commands

| Command | Description |
| --- | --- |
| `(default)` | Interactive menu |
| `setup` | Settings wizard |
| `register` | Register cwd repo |
| `repo list` | List registered repos |
| `repo current` | Show active repo/worktree |
| `repo switch [name]` | Unified picker or switch by name |
| `repo add [--path]` | Add existing repo |
| `repo unregister [name]` | Remove from registry |
| `clone <url>` | Clone and register |
| `branch list` / `fetch` | Remote branches |
| `worktree list/switch/path/open/create/remove/pull/push` | Worktree ops |
| `changes [--all] [--files]` | Working tree status |
| `merge into-primary/from-primary/<src> <tgt>` | Merge flows |
| `doctor [--fix]` | Registry health |
| `settings show/edit/set/reset/wizard` | Global settings |
| `config init/show` | Per-repo config |
| `docs [topic]` | Open documentation |
| `ui` | Launch TUI |

See `git-manager <command> --help` for flags.
