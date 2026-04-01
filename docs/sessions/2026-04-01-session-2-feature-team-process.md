# Session Log: Feature Team Process Observations

**Date:** 2026-04-01
**Session:** 2
**Type:** Process — `/feature-team` retrospective
**Issues:** #133, #140

---

## What was done

Ran `/feature-team 133 140`. Teammate-133 implemented and merged the `link_participant`
auth fix (PR #155). Issue #140 was re-scoped mid-session after design review revealed
the original spec lacked persistence; design artefacts (ADR-0017, LLD) were produced
instead.

---

## Process observations

### 1. Lead spawn fumble — wrong tool order

**What happened:** The lead first attempted to spawn teammates using the `Agent` tool
with a "Create a team with N teammates" prompt (expecting the agent teams system to
handle it). This failed silently, returning the prompt text rather than spawning. A
second attempt hit "already leading team — use TeamDelete" because `TeamCreate` had
already been called in an earlier session for the same team name.

**Root cause:** The lead did not know the correct two-step pattern:
1. `TeamCreate` — creates the team record
2. `Agent` with `team_name` + `name` params — spawns each teammate into that team

**Fix for skill:** The `/feature-team` skill prompt should explicitly state:
> Use `TeamCreate` first, then spawn each teammate with `Agent(team_name=..., name=...)`.
> Do NOT pass "Create a team with N teammates" to the Agent tool — that syntax is not
> supported.

Also add a check: if `TeamCreate` returns "already leading team", read
`~/.claude/teams/<name>/config.json` to confirm member count before deciding whether to
delete and recreate or reuse.

---

### 2. GitHub GraphQL deprecated method warnings

**What happened:** Deprecation warnings were observed during the session on `gh project`
calls.

**Investigation:** Running `gh project item-add` and `gh project item-edit` directly
produced no deprecation warnings. The `find_item_id` function in
`scripts/gh-project-status.sh` uses `gh api graphql` with the Projects v2 API
(`projectItems` on an issue node) — this is the current, non-deprecated approach.

**Status:** False alarm — no action needed.

---

### 3. OTel / session tagging not writing to correct path (WSL2)

**What happened:** The `scripts/tag-session.py` script auto-detects the active Claude
Code JSONL session file by scanning `/proc`. In WSL2, the Windows-side folder paths
are not accessible from the Linux process tree in the same way, causing the script to
either find the wrong file or write to an unexpected location.

**User question:** Should we use an env variable instead of auto-detection?

**Suggestion:** Yes. Add an optional `CLAUDE_SESSION_JSONL` env var that, when set,
bypasses the `/proc` scan entirely:

```python
jsonl_path = os.environ.get('CLAUDE_SESSION_JSONL') or detect_from_proc()
```

The lead could set this before spawning (or inject it into each teammate's env at spawn
time via the prompt). This is more reliable than proc scanning in WSL2 and removes the
Windows path ambiguity entirely.

**Alternative:** The lead passes the JSONL path as an explicit argument to
`tag-session.py` rather than relying on env. Either approach works — env var is less
error-prone for teammates since they receive a prompt string, not a shell environment.

**Status:** Open — needs a small fix to `scripts/tag-session.py` and the `/feature-team`
spawn prompt template.

---

### 4. Lead reported task in-progress while teammate still working

**What happened:** The lead marked tasks as `in_progress` and assigned them to teammates
immediately after spawning — before the teammates had actually started work. This is
cosmetically premature but functionally harmless: the task status was correct by the
time the teammates reported back.

**Assessment:** Not a problem. Task status in the lead pane is a UI convenience, not
a contract. No change needed.

---

## Next steps

- [x] Update `/feature-team` skill: document correct `TeamCreate` + `Agent` spawn pattern
- [x] Investigate deprecated GitHub GraphQL calls — false alarm, no change needed
- [x] Fix `scripts/tag-session.py` to accept `CLAUDE_SESSION_JSONL` env var override
- [ ] Implement #140 (design artefacts ready): `/feature 140`
