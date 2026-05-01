# Streaming Session Log — Plan

**Status:** Draft, awaiting review
**Date:** 2026-05-01
**Scope:** `/feature-core` only. `/kickoff`, `/architect`, `/requirements`, etc. retain the existing end-of-skill flow described in `.claude/skills/shared/session-log.md` — unchanged by this work.

## Goal

Stream session-log entries during `/feature-core` — one entry per subagent start/stop, each with a cost/token snapshot — instead of writing the entire log at `/feature-end`. Hook-driven so the model cannot forget. The log file is created at session-tag time and appended to throughout the feature lifecycle; `/feature-end` adds the retrospective sections to the same file.

## Components

### 1. Registry: `monitoring/textfile_collector/active_sessions.json`

Lives in main repo (uses `git rev-parse --git-common-dir`, shared across worktrees). Map keyed by `session_id`:

```json
{
  "<session-uuid>": {
    "feature_id": "FCS-55",
    "session_log_path": "<absolute path into the worktree>"
  }
}
```

Atomic read-modify-write — multiple teammates may update concurrently in `/feature-team` mode.

### 2. `scripts/tag-session.py` — extended

When called by `/feature` (or `/feature-team` teammate spawn):

- Compute log filename `YYYY-MM-DD-session-N-<slug>.md` using **worktree root** (`git rev-parse --show-toplevel`), so the log lives with the branch's commits.
- Slug derived from issue title via `gh issue view`.
- Create the empty log file with a header (feature_id, session_id, branch, date).
- Insert a row into `active_sessions.json` with the **absolute** session log path.

### 3. `scripts/log-step-cost.sh` — new

Args: `start` | `stop`. Reads stdin JSON payload (subagent name and `session_id` from the harness). Looks up the row in `active_sessions.json` by `session_id`.

- If no row → exit 0 silently. This is how non-feature-core sessions (kickoff, architect, etc.) are no-ops without any matcher logic.
- If row present → query Prometheus by `session_id` for cumulative cost / tokens (reuse `scripts/query-feature-cost.py` style). Append a one-line entry to the log:

```
- 14:23:11Z | start test-author | $0.42 | in 12.3k out 1.8k cache 45.2k
- 14:25:07Z | stop  test-author | $0.61 | Δ $0.19 in +3.1k out +0.4k
```

### 4. Hook wrapper: `.claude/hooks/log-step-cost.sh`

Thin shim — forwards stdin to `scripts/log-step-cost.sh`. Registered in `.claude/settings.json`:

```json
"SubagentStart": [{ "hooks": [{ "type": "command", "command": ".claude/hooks/log-step-cost.sh start", "timeout": 10 }] }],
"SubagentStop":  [{ "hooks": [{ "type": "command", "command": ".claude/hooks/log-step-cost.sh stop",  "timeout": 10 }] }]
```

Project scope.

### 5. `feature-core/SKILL.md` — minimal change

After PR creation, one inline bash call appends a final cost-snapshot line to the streaming log. **No per-step prose** added to the skill body; the hook handles cadence.

### 6. `feature-end/SKILL.md` — Step 2 change

- Read `session_log_path` from `active_sessions.json` for the current `session_id`.
- Append the retrospective sections (Summary, Decisions, Cost retrospective, Next steps) to the **existing** log instead of creating a new file.
- Delete the registry row after merge cleanup.
- Fall back to current "create new" logic if the row is absent (covers pre-streaming sessions and crash recovery).

## Worktree safety

The hook never reads `cwd`. Known bug (see `docs/sessions/2026-04-17-team-234-235-236-237-238-artefact-quality.md`): hook `event.cwd` reports the **main repo**, not the worktree, in `/feature-team` mode. Workarounds based on Write/Edit transcript paths (as in `pre-compact-session-log.py`) are complex and fragile.

This design sidesteps the bug entirely:

- Path resolution happens **once**, at `tag-session.py` invocation, when CWD is correct (the worktree).
- The absolute path is stored in the registry.
- The hook only does: read `session_id` from stdin → look up absolute path → append. No path resolution at hook time.
- The registry is keyed per-row by `session_id`, so parallel teammates do not clobber each other.

## Out of scope

- No changes to `shared/session-log.md` flow (kickoff/architect/requirements unaffected).
- No changes to existing Prometheus query logic — reused as-is.
- No retroactive backfill of old session logs.
- No changes to `feature-team` lead session (lead does not stream a log; only teammates do).

## Open questions

None outstanding — pending review of this plan.

## Implementation order

1. Extend `tag-session.py` (file creation + registry write).
2. Add `scripts/log-step-cost.sh` and `.claude/hooks/log-step-cost.sh` (hook no-ops if registry row absent).
3. Wire hooks into `.claude/settings.json`.
4. Update `feature-core/SKILL.md` with the closing cost snapshot.
5. Update `feature-end/SKILL.md` Step 2 to append rather than create, and to delete the registry row.
6. Manual test: one `/feature` run end-to-end; one `/feature-team` run with ≥2 teammates to verify worktree isolation.
