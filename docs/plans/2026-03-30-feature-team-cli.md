# `/feature-team` — Parallel Feature Implementation via Claude Code Agent Teams

## Overview

Adds a parallel feature development mode using Claude Code's native agent teams capability.
The lead defines high-level tasks; each teammate is a fully autonomous Claude Code process
that handles its own git isolation and implements one feature end-to-end.

This replaces the unimplemented Phases 5–6 of the now-closed issue #66.
Phases 1–4 of #66 (base branch fix, OTLP push, monitoring stack, Prometheus query) are complete
and remain in place.

## Guiding principle

**Lead defines WHAT. Teammates decide HOW.**

The lead's job is task definition and coordination — not micromanaging git operations.
Each teammate is a fully autonomous session: it creates its own branch and worktree,
follows the project workflow (CLAUDE.md + skills), and creates a PR independently.

Start with the simplest version that proves the concept. Shared non-interactive agents
and further abstraction can be introduced once real usage reveals where duplication
actually hurts.

## Current State

- `/feature` runs one issue at a time, sequentially, in the main repo checkout — **unchanged by this work**
- `settings.json` has OTLP push configured; monitoring stack is running
- tmux 3.4 is installed on WSL
- CLAUDE.md already has a stub: "A parallel `/feature` mode using worktrees is planned for Claude CLI agent teams"
- Agent teams require `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` (disabled by default)

## Desired End State

- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` enabled in project `settings.json`
- `teammateMode: "tmux"` set in `~/.claude.json` for split-pane visibility in WSL
- `/feature-team 101 102 103` creates a task per issue, spawns three teammates in parallel tmux panes
- Each teammate autonomously creates its own branch + worktree, implements, and creates a PR
- Each teammate's OTel metrics are emitted from its own process; `tag-session.py` registers the correct `feature.id`
- `/feature` and `/feature-end` are **not modified**
- CLAUDE.md updated to document both modes
- Phase 2 (auto-merge) documented but not implemented

## Out of Scope (Phase 1)

- Any changes to `/feature` or `/feature-end`
- Shared non-interactive sub-agents (introduce only when real duplication is observed)
- Auto-merge of trivial PRs (Phase 2 — see below)
- Automatic `/feature-end` per teammate
- Board auto-polling to pick up new Todo items mid-run
- Nested teams or teammate-spawned sub-teams (not supported by the platform)

## Architecture — Two Modes

| | Sequential | Parallel CLI |
|---|---|---|
| Trigger | `/feature` | `/feature-team` |
| Session | One Claude Code instance | Lead + N teammates |
| Git isolation | Main repo, feature branch | Each teammate creates its own worktree |
| OTel | `tag-session.py` per run | Same — each teammate is a separate process |
| Worktrees | Forbidden | Each teammate responsible for its own |
| Visibility | Windsurf live edits | tmux split panes |
| PR | Single, manual approval | N PRs, manual approval per branch |
| Post-PR | `/feature-end` on the branch | `/feature-end` on each branch |

### Why agent teams over subagents

Subagents (`Agent` tool) run inside the same OS process — they share one OTel metric stream
and `feature.id` cannot be distinguished per subagent in Grafana. Agent teammates are
separate OS processes: each has its own metric stream and its own `tag-session.py` call.

## Phase 1: What to Build

### 1.1 Enable agent teams — `settings.json`

Add to the `env` block:

```json
"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
```

### 1.2 Set tmux display mode — `~/.claude.json`

Add at top level:

```json
"teammateMode": "tmux"
```

Split panes open automatically when `/feature-team` spawns teammates.
Fallback: in-process mode (Shift+Down to cycle) if tmux is unavailable.

### 1.3 New skill — `.claude/skills/feature-team/SKILL.md`

**Usage:**
- `/feature-team 101 102 103` — three specific issues in parallel
- `/feature-team -n 3` — top 3 Todo items from the project board

**Lead steps:**

1. **Parse arguments.** If `-n N`: query board for top N Todo items and collect issue numbers.
   If explicit numbers: use them directly. Minimum 2 issues — for a single issue, use `/feature`.

2. **Validate issues.** For each issue, confirm it has a design reference and acceptance criteria.
   Stop and report any issue that fails — do not proceed with a partial set.

3. **Create shared task list.** One task per issue:
   - Title: `Implement issue #N — TITLE`
   - State: pending

4. **Spawn teammates.** One per issue, with a minimal self-contained prompt:
   > "You are implementing issue #N: TITLE.
   > Design reference: PATH (from issue body).
   > Set up your own git isolation (branch + worktree), then implement following the
   > project's TDD workflow. Tag your session with `tag-session.py <N>`.
   > Create a PR targeting `main` when done and report back with the PR URL."

   Spawn all teammates in a single parallel operation.

5. **Monitor.** Teammates notify the lead automatically when idle (PR created or blocked).
   If a teammate reports a blocker, relay it to the user without interrupting others.

6. **Report.** When all teammates are idle:
   - List: issue → branch → PR URL
   - Note any blockers or deferred findings
   - Remind: "Run `/feature-end` on each branch after human PR review."

**Blocker policy:**
- Single teammate blocked after 3 attempts → relay to user, let others continue
- Do not shut down the team on a single failure

### 1.4 Update `CLAUDE.md`

Replace the two-line worktree stub (current lines 79–80) with:

```
- **Sequential mode:** work directly in the main repo directory — no worktrees. This is the
  default for `/feature`, `/feature-end`, and all sub-agents they spawn.
- **Parallel CLI mode (`/feature-team`):** each teammate manages its own git isolation
  (branch + worktree). Teammates are separate Claude Code processes running via agent teams.
  Requires Claude Code CLI; not supported in VS Code.
```

Add to **Custom Skills**:

```
- `/feature-team` — Parallel implementation using Claude Code agent teams. Each teammate
  autonomously implements one issue in its own worktree. Requires CLI.
  Usage: `/feature-team 101 102 103` or `/feature-team -n 3`.
```

## Phase 2 — Auto-merge (Future, Not in Scope)

Documented here for continuity.

### Trigger

After a teammate creates a PR, evaluate whether it qualifies for automatic merge.

### Trivial PR criteria (all must pass)

| Check | Threshold |
|---|---|
| CI status | All checks green |
| Diff size | < 100 lines changed |
| Schema migrations | None (`supabase/migrations/` unchanged) |
| Review findings | Zero blockers from `/pr-review-v2` |

### Auto-merge flow

If all criteria pass: lead runs `/feature-end` autonomously (merge, close issue, update board).
If any criterion fails: falls back to manual approval — human reviews and runs `/feature-end`.

### Hook option

A `TeammateIdle` hook (`.claude/hooks/teammate-idle-check.sh`) could implement the criteria
check and surface the decision to the lead automatically.

## Known Limitations

| Limitation | Impact | Mitigation |
|---|---|---|
| Agent teams are experimental | Instability, no session resumption | Worktrees persist if session crashes — continue each branch manually with `/feature` |
| Teammate git setup is autonomous | May vary in approach (worktree path, naming) | CLAUDE.md guidance + spawn prompt constrain the approach |
| `OTEL_RESOURCE_ATTRIBUTES` shared at process level | Teammates may share resource attributes | `tag-session.py` per teammate is the authoritative per-feature label |
| tmux required for split panes | — | tmux 3.4 already installed; fallback: in-process mode |

## Success Criteria

### Automated

- `grep "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" .claude/settings.json` — match found
- `python3 -c "import json; print(json.load(open('/home/lgsok/.claude.json'))['teammateMode'])"` — prints `tmux`
- `ls .claude/skills/feature-team/SKILL.md` — exists
- `grep -n "worktree" .claude/skills/feature/SKILL.md` — no matches (unchanged)

### Manual

- `/feature-team 101 102` opens two tmux panes; each creates its own branch, implements, creates PR
- Both PRs target `main` without conflicts
- Prometheus shows two distinct `feature_id` values after both runs complete
- `/feature 123` (single) is unaffected

## References

- [Agent teams docs](<https://code.claude.com/docs/en/agent-teams>)
- [feature SKILL.md](.claude/skills/feature/SKILL.md) — not modified
- [settings.json](.claude/settings.json)
- [Closed issue #66](https://github.com/leonids2005/feature-comprehension-score/issues/66) — predecessor
