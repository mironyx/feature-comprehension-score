# Session Log — 2026-03-30 Session 2: Pipeline Harness + /architect

## Work completed

### Phase 1: Foundation fixes (skills reliability)

All 7 sub-steps from the pipeline harness plan:

| Step | Change | Files |
|------|--------|-------|
| 1a | Cross-platform Python wrapper (`py`/`python3`/`python`) | Created `run-python.sh`, updated 5 skills + `settings.json` |
| 1b | Removed worktree code from `/feature` and `/feature-end` | Rewrote Step 2 (branch only), removed all `(cd "$WDIR" && ...)` wrappers |
| 1c | Editor-agnostic references | Created `open-in-editor.sh`, deleted `open-in-windsurf.sh`, updated `/diag` |
| 1d | Deprecated `/feature-cont` | Renamed to `.deprecated` |
| 1e | Fixed `/diag` tool contradiction | Removed `disable-model-invocation`, added Write/Edit/MultiEdit to allowed tools |
| 1f | CLAUDE.md updates | `/simplify` prohibition, `/pr-review-v2` canonical, session log naming, future parallel note |
| 1g | Deprecated `/pr-review` v1 | Renamed to `.deprecated`, fixed stale reference in `/feature` step 9 |

### Phase 2: Build `/architect` skill

- Created `.claude/skills/architect/SKILL.md`
- Added to CLAUDE.md Custom Skills section
- Test run on MVP Phase 2 plan — produced:
  - ADR-0016 (structured logging with Pino) for #135
  - Design doc update (`v1-design.md` v0.9) for #134 — corrected Naur world-to-program definition, added org context and depth constraint
  - LLD `docs/design/lld-phase-2-demo-ready.md` for #130, #131, #132, #118, #138
  - Enriched 5 GitHub issue bodies with BDD specs (#130, #131, #132, #139, #140)
- Post-test refinements to `/architect` skill:
  - Added "check existing state" step (issues, design docs) before creating anything
  - Added source-of-truth rule: design detail must live in repo docs, not only in issue bodies
  - Updated decision logic table to distinguish items with/without existing LLD coverage

### Phase 3: Extract shared artefacts

- Extracted anti-pattern checklist to `.claude/skills/shared/anti-patterns.md`
- Replaced inline copies in `/pr-review-v2` Agent Q and Agent A with references
- Extracted session ID script to `scripts/get-session-id.py`
- Replaced inline Python in `/pr-review-v2` Step 5 with script call

### Other changes

- `docs/plans/2026-03-29-mvp-phase2-plan.md` — added P1.5 section (items #139, #140) and `v1-prompt-changes.md` reference
- `docs/requirements/v1-prompt-changes.md` — new spec for question depth constraint and organisation context

## Decisions made

1. **Repo docs are source of truth** — GitHub issue bodies reference repo docs, not the other way round. Every item `/feature` implements must have design detail traceable to `docs/`.
2. **`/architect` is a skill, not an agent** — it needs user interaction (Step 2 confirmation), so it runs in the main conversation context.
3. **Anti-pattern checklist is shared** — single file in `.claude/skills/shared/`, referenced by all review agents.

## Next steps

- Human review of all design artefacts produced by `/architect`
- Begin `/feature` implementation of MVP Phase 2 items, starting with #133 (P0 bug fix)
- Consider running `/retro` after 3-5 more feature sessions
