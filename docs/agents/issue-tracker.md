# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

## When the work lands

Comment on the issue in the same turn as the commit. The comment names the branch, the commit, and the pull request. Leave the issue open. The pull request body includes `Closes #<n>` for that issue, and the issue closes when that pull request merges. An unmet acceptance criterion stays off that `Closes` line. A follow-up is a new issue. An open `ready-for-agent` issue means the work is not done.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `/triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number> --comments` and `gh pr diff <number>` for the diff.
- **List external PRs for triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments` then keep only `authorAssociation` of `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR`, or `NONE` (drop `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: an issue linked to the map as a GitHub sub-issue (`gh api` on the sub-issues endpoint). Where sub-issues aren't enabled, add the child to a task list in the map body and put `Part of #<map>` at the top of the child body. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: GitHub's **native issue dependencies**, the canonical, UI-visible representation. Add an edge with `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, where `<blocker-db-id>` is the blocker's numeric **database id** (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _not_ the `#number` or `node_id`). GitHub reports `issue_dependencies_summary.blocked_by` (open blockers only, the live gate). Where dependencies aren't available, fall back to a `Blocked by: #<n>, #<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children (`gh issue list --state open`, scoped to the map's sub-issues / task list), drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.

## Orchestrate implement

Used by `/orchestrate-implement`. `claimed-by-agent` and `agent-failed` are claim markers, not triage roles. An issue keeps exactly one triage state role.

Create the labels when they are missing. `--force` updates the color and description when the label is already there:

```
gh label create claimed-by-agent --description "An agent has started this ticket" --color FBCA04 --force
gh label create agent-failed --description "The last agent run failed. Leave it unless a human includes it." --color D93F0B --force
```

**Grab rule.** An open issue labelled `agent-failed` stays put unless the human explicitly includes it. `ready-for-agent` on the same issue does not make it grabbable.

**Retries.** `gh issue list --state open --label agent-failed --limit 100 --json number,title,comments`

**Candidates.** `gh issue list --state open --label ready-for-agent --limit 100 --json number,title,body,labels`

**Unblocked.** `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by` is `0`, and the body's `Blocked by` line names no open issue. `None (can start immediately)` is unblocked.

**Parent and children.** The GitHub parent is the GraphQL `parent` field. Child tickets are `gh api repos/<owner>/<repo>/issues/<n>/sub_issues`. Where sub-issues are absent, a `## Parent` line in the child body is the parent.

**Claim.** Re-read with `gh issue view <n> --json labels,title`. When `claimed-by-agent` is already present, skip. Otherwise `gh issue edit <n> --remove-label ready-for-agent --add-label claimed-by-agent`, and on a retry add `--remove-label agent-failed`. Then `gh issue comment <n>` that the run has started.

**Success.** When the pull request lists `Closes #<n>`, `gh issue edit <n> --remove-label claimed-by-agent`. Leave the issue open. Leave `ready-for-agent` off. The issue closes when that pull request merges.

**Failure.** For a still-open issue whose build failed: `gh issue edit <n> --remove-label claimed-by-agent --add-label "ready-for-agent,agent-failed"`, then comment the reason, the branch, and the commits.

**Released before start.** `gh issue edit <n> --remove-label claimed-by-agent --add-label ready-for-agent`, then comment that the run stopped before the group started. Leave `agent-failed` off.
