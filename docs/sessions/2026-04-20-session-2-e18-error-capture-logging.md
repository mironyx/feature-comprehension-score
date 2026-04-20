# Session Log — 2026-04-20 (Session 2)

**Issue:** #272 — feat: pipeline error capture & structured logging (E18.1)
**PR:** [#275](https://github.com/mironyx/feature-comprehension-score/pull/275)
**Branch:** `feat/e18-error-capture-logging`
**Session ID:** `f73a263e-2fc6-422e-80cc-dd7dc37ffab6`
**Mode:** Teammate (worktree at `../fcs-feat-272-e18-error-capture-logging`)

## Work completed

Delivered E18.1 in full:

- `markRubricFailed` now persists `rubric_error_code`, `rubric_error_message` (truncated to 1000 chars), `rubric_error_retryable` and any partial observability captured before the failure (`rubric_input_tokens`, `rubric_output_tokens`, `rubric_tool_call_count`, `rubric_tool_calls`, `rubric_duration_ms`).
- `RubricGenerationError` carries typed `LLMError` + partial observability out of `finaliseRubric`.
- Structured `logger.info` entries keyed by `{ assessmentId, orgId, step }` at every pipeline boundary: `artefact_extraction`, `llm_request_sent`, `tool_call`, `llm_response_received`, `rubric_parsing`, `rubric_persisted`.
- Engine-layer `onToolCall` port added on `generateQuestions` / `generateRubric` — service wires a logger handler that emits `step: 'tool_call'` entries. Same hook E18.3 (#274) will use to refresh the stale-progress timer.
- 27 tests added (20 in `fcs-pipeline-error-capture.test.ts`, 6 in `tool-loop-on-tool-call.test.ts`, 1 adversarial folded in by evaluator). Full suite: 935 green.

## Decisions made

Captured from the LLD sync report:

### Corrections (spec was wrong / tightened)

- **`extractLlmError` → `toFailureDetails`.** LLD named an intermediate `LLMError`-returning helper. Implementation returns `RubricFailureDetails` directly (the shape `markRubricFailed` already needs), removing one hop and keeping the catch block within the 20-line budget.
- **`markRubricFailed` signature gains `orgId: OrgId`.** Service-role client bypasses RLS, so the UPDATE is now scoped by `.eq('id', id).eq('org_id', orgId)` as defence-in-depth. Codified in [ADR-0025](../adr/0025-service-role-writes-require-org-scoping.md). Triggered by the security review comment mid-session (§ Coordination events below).
- **`malformed_response` warn log content.** LLD specified "response shape (top-level keys and types only)". Implementation logs `{ errorCode, errorMessage, step }` — the raw response has been consumed by the tool loop before `failGeneration` runs; only the typed `LLMError` survives. Deferred threading raw shape via `LLMError.context` until observability needs it.

### Additions (not in spec)

- **Six private helpers** extracted from `finaliseRubric` / `triggerRubricGeneration` (`makeOnToolCall`, `logResponseReceived`, `failGeneration`, `runGeneration`, `buildFailureUpdate`, `toFailureDetails`) to keep both function bodies inside CLAUDE.md's 20-line budget. Justification comment inline.
- **Regression guard test `tests/lib/github/tools/repo-scoping-regression.test.ts`** pins three invariants from v2-req §17.1: `readFile`/`listDirectory` input schemas accept only `{ path }` (R1, R2), and tool factories bind RepoRef via closure so attacker-injected owner/repo in handler input is ignored (R3).
- **ADR-0025** (new) — every service-role write on a tenant-owned table must include `org_id` as an explicit filter predicate. Known follow-up: `retriggerRubricForAssessment` still lacks scoping; flagged in Consequences.

### Omissions (deferred)

- **`rubric_progress` clearing on failure (Invariant I5)** — deferred to E18.3 (#274). The `rubric_progress` columns are added by that story; `markRubricFailed` will be extended once they exist.

### LLD updated

File: `docs/design/lld-e18.md` §18.1
Changes: signature update, helper rename, deferral note, warn-log content note, change-log row for 2026-04-20.

## Review feedback addressed

- **CI MD056 failure on pre-existing markdown table** (`docs/sessions/2026-04-19-...agentic-retrieval.md:44`) — table cell contained unescaped `|| true`. Inherited from main; surfaced by this PR's CI run. Escaped to `\|\|` in commit `d52f36b`.
- **Security review (user prompt):** "we agreed that there should be very few shims where we get correct installation id and use it for a specific org" — drove ADR-0025 + `markRubricFailed(orgId)` change.
- **User prompt:** "look at v2 requirements (4) explicit repo-scoping AC — installation token provides isolation — what have you done" — drove the regression guard.
- **CodeScene "Complex Method" on `finaliseRubric` / `triggerRubricGeneration`** — resolved by helper extraction (`1aaa270`).

## Coordination events

- **`/diag` required twice.** First pass found Complex-Method warnings on both pipeline functions; helper extraction fixed them. Second pass clean.
- **CI probe mis-reported first run.** Initial background agent returned before `gh run watch` blocked; relaunched with explicit "block until exit" prompt.
- **Test A8 off-by-one.** Initial assertion used `ASSESSMENT_ID` constant; `createAssessmentWithParticipants` generates its own UUID via `randomUUID()`. Fixed to assert filter-column shape + explicit `org_id` value only.
- **Regression-guard R3 mocked wrong Octokit path.** First cut mocked `octokit.rest.repos.getContent`; production code uses `octokit.request(...)`. Fixed by mocking `request` directly.

## Next steps / follow-up items

- **Issue #274 (E18.3)** — extend `markRubricFailed` to clear `rubric_progress` to `null` once those columns exist.
- **`retriggerRubricForAssessment` org scoping** — still missing; tracked in ADR-0025 Consequences. Separate issue to file when scheduled.
- **E18.2 follow-up** — outer `triggerRubricGeneration` catch currently logs `{ err, assessmentId, orgId }` without a `step` field for non-LLM failures; evaluator flagged as low risk.

## Cost retrospective

| Stage | Cost | Input tokens | Output tokens | Cache read | Cache write | Time |
| --- | --- | --- | --- | --- | --- | --- |
| PR creation | Prometheus unreachable¹ | — | — | — | — | 27 min |
| Final (all sessions) | **$19.85** | 6,931 | 138,521 | 25,193,796 | 847,399 | 27 min from start to PR |

¹ Prometheus came back online mid-session; final label query succeeded. PR body recorded "Prometheus unreachable" at creation time.

### Cost drivers identified

| Driver | Evidence | Impact |
| --- | --- | --- |
| Context compaction | Session resumed from compacted summary after turn ~143 | **High** — re-summarising the ~290-turn session inflated cache-write tokens. |
| Post-PR rework (5 commits) | Single implementation commit + 4 fix commits (MD056, helper justification, org-scoping, regression guard) | **Medium** — each follow-up re-ran vitest + CI probe. |
| Agent spawns (9 total) | test-author, feature-evaluator, ci-probe ×4, pr-review-v2 ×2, Wait-for-CI ×1 | **Medium** — each spawn re-sent the full diff. |
| Security hardening mid-run | ADR-0025 + code change + failing test update | Planned scope creep — accepted. Drove 1 extra commit + 2 CI cycles. |
| Mock/signature mismatch fix cycles | R3 octokit mock, A8 UUID assumption | **Low** — 2 short fix rounds. |

### Improvement actions for next time

- **Keep PR+review+/diag in the same pass to avoid helper-extraction as a separate commit.** The Complex-Method warnings were predictable from the LLD's inline wiring; could have extracted helpers up front to cut one commit cycle.
- **Check the full octokit call path (`octokit.request` vs `octokit.rest.*`) before writing regression-guard mocks.** One grep-for-usage up front would have saved a failing test round.
- **Flag multi-table schemas' `org_id` presence up front in the LLD.** Had ADR-0025 existed before implementation, the `markRubricFailed` signature would have shipped scoped from the first commit.
- **Pre-existing lint (MD056) on main blocked feature PR CI.** Worth a `chore:` sweep on main before feature branches spawn, consistent with the Wave 1 retro note.
