---
name: orchestrate-implement
description: "Claim confirmed ready tickets and run each group through implement-spec."
disable-model-invocation: true
argument-hint: "Nothing to survey the queue, or issue numbers, a parent, or a task"
---

Work a confirmed set of tickets by claiming them and handing each group to `/implement-spec`, one group at a time. Tickets that share a parent land on one integration branch. A ticket with no parent gets its own branch.

The issue tracker should have been provided to you. If `docs/agents/issue-tracker.md` is missing, tell the user to run `/setup-matt-pocock-skills`. Claiming, releasing, the retry list, and the grab rule are the **Orchestrate implement** operations in that doc.

## Steps

### 1. List retries

List every open issue labelled `agent-failed`. Do this on every run: a bare survey, a run given issue numbers or a parent, a prose task, and a run whose proposed work is empty.

For each issue show its number, title, and the gist of the latest failure comment: why it failed, and the branch when the comment names one.

Completion: the user has been shown a **Retries** section. It lists every open `agent-failed` issue, or it says there are none.

### 2. Resolve the work set

Follow the grab rule. `agent-failed` issues stay in **Retries** unless the user includes them.

- **No argument.** Survey open `ready-for-agent` issues. Keep a ticket: a body with `## What to build`, unblocked, and free of `claimed-by-agent` and `agent-failed`. A spec (a body with `## Problem Statement`, or an issue that has child tickets) is a parent for grouping, and it stays open. Name a spec that has no child tickets beside the list. Name blocked tickets beside the list. Group the kept tickets by parent: the GitHub parent, otherwise a `## Parent` reference, otherwise a group of its own. Show each group in order, with each ticket's number and title.
- **Issue numbers, or a parent.** That is the set, in the order given. There is no second survey. A parent expands to its open, unblocked, unclaimed child tickets that are free of `agent-failed`, unless the argument named that child.
- **A prose task and no issue.** The set is that task. There is nothing to claim.

Completion: the work set is an ordered list of groups, or one prose task. **Retries** are outside the set.

### 3. Confirm a survey

When step 2 surveyed the queue, stop. Show the proposed groups, the beside-the-list notes, and the **Retries** section from step 1 in one message. The user may drop tickets, add retries, and reorder groups. Wait for a confirmation.

When the user passed the set, show **Retries** in the opening message and continue with the set they passed.

When the survey finds no proposed ticket and step 1 found retries, stop on that **Retries** list. When both are empty, say so and stop.

Completion: the user has confirmed a surveyed set, or they passed the set, or the run has stopped because there is nothing they asked to build.

### 4. Claim

Claim each issue in the confirmed set, in order. Re-read the issue immediately before the claim. Skip an issue that already has `claimed-by-agent`, and report the skip. A retry removes `agent-failed` as part of the claim. The claim is that issue's first write.

Completion: every issue in the set is claimed by this run or reported as already claimed. No branch has been created yet.

### 5. Build

For each group, in order, start the next group only after the previous group has reported:

- Run one sub-agent that calls the Skill tool with `implement-spec`.
- Pass issue numbers and URLs. Pass the parent spec and the group's tickets, or the single ticket when the group has no parent. That ticket's body is the spec.
- When a failure comment on the group names a branch, pass that branch and tell the sub-agent to continue it.
- Tell the sub-agent this run owns labels, so the sub-agent leaves `claimed-by-agent` in place.
- Wait for its report: the branch, the tip commit, which tickets closed, deferred Slop, and Standards judgement calls left unfixed.

When the report says the tickets closed, remove `claimed-by-agent` from those issues before the next group starts.

A prose task is one sub-agent that calls the Skill tool with `implement`. It claims nothing.

Completion: every group has a report, or a group has failed and step 6 has released this run's still-open claims.

### 6. Release

When a group fails, or the run stops, release every still-open issue this run claimed.

- A group that was building takes the failure operation. The comment carries the reason, the branch, and the commits. A later retry continues that branch.
- A group that had not started is restored to `ready-for-agent` with `claimed-by-agent` removed. Leave `agent-failed` off. The comment says the run stopped before the group started.

Completion: every issue this run claimed is closed, or it is open without `claimed-by-agent`.

### 7. Brief

Report:

- **Landed:** each closed issue, its branch, and its tip commit.
- **Skipped:** already claimed, dropped by the user, blocked, specs, and groups released before they started.
- **Still open:** failures, unmet acceptance criteria, deferred Slop, and Standards judgement calls the fixer left. For each, one next step.
- **Retries:** the open `agent-failed` issues from step 1, plus any this run just failed.

Completion: the user can see what landed, what remains, and every open `agent-failed` ticket.
