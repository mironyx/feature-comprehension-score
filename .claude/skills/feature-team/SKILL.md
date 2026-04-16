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
- `/feature-team 101 102 103` — implement three specific task issues in parallel
- `/feature-team -n 3` — implement the top 3 Todo task items from the project board
- `/feature-team epic 45` — implement all tasks from epic #45 in parallel

For a single issue, use `/feature` instead. Epic issues (label `epic`) cannot be implemented directly — pass task issues or use `epic <N>` mode.

## Lead Process

Execute these steps sequentially without pausing for confirmation.

### Step 1: Parse arguments and collect issues

If `epic <N>` is given:
1. Read the epic issue: `gh issue view <N> --json title,body,labels`.
2. Verify it has the `epic` label. If not, stop: "Issue #N is not an epic."
3. Parse the task checklist from the body. Extract all unchecked task issue numbers.
4. If no unchecked tasks, stop: "Epic #N has no remaining tasks."
5. Check for an **Execution Order** section in the epic body. If present, parse the execution waves table and spawn teammates wave-by-wave (all tasks in Wave 1 first; when Wave 1 completes, spawn Wave 2, etc.). If no execution order section exists, spawn all tasks in parallel (legacy behaviour).

If `-n N` is given:
```bash
gh project item-list 2 --owner mironyx --format json \
  | python3 -c "
import json, sys
items = json.load(sys.stdin)['items']
todo = [i for i in items if i.get('status') == 'Todo']
for i in todo[:N]:
    print(i['content']['number'])
"
```

If explicit issue numbers are given: use them directly.

**Epic guard:** For all modes, check each collected issue for the `epic` label. If any issue is an epic, stop: "Issue #N is an epic, not a task. Use `/feature-team epic <N>` to implement its tasks."

For each issue number, read the title and design reference:
```bash
gh issue view <N> --json title,body,labels
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

**Pre-flight:** `TeamCreate` is a deferred tool — its schema is not loaded at session start.
Fetch it before proceeding or the call will fail with `InputValidationError`:
`ToolSearch(query="select:TeamCreate")`

**Two-step pattern — always follow this exact sequence:**

1. Call `TeamCreate` to create the team record:
   ```
   TeamCreate(team_name="feature-team-<issues>", description="...")
   ```
   If `TeamCreate` returns "already leading team", read
   `~/.claude/teams/<name>/config.json`. If `members` contains only the lead (no
   teammates), the team was created but teammates were never spawned — proceed directly
   to step 2. If teammates are already present, do not recreate.

2. Call `Agent` once per teammate, **all in the same message**, with `team_name` and
   `name` set:
   ```
   Agent(team_name="feature-team-<issues>", name="teammate-<N>", run_in_background=true, prompt="...")
   Agent(team_name="feature-team-<issues>", name="teammate-<M>", run_in_background=true, prompt="...")
   ```

Do **not** pass "Create a team with N teammates" as prose to the `Agent` tool — that
syntax is not supported and will be echoed back as text rather than spawning teammates.

**Pre-requisite:** Teammates inherit the lead's permission mode — there is no per-teammate
override at spawn time. For teammates to run fully autonomously without prompting, the lead
session **must** have been started with `--dangerously-skip-permissions`:

```bash
claude --dangerously-skip-permissions
```

If the lead was not started this way, teammates will prompt for every tool use and parallel
execution breaks down. Stop, restart the lead with the flag, and re-run `/feature-team`.

Each teammate receives this self-contained prompt (fill in the placeholders):

> You are implementing issue #N: TITLE
>
> Steps:
> 1. Create your own branch and worktree:
>    ```bash
>    SLUG=<slug-from-title>
>    git fetch origin main
>    git worktree add ../fcs-feat-<N>-$SLUG -b feat/$SLUG origin/main
>    cd ../fcs-feat-<N>-$SLUG
>    ```
> 1a. Symlink gitignored local files from the main repo so integration tests work:
>    ```bash
>    MAIN_REPO=$(git rev-parse --git-common-dir | python3 -c "import sys,os; print(os.path.dirname(sys.stdin.read().strip()))")
>    for f in .env.test.local; do
>      [ -f "$MAIN_REPO/$f" ] && ln -sf "$MAIN_REPO/$f" "$f"
>    done
>    ```
> 2. Tag your session (must run AFTER worktree is set up so /proc detects the correct JSONL):
>    ```bash
>    .claude/hooks/run-python.sh scripts/tag-session.py <N>
>    ```
> 3. Move issue to In Progress:
>    ```bash
>    bash scripts/gh-project-status.sh add <N> "in progress"
>    ```
> 4. Run `/feature-core <N>`. This covers everything from reading the design through PR
>    creation and review. Follow all coding principles in CLAUDE.md. Do not ask for
>    confirmation between steps.
> 5. Report back to the lead with the PR URL and wait — **do not exit**.
> 6. When the lead sends you a feature-end message, run `/feature-end <N>`.
>    **Follow every step in `/feature-end` without skipping — especially lld-sync (Step 1.5)
>    and session log (Step 2). These are mandatory.**

### Step 5: Monitor

Teammates notify the lead automatically when idle (PR created or blocked).

If a teammate reports a blocker: relay it to the user without interrupting other teammates.
Do not shut down the team on a single failure.

### Step 6: Report PRs and wait

When all teammates have reported their PR URLs, summarise:
- Each issue → branch → PR URL
- Any blockers or deferred findings per teammate

**Do NOT send shutdown_request yet.** Teammates stay alive in their panes, waiting for feature-end.

When the user runs `/feature-end <N>` in the lead pane, forward it to the relevant teammate
via SendMessage: "Please run `/feature-end <N>`."

### Step 7: Final summary

Wait for all teammates to send their "Feature-end complete for #N" messages.

When all are received, summarise:
- Each issue → PR merged → board/issue closed
- Any notes from individual feature-ends (rebases, review fixes, etc.)

**Only now** is the team fully done. Do not move board items — `/feature-end` handles that.

### Step 8: Write the team session log

Per-teammate `/feature-end` logs capture per-issue work, but they miss the **lead's view** —
orchestration decisions, cross-cutting changes, coordination events, and process observations
that span multiple teammates. Write a team session log to capture this *before* shutting
teammates down, while context is still fresh.

Path: `docs/sessions/YYYY-MM-DD-team-<issues>-<short-slug>.md` (e.g.
`2026-04-16-team-223-224-225-comprehension-depth.md`).

Required sections:

- **Issues shipped** — table of issue → story → PR → branch → merged-at.
- **Cross-cutting decisions** — anything that affected multiple teammates (e.g. mid-cycle
  scope changes, framing revisions, shared design choices). Per-issue logs cannot capture
  these — only the team log can.
- **Coordination events** — spawn pattern, blockers relayed, rebases, conflicts, CI flakes,
  protocol deviations, anything where lead intervention shaped the run.
- **What worked / what didn't** — short, candid. Decay fast otherwise.
- **Process notes for `/retro`** — explicit hand-off so that the next retrospective can pick
  up these observations without re-deriving them from git.

Keep it concise (one screen typically). The goal is to preserve orchestration context that
would otherwise have to be reconstructed from git, message logs, and PR threads.

### Step 9: Shutdown teammates

**Immediately after writing the team log**, send a shutdown_request to every teammate:
```
SendMessage(to="teammate-<N>", message={"type": "shutdown_request", "reason": "Feature-end complete."})
```
Send all shutdowns in a single message (parallel tool calls). Do not skip this step — teammates
left running consume resources and clutter the user's pane.

## Blocker policy

**Pause and relay to user** if:
- Any issue fails validation (missing design or acceptance criteria)
- A teammate is stuck after 3 attempts on the same error

**Do not pause for:**
- Individual teammate lint/type errors (teammate fixes them)
- PR size slightly over 200 lines (teammate warns in PR, continues)
- One teammate blocked while others are progressing
