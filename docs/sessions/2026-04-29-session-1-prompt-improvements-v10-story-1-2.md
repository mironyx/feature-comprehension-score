# Session Log — 2026-04-29 — Prompt Improvements V10 Story 1.2

**Issue:** #388 — fix: prompt improvements — depth compliance probe, hint conflict, diversity, weight criteria
**Branch:** `feat/fix-prompt-improvements-v10-story-1-2`
**PR:** #391 — <https://github.com/mironyx/feature-comprehension-score/pull/391>
**Session ID:** `5f0e8aad-bb17-46d6-badf-7b1e4bd8bd48`

---

## Work completed

Four additive text edits to `src/lib/engine/prompts/prompt-builder.ts` (the sole source file changed) implementing V10 Story 1.2:

1. **Depth compliance probe** — added fourth probe to `REFLECTION_INSTRUCTION` after the theory persistence probe: enforces that conceptual questions contain no identifiers and detailed questions contain at least one concrete anchor in `question_text` or `hint`.

2. **Hint conflict resolution** — updated base hint description in `QUESTION_GENERATION_SYSTEM_PROMPT` to remove "names a recognisable code landmark — a function, type, file, or observable behaviour" (which conflicted with `CONCEPTUAL_DEPTH_INSTRUCTION`). Replaced with "gives the participant a recognisable code landmark to reason from" and added a cross-reference to the Comprehension Depth section.

3. **Coverage diversity constraint** — appended to `## Constraints`: "Spread questions across distinct files and subsystems. Do not ground more than one question primarily in the same source file or function. If the diff spans N distinct modules, draw from at least min(N, question_count) distinct modules."

4. **Concrete weight criteria** — replaced vague `(3 = critical to understanding)` with three-point scale defining each weight in terms of safe-change scope.

Supporting changes:
- 9 new BDD tests in `tests/lib/engine/prompts/prompt-builder.test.ts` across 4 describe blocks; all 81 tests pass.
- Story 1.2 section added to `docs/design/lld-v10-e1-reflection.md` (invariants 7–10, BDD specs, complexity note).
- Story 1.2 section added to `docs/requirements/v10-requirements.md` (user story + 6 acceptance criteria).

---

## Decisions made

- **Pressure tier: Light** — 12 src lines changed across 1 file. Test-author agent skipped; tests written inline.
- **lld-sync skipped** — LLD was updated inline during the feature cycle (Story 1.2 section appended to `lld-v10-e1-reflection.md`). No architectural change warranting a separate sync run.
- **Pre-existing CI failure noted** — `polling-badge-behaviour.test.ts` fails 10 tests on `main` (`useRouter` not mocked); confirmed by stashing our diff and running the test on clean main. Not caused by this PR.

---

## Review outcome

`/pr-review-v2 391` found no issues. No blockers, no warnings.

---

## CI outcome

- Lint & type-check: pass
- Integration tests: pass
- Unit tests: fail (pre-existing `polling-badge-behaviour.test.ts` failures, unrelated to this PR)
- E2E: skipped

---

## Cost retrospective

| Snapshot | Cost |
|----------|------|
| PR creation | $1.28 |
| Final total | $2.70 |
| Post-PR delta | $1.42 |

**Drivers:**
- **Context compaction** — session ran out of context mid-work; the large pre-compact summary inflated cache-write tokens (317k). The implementation itself was tiny (12 lines), but the context carried the full Story 1.1 history from the same conversation.
- **Post-PR agents** — ci-probe ($0.02 est.), pr-review ($0.60 est.), feature-end ($0.50 est.) account for most of the delta.

**Improvement actions:**
- For very small stories (< 30 src lines), opening a fresh session rather than continuing from a large Story 1.1 context would reduce cache-write overhead. The current approach of doing Story 1.1 + 1.2 in one session was reasonable for continuity, but the compaction cost was avoidable.

---

## Next steps

- Close issue #388 (handled by feature-end)
- Remaining open tasks: #387 (tool-loop error code), #389 (assessment creation page nav)
