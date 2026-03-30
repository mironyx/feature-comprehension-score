---
name: feature-team
description: Parallel feature implementation using Claude Code agent teams. Lead defines tasks; each teammate autonomously implements one issue in its own git worktree. Requires Claude Code CLI.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, Skill, TodoWrite
---

# Feature Team — Parallel Implementation via Agent Teams

Implements multiple features in parallel. The lead defines high-level tasks and coordinates;
each teammate is a fully autonomous Claude Code session responsible for its own git isolation,
TDD implementation, and PR creation.

**Requires:** Claude Code CLI with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` enabled.
Not supported in VS Code.

**Usage:**
- `/feature-team 101 102 103` — implement three specific issues in parallel
- `/feature-team -n 3` — implement the top 3 Todo items from the project board

For a single issue, use `/feature` instead.

## Lead Process

Execute these steps sequentially without pausing for confirmation.

### Step 1: Parse arguments and collect issues

If `-n N` is given:
```bash
gh project item-list 1 --owner leonids2005 --format json \
  | python3 -c "
import json, sys
items = json.load(sys.stdin)['items']
todo = [i for i in items if i.get('status') == 'Todo']
for i in todo[:N]:
    print(i['content']['number'])
"
```

If explicit issue numbers are given: use them directly.

For each issue number, read the title and design reference:
```bash
gh issue view <N> --json title,body
```

### Step 2: Validate each issue

For each issue confirm:
- Design reference present (LLD section, design doc, or ADR path in the issue body)
- Acceptance criteria defined

If any issue fails: report which one and stop. Do not proceed with a partial set.

### Step 3: Create shared task list

Create one task per issue:
- Title: `Implement issue #<N> — <title>`
- State: pending

### Step 4: Spawn teammates

Spawn one teammate per issue in a **single parallel operation**.

Each teammate receives this self-contained prompt (fill in the placeholders):

> You are implementing issue #N: TITLE
>
> Design reference: PATH (extracted from issue body)
>
> Steps:
> 1. Tag your session: `bash .claude/hooks/run-python.sh scripts/tag-session.py <N>`
> 2. Create your own branch and worktree:
>    ```bash
>    SLUG=<slug-from-title>
>    git fetch origin main
>    git worktree add ../fcs-feat-<N>-$SLUG -b feat/$SLUG origin/main
>    cd ../fcs-feat-<N>-$SLUG
>    ```
> 3. Move issue to In Progress:
>    ```bash
>    bash scripts/gh-project-status.sh <N> "in progress"
>    ```
> 4. Read the design reference and all related files.
> 5. Implement with strict TDD (Red-Green-Refactor, one test at a time).
> 6. Run full verification: `npx vitest run`, `npx tsc --noEmit`, `npm run lint`,
>    `npx markdownlint-cli2 "**/*.md" 2>&1 | tail -5`
> 7. Run `/diag` on all changed files. Fix all findings before proceeding.
> 8. Commit: `git add <files> && git commit -m "feat: <description> #<N>"`
> 9. Push and create PR targeting `main`.
> 10. Run `/pr-review-v2 <pr-number>` and fix any blockers.
> 11. Report back with the PR URL.
>
> Follow all coding principles in CLAUDE.md. Do not ask for confirmation between steps.

### Step 5: Monitor

Teammates notify the lead automatically when idle (PR created or blocked).

If a teammate reports a blocker: relay it to the user without interrupting other teammates.
Do not shut down the team on a single failure.

### Step 6: Report

When all teammates are idle, summarise:
- Each issue → branch → PR URL
- Any blockers or deferred findings per teammate
- Reminder: "Run `/feature-end` on each branch after human PR review."

**Stop here.** Do not move board items to Done — `/feature-end` handles that after merge.

## Blocker policy

**Pause and relay to user** if:
- Any issue fails validation (missing design or acceptance criteria)
- A teammate is stuck after 3 attempts on the same error

**Do not pause for:**
- Individual teammate lint/type errors (teammate fixes them)
- PR size slightly over 200 lines (teammate warns in PR, continues)
- One teammate blocked while others are progressing
