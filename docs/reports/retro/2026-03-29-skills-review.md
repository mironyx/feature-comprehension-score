# Skills & Configuration Review

**Date:** 2026-03-29
**Scope:** All 13 custom skills, 2 hooks, CLAUDE.md, settings.json, settings.local.json
**Reviewer:** Claude (via Claude.ai session)

## Summary

| Severity | Count |
|----------|-------|
| Critical | 4 |
| High     | 7 |
| Medium   | 5 |
| Low      | 5 |

**Overall assessment:** The skill suite is comprehensive and well-structured, but has accumulated
contradictions between CLAUDE.md and skill files, environment-specific failures (Windows vs WSL),
significant duplication across review skills, and stale references from the Windsurf → VS Code
migration. The cost-adaptive `/pr-review-v2` is a clear improvement over v1, but v1 still exists
and is invocable.

---

## Critical (fix now — causes incorrect behaviour)

### 1. CLAUDE.md ↔ `/feature` worktree contradiction

**Files:** `CLAUDE.md`, `.claude/skills/feature/skill.md`, `.claude/skills/feature-cont/skill.md`

CLAUDE.md explicitly states:

> "Do not use `git worktree add` or the `isolation: "worktree"` agent option"

Yet `/feature` Step 2 creates a worktree at `../fcs-feat-<issue>-<slug>` and all subsequent steps
operate inside it. `/feature-cont` Step 2 also looks for and recreates worktrees.

**Impact:** Agents reading CLAUDE.md first will either refuse to create worktrees or produce
conflicting behaviour. Sub-agents that read CLAUDE.md (as instructed by the project constraints
block) will see the prohibition and may refuse to operate in the worktree path.

**Resolution:** Decide which is correct and align both. If worktrees are the intended pattern,
remove the CLAUDE.md prohibition and add a note explaining why worktrees are used. If they are not,
rewrite `/feature` to work in the main repo directory.

### 2. `/feature-cont` Step 7: dead `/review` reference

**File:** `.claude/skills/feature-cont/skill.md`

Step 7 says "Run `/review` on the current changes." There is no `/review` skill — this should be
`/pr-review-v2`.

**Impact:** The agent will either fail to find the skill, hallucinate a review process, or skip
the step entirely.

**Resolution:** Change `/review` to `/pr-review-v2` in Step 7.

### 3. `py` vs `python3` — cross-platform failure

**Files:** `.claude/skills/feature/skill.md` (Steps 1, 8), `.claude/skills/feature-cont/skill.md`
(Step 1), `.claude/skills/feature-end/skill.md` (Step 2.5), `.claude/settings.json` (PreCompact hook)

All `py scripts/...` calls fail silently in WSL, where the launcher is `python3`. The
`open-in-windsurf.sh` hook correctly uses `python3`, making the project internally inconsistent.

**Impact:** Session tagging, cost queries, and pre-compact hooks fail silently in WSL, producing
incomplete telemetry and missing session logs.

**Resolution:** Create `.claude/hooks/run-python.sh` that picks `py`, `python3`, or `python` based
on availability. Update all skill files and `settings.json` to use this wrapper.

### 4. "Windsurf" references remain in 3 skills and 1 hook

**Files:** `.claude/skills/diag/skill.md`, `.claude/skills/feature/skill.md` (Steps 4, 6),
`.claude/hooks/open-in-windsurf.sh`

The `/diag` description says "Check Windsurf extension diagnostics." The `/feature` skill has
unconditional `windsurf --reuse-window` calls. The hook is named `open-in-windsurf.sh`.

**Impact:** `/diag` is skipped when Claude determines it is not running in Windsurf. Editor-open
calls fail in VS Code and WSL environments.

**Resolution:**
- `/diag` description: "Check VS Code diagnostics-exporter output for changed files."
- All `windsurf --reuse-window` calls: wrap in `if command -v windsurf &>/dev/null; then ... fi`
- Rename hook: `open-in-windsurf.sh` → `open-in-editor.sh`

---

## High (fix soon — cost or reliability impact)

### 5. Anti-pattern checklist duplicated 4 times

**Files:** `.claude/skills/pr-review/skill.md` (Agent A), `.claude/skills/pr-review-v2/skill.md`
(Agent Q, Agent A)

The Supabase / Next.js / secrets / TypeScript anti-pattern list (~50 lines) is copied identically
into four agent prompts. Any update requires editing all four copies.

**Resolution:** Extract to `.claude/skills/shared/anti-patterns.md`. Agent prompts reference it
with "Read `.claude/skills/shared/anti-patterns.md` and apply all checks to the diff."

### 6. ci-probe agent in `/feature` Step 8b is wasteful

**File:** `.claude/skills/feature/skill.md`

Step 8b spawns a full agent just to run `gh run watch` and report back. This is a pure bash
operation that does not need agent context.

**Resolution:** Replace with inline background bash:

```bash
(cd "$WDIR" && gh run list --branch feat/<branch> --limit 1 \
  --json databaseId -q '.[0].databaseId' | xargs gh run watch) &
```

### 7. `/pr-review` v1 still exists alongside v2

**Files:** `.claude/skills/pr-review/skill.md`, `CLAUDE.md`

v1 is still present and invocable. CLAUDE.md lists it with the incorrect description "Two parallel
agents" (it launches three). `/feature` Step 9 calls v2, but nothing prevents conversational
sessions from invoking v1.

**Resolution:** Either delete v1 or rename to `pr-review-v1-deprecated`. Update CLAUDE.md Custom
Skills section to reflect v2 as the canonical review skill.

### 8. `/simplify` prohibition not in CLAUDE.md

**File:** `CLAUDE.md`

The prohibition is only in `/feature`'s blocker policy. It does not apply when Claude works
conversationally or when sub-agents decide independently that code looks complex.

**Resolution:** Add to CLAUDE.md "How to Work" section:

```markdown
- **Never invoke `/simplify`.** It is too costly for routine work and is redundant with
  `/pr-review-v2`. If code needs simplification, fix it inline during TDD refactor or
  `/diag` resolution. Only use `/simplify` if the user explicitly types it.
```

### 9. `/diag` tool contradiction

**File:** `.claude/skills/diag/skill.md`

The skill has `disable-model-invocation: true` and `allowed-tools: Read, Glob, Bash` — no Write
or Edit tools. Yet the instructions say "fix every one of them before proceeding."

**Impact:** The agent cannot fix findings with the tools available to it.

**Resolution:** Either add `Write, Edit, MultiEdit` to `allowed-tools` (and remove
`disable-model-invocation`) or change the instruction to "report all findings" rather than
"fix them."

### 10. `/feature-cont` step ordering inconsistent with `/feature`

**File:** `.claude/skills/feature-cont/skill.md`

`/feature` runs diagnostics (Step 6) then review (Step 9). `/feature-cont` runs review (Step 7)
then diagnostics (Step 8). This means diagnostics findings from `/feature-cont` are not checked
by the review.

**Resolution:** Swap Steps 7 and 8 in `/feature-cont` to match `/feature`'s ordering:
diagnostics first, then review.

### 11. Session log naming collisions between parallel agents

**Files:** `.claude/skills/feature/skill.md` (Step 10 / session log), `.claude/skills/feature-end/skill.md`
(Step 2), `.claude/skills/feature-cont/skill.md` (Step 4), `CLAUDE.md` (Session Guidance)

Session logs use the naming convention `YYYY-MM-DD-session-N.md`, where N is incremented from the
latest log for that day. When multiple agents run in parallel (e.g., two `/feature` sessions on
different issues, or `/feature-end` running while a `/feature-cont` is active), they independently
compute the next N and collide on the same filename. In at least one observed incident, an agent
automatically deleted a session file while resolving the resulting git merge conflict.

**Impact:** Session logs are lost — the institutional memory of what was done, decisions made,
and cost retrospectives is destroyed. This is particularly damaging because session logs feed
into `/retro` and `/lld-sync`, so downstream skills also lose input.

**Resolution:** Include an agent/session identifier in the filename to guarantee uniqueness.
Proposed format:

```
YYYY-MM-DD-session-N-<issue-number>.md
```

For example: `2026-03-29-session-1-52.md`, `2026-03-29-session-1-57.md`.

This ties each log to the feature it covers (which is already the primary axis of interest) and
eliminates collisions even when multiple features are worked in parallel on the same day. The
issue number is always known at session-log-write time (it is the first thing `/feature` resolves).

Update the following:
- `CLAUDE.md` Session Guidance: change the naming convention.
- `/feature` skill: update session log filename in any references.
- `/feature-end` Step 2: update filename derivation.
- `/feature-cont` Step 4: update filename derivation.
- `/retro` skill: update the glob pattern used to discover session logs (currently reads all
  `docs/sessions/*.md` — no change needed if the pattern stays `*.md`, but the skill should
  be aware of the new naming scheme when attributing logs to features).

**Alternative:** Use a short random suffix (e.g., `session-1-a3f2.md`) if issue numbers are not
always available (e.g., for non-feature session logs like retro or drift-scan sessions). A hybrid
approach — issue number when available, random suffix otherwise — covers all cases.

---

## Medium (improve quality and maintainability)

### 12. `settings.local.json` has overly specific allow patterns

**File:** `.claude/settings.local.json`

Contains reactive, session-specific patterns like:

- `Bash(cat src/app/api/assessments/[id]/answers/service.ts)`
- `Bash(grep "resetModules\\\\|beforeEach\\\\|import\\(" tests/...)`
- `Bash(grep """zod""" package.json)`

These look like they were added to unblock a single session's permission denial.

**Resolution:** Replace with broader patterns:

```json
"Bash(cat src/**)",
"Bash(grep * tests/**)",
"Bash(node -e *)"
```

### 13. CLAUDE.md Custom Skills section is stale

**File:** `CLAUDE.md`

- `/pr-review` described as "Two parallel agents" — it is three.
- `/pr-review-v2` not mentioned at all.
- No indication of which review skill is canonical.

**Resolution:** Update the section to list `/pr-review-v2` as the primary review skill and either
remove v1's entry or mark it deprecated.

### 14. Cost calculation duplicated and fragile

**Files:** `.claude/skills/pr-review/skill.md` (Step 5), `.claude/skills/pr-review-v2/skill.md`
(Step 5)

Both skills contain identical inline Python that reads Claude Code's internal `.jsonl` files to
find the session title. This is tightly coupled to Claude Code's internal file format and
duplicated across both skills.

**Resolution:** Extract to `scripts/get-session-id.sh` (or `.py`). Both skills call the shared
script.

### 15. `/lld` has `Agent` in allowed-tools but never spawns agents

**File:** `.claude/skills/lld/skill.md`

The skill never uses the Agent tool. Having it in the allowed list means Claude Code may offer
to spawn agents if it encounters difficulty, adding unnecessary cost.

**Resolution:** Remove `Agent` from `allowed-tools`.

### 16. `/lld-sync` uses unformatted `gh issue view`

**File:** `.claude/skills/lld-sync/skill.md`

Step 1 calls `gh issue view <number>` without `--json` format. Output format varies between
Windows and WSL terminals, potentially causing parsing issues.

**Resolution:** Use `gh issue view <number> --json title,body,labels` and parse the JSON output.

---

## Low (nice to have)

### 17. Debug logging still in `check-diagnostics.sh`

**File:** `.claude/hooks/check-diagnostics.sh`

The `log()` function and `.claude/hooks/hook.log` file are annotated "Remove this function and all
log() calls once the pipeline is validated."

**Resolution:** If the diagnostics pipeline is stable, remove the debug logging.

### 18. `/create-mermaid-diagram` lacks context-gathering step

**File:** `.claude/skills/create-mermaid-diagram/skill.md`

The skill is a template library with no instruction to read project artefacts first.

**Resolution:** Add a Step 0: "Read relevant design docs, ADRs, and source files to understand
what is being diagrammed" — similar to `/lld`'s Step 0.

### 19. `/retro` health scorecard has no defined thresholds

**File:** `.claude/skills/retro/skill.md`

The Red/Amber/Green ratings are subjective. Different sessions could rate the same situation
differently.

**Resolution:** Add threshold definitions, e.g.:
- **Green:** All issues labelled and prioritised; no stale items > 2 weeks.
- **Amber:** Some labelling gaps; 1-2 stale items.
- **Red:** Majority unlabelled; stale items blocking downstream work.

### 20. `/create-plan` does not check the project board

**File:** `.claude/skills/create-plan/skill.md`

The skill does not check the project board for existing related issues before creating a plan,
which could lead to duplicate or conflicting work.

**Resolution:** Add to Step 1: "Check `gh issue list` and the project board for existing issues
related to this plan's scope."

### 21. `/feature-end` error swallowing in Steps 5+6

**File:** `.claude/skills/feature-end/skill.md`

The chained cleanup command uses `2>&1; true` to swallow errors silently. This contradicts the
project's own "no silent catch" review principle enforced in code reviews.

**Resolution:** Replace `2>&1; true` with logging: capture output and report any unexpected errors
in the Step 7 summary, even if they are non-fatal.

---

## Previously identified (from 2026-03-29 session, not yet applied)

The following items were diagnosed in a prior conversation and overlap with findings above:

- Merge Agent A + Agent C in `/pr-review` v1 into one agent (superseded by recommendation #7
  to deprecate v1 entirely)
- Add project constraints block to sub-agent prompts in `/feature` and `/pr-review`
- Add `pre-compact.sh` wrapper for `py` vs `python3` (covered by #3 above)

---

## Recommended execution order

1. **#1** — Resolve worktree contradiction (blocks all `/feature` runs)
2. **#2** — Fix dead `/review` reference (one-line change)
3. **#3** — Create cross-platform Python wrapper
4. **#4** — Rename Windsurf references
5. **#11** — Fix session log naming to prevent parallel-agent collisions (data loss risk)
6. **#8** — Move `/simplify` prohibition to CLAUDE.md
7. **#9** — Fix `/diag` tool/instruction mismatch
8. **#10** — Fix `/feature-cont` step ordering
9. **#7** — Deprecate pr-review v1
10. **#5** — Extract anti-pattern checklist
11. **#6** — Replace ci-probe agent
12. Remaining medium and low items in any order
