# Configuration

## Global: `~/.config/git-manager/config.toml`

```toml
[meta]
setup_completed = true

[editor]
command = "cursor"
args = []

[defaults]
clone_root = "~/DEV"
layout_mode = "workspaces"

[tui]
refresh_interval_ms = 2000

[hooks]
global_modules = ["setup-db.js"]
```

## Per-repo: `.git-manager/config.toml`

```toml
[layout]
mode = "workspaces"
workspaces_dir = ".workspaces"

[copy]
files = [".env.local"]

[hooks]
modules = ["./plugins/setup-db.ts"]

[hooks.post_merge]
commands = ["yarn"]
```

## Merge order

`defaults (code) → global config → per-repo config → CLI flags`

Edit via `git-manager settings edit` or TUI settings (planned overlay).
