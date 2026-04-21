# Session Log — 2026-04-21 Session 5 — #282 Log file paths and issue references sent to LLM (E19.3)

**Issue:** [#282](https://github.com/mironyx/feature-comprehension-score/issues/282)
**PR:** [#290](https://github.com/mironyx/feature-comprehension-score/pull/290)
**Branch:** `feat/e19-enhanced-logging` (worktree: `../fcs-feat-282-e19-enhanced-logging`)
**Session ID:** `f58bba97-2aa5-4310-8882-c5d58864202a`
**Parent epic:** [#286](https://github.com/mironyx/feature-comprehension-score/issues/286) (E19: GitHub Issues as Artefact Source)

## Scope

E19.3 — extend `logArtefactSummary` in `src/app/api/fcs/service.ts` to include the exact `filePaths` sent to the LLM (truncated to 50 with a `filePaths_truncated: true` flag) and an `issueCount` field when `linked_issues` are present. Purely a logging change — no schema, API, or UI impact.

## Work completed

- **Src** — `src/app/api/fcs/service.ts`: added `FILE_PATHS_LOG_LIMIT = 50` constant and extended `logArtefactSummary` body. Derives `allPaths` from `file_contents.map(f => f.path)`, conditionally truncates, and spreads `filePaths_truncated: true` / `issueCount: N` into the log payload using falsy-guarded spread. Function body 14 lines (under the 20-line budget). Existing fields (`fileCount`, `testFileCount`, `artefactQuality`, `questionCount`, `tokenBudgetApplied`) preserved verbatim.
- **Tests** — `tests/app/api/fcs-service-logging.test.ts`: refactored the existing baseline (extracted `mockExtractFromPRs` as a module-level `vi.fn()` for per-test override, factored out `runCreateFcs` and `getArtefactSummaryLogPayload` helpers, added a `makeFileContents(n)` fixture builder). Added 10 new tests covering all 5 ACs plus boundary cases (exactly-50 files, empty `linked_issues` array).
- **Verification** — `npx vitest run` green on 1107/1107 tests across 110 files; `npx tsc --noEmit`, `npm run lint` clean; markdown lint had only pre-existing unrelated failures in `.claude/skills/requirements/SKILL.md` and `node_modules/zod/README.md`.

## Decisions made

- **`issueCount` vs `issueNumbers` (spec deviation, documented in PR body).** v2-requirements.md §19.3 says `issueNumbers` (list of actual issue numbers); issue #282 AC says `issueCount` (scalar count). Implementation logs `issueCount` because:
  1. `LinkedIssue` in `src/lib/engine/prompts/artefact-types.ts` has only `{title, body}` — no `number` field. Adding a number field would require schema changes beyond a logging-only story.
  2. `linked_issues.length` covers BOTH explicitly-passed issue numbers and issues discovered from PR bodies. Threading explicit numbers through `finaliseRubric` would only cover the former — information loss.
  Action surfaced for the next /backlog groom: update v2-requirements.md §19.3 to say `issueCount`, or open a follow-up issue to enrich `LinkedIssue` with `number`.
- **Falsy-guarded spread for conditional fields.** `...(truncated && { filePaths_truncated: true })` and `...(issueCount > 0 && { issueCount })` keeps the function single-statement and avoids mutation/if-ladders. Omission (not `false`/`0`) when the condition is unmet, per the AC wording "omitted when no linked_issues".
- **Interface-write step skipped.** The `logArtefactSummary` signature did not change — this is behavioural enhancement, not contract extension — so the interface-stub ceremony was skipped and control passed straight to the test-author sub-agent (per `/feature-core` Step 4a guidance for no-signature-change work).

## LLD-sync outcome

**Skipped — no LLD exists for E19.** `docs/design/lld-e19.md` is referenced by the epic and issue but was never created (E19 went requirements → implementation directly). The only LLD that mentions `logArtefactSummary` is `docs/design/lld-v2-e17-agentic-retrieval.md` at the call site inside `finaliseRubric`; that reference does not prescribe the log-payload shape, so no edits were needed there.

## Review feedback addressed

- **pr-review-v2 (adaptive, 2-agent path since diff was 328 lines):** 0 findings from both Agent A (quality + anti-patterns) and Agent C (design conformance + silent-swallow). Note posted on the PR confirming checks ran.
- **Feature-evaluator:** PASS, 0 adversarial tests written. Coverage matrix maps every AC to a direct test plus two boundary tests (exactly-50 files; empty-array `linked_issues`).

## CI

PR #290 run `24728790545` — all jobs green:

- Lint & Type-check — pass
- Unit tests — pass
- Integration tests (Supabase) — pass
- E2E tests (Playwright) — pass
- Docker build — pass

No failures, no flakes, no re-runs required.

## Cost retrospective

| Metric | Value |
| --- | --- |
| PR-creation cost | $4.0697 |
| Final cost | $6.3807 |
| Delta (post-PR) | $2.3110 |
| Tokens (final) | 5,768 input / 42,854 output / 7.8M cache-read / 285k cache-write |
| Time to PR | 10 min |

### User feedback — "$4 for a 10-line logging change?"

The user flagged the $4 PR-creation figure (now $6.38 final) as surprisingly high for a 10-line src change. Recorded here because the pattern likely repeats on every trivial feature.

### Cost drivers

- **Sub-agent fan-out dominates fixed overhead.** For a ~10-line src change, the pipeline ran: 1 test-author + 1 feature-evaluator + 2 pr-review-v2 agents + 1 ci-probe = 5 sub-agents. Each cold-starts with no context and re-reads `service.ts` (675 lines), `artefact-types.ts`, the test file, the requirements doc section, and CLAUDE.md. Four of the five agents re-bootstrap the same core file set. Cache-read tokens (7.8M) reflect exactly this — the raw content fits in the cache but each new agent pays the read cost.
- **pr-review-v2 2-agent path triggered on 328-line diff.** The 150-line threshold is measured on total diff, but ~220 of the 328 lines were test additions (new tests + fixture extraction). For src-tiny/test-heavy diffs the single-agent path would have been cheaper. SKILL.md already notes "use judgment … for large diffs mostly trivial" — test additions arguably qualify.
- **Evaluator near-duplicates test-author's coverage audit.** The test-author's report enumerated the full contract-to-test mapping. The evaluator re-produced the same matrix from scratch (no gaps found, 0 adversarial tests). When test-author reports 0 gaps AND the src diff is tiny, the evaluator spawn is redundant.
- **Context per call is heavy.** System prompt + CLAUDE.md + auto-memory + ~70 deferred tool schemas means even a small task sends a large cold-cache context on the first call. Subsequent cache hits are cheap — but sub-agent fan-out breaks cache reuse.

### Improvement actions

- **Short-circuit the pipeline on trivial changes.** Heuristic: if src diff <30 lines AND the target test file already exists AND the interface is unchanged, skip the `test-author` spawn — write tests directly from the issue AC. Applies cleanly to logging-only or single-function changes like this one.
- **Make the evaluator conditional.** If `test-author` reports 0 gaps in its audit AND src diff <50 lines, skip `feature-evaluator` entirely. The evaluator's job is gap-finding; when gaps are already enumerated and src surface is small, the risk of missing one is low.
- **Weight `pr-review-v2` threshold by file type.** 150 total diff lines is the current trigger for the 2-agent path. Proposed: use `max(src_diff, test_diff/3)` instead, so test-heavy diffs route to the single-agent path. Test code is reviewed differently and does not benefit from the split Quality/Conformance partition.
- **None of the above require skill-surgery now.** These are backlog items for a process retro. Recording here so they aggregate across future sessions and surface in the next `/retro`.

### What went well

- **No failed runs, no review fixes, no re-commits.** One commit, one PR, one CI run, one merge. The $2.31 post-PR delta is entirely the `/feature-end` cost (LLD-sync + session log + final cost query + board update).
- **Test-author + evaluator both returned clean verdicts first try.** Spec was unambiguous enough (BDD skeleton in the issue) that neither sub-agent needed iteration.
- **Spec contradiction caught upfront, not post-review.** The `issueCount`/`issueNumbers` discrepancy was triaged in Step 3b before any code was written; the deviation note went straight into the PR body, saving a review cycle.

## Next steps

- **#288 (E19.2)** — discover linked PRs from issues via GraphQL. Last story in the E19 epic. Likely needs a proper LLD (GraphQL query shape, batching strategy, port changes) before implementation.
- **Follow-up for spec reconciliation** — decide: update v2-requirements.md §19.3 to match `issueCount`, or open a type-model enrichment issue for `LinkedIssue.number`.
- **Process improvement backlog** — feed the three cost-driver actions above into the next `/retro`.
