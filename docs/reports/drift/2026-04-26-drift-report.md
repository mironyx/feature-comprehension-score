# Drift Report: Requirements ↔ Design ↔ Code

**Scan date:** 2026-04-26
**Scanner:** drift-scan (single agent)
**Project phase:** Phase 1: Core Feature Implementation

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| Warning  | 2 |
| Info     | 4 |

**Overall drift score:** Low. E339 (V7 frontend UX, 9 tasks) and V6 (LLM tolerance + relevance
bug) both shipped cleanly with LLD sync. Three findings from the 2026-04-21 scan resolved
(W1 ADR-0025 stale note, W2 ADR-0023 Proposed status, W4 E11 LLD Cancelled marker). C1
(finalise_rubric org_id scope) remains open — bug issue #358 created today. Two warnings
carried unchanged from last scan.

**Resolved since last scan (2026-04-21):**

- W1 — ADR-0025 stale follow-up note: **Fixed.** Line 99 now reads "Resolved in E18.2 (PR
  #277) — now scopes by `.eq('id', assessmentId).eq('org_id', orgId)`."
- W2 — ADR-0023 still Proposed: **Fixed.** Status now `Accepted` with date 2026-04-21 and PR
  references #263–#270.
- W4 — E11 LLD no Cancelled marker: **Fixed.** Status banner at top of LLD file reads
  "Status: Cancelled — 2026-04-18."

---

## Critical Issues

### C1: `finalise_rubric` RPCs missing `org_id` scope in UPDATE WHERE clause (carried)

- **Location:** `supabase/schemas/functions.sql` lines 304–306 (3-arg overload) and 338–348
  (8-arg observability overload)
- **Issue:** Both overloads accept `p_org_id` but the UPDATE WHERE clause reads
  `WHERE id = p_assessment_id` with no `AND org_id = p_org_id` guard. The parameter is used
  in the `assessment_questions` INSERT but not in the UPDATE itself.
- **ADR violation:** ADR-0025 mandates `org_id` scoping on all service-role writes.
- **Impact:** A service-role caller passing a miscomputed `assessmentId` could silently update
  another organisation's assessment row. Not currently exploitable, but removes the ADR-0025
  safety net.
- **Tracking:** Bug issue #358 created 2026-04-26. Fix is one line per overload plus a
  `db diff`/`db reset` migration cycle.

---

## Warnings

### W1: ADR-0012 body references `AnthropicClient` after partial supersession (carried)

- **Location:** `docs/adr/0012-llm-client-interface-and-model-default.md`
- **Issue:** Header correctly notes "Partially superseded by ADR-0015" but the body describes
  `AnthropicClient` and old model string. The active adapter is `OpenRouterClient`. A reader
  of the body gets an inaccurate picture of the LLM interface in production.
- **Suggested action:** Add inline `> [Superseded by ADR-0015]` callouts at the paragraphs
  that describe `AnthropicClient` and the Anthropic model default.

### W2: `fetchLinkedIssues` silent catch with no explanatory comment (carried)

- **Location:** `src/lib/github/artefact-source.ts` line 440
- **Issue:** `catch { return null; }` silently discards errors from
  `octokit.rest.issues.get`. CLAUDE.md mandates no silent catch without an inline comment. A
  403 (scope problem) or 500 is indistinguishable from a 404.
- **Suggested action:** Add `// Intentional: treat any fetch error as a missing linked issue;
  caller filters nulls via `filter(i => i !== null)`` or add a `logger.warn` before returning
  null.

---

## Informational

### I1: `frontend-system.md` still "Draft — awaiting human approval" (carried, 5th scan)

- **Location:** `docs/design/frontend-system.md`
- **Issue:** Tailwind, shadcn/ui, and font choices are in active production use (V7 frontend
  UX shipped 9 tasks building on this system). Blocked on human sign-off.

### I2: ADR-0016 (Structured Logging with Pino) still "Proposed" (carried)

- **Location:** `docs/adr/0016-structured-logging-pino.md`
- **Issue:** Status remains `Proposed` from 2026-03-30. Pino logging is fully implemented and
  in active use — E18 added structured step logging; E17 added `logger` injection to the LLM
  client. The "35+" console call count is a stale snapshot.
- **Suggested action:** Change status to `Accepted`.

### I3: V5 E1 (token budget enforcement) designed but not started

- **Location:** `docs/design/lld-v5-e1-token-budget.md`, issues #328, #329, #330
- **Issue:** Full LLD exists; three tasks are in the backlog. No implementation code yet.
  Expected — tasks are the next priority in the queue. Not a drift gap; flagged for
  completeness.

### I4: `retry-button.tsx` catch block still has no explanatory comment (carried)

- **Location:** `src/app/(authenticated)/assessments/retry-button.tsx` line ~48
- **Issue:** `catch { setError('Network error'); }` swallows error without comment. Defensible
  UI error handling but lacks the CLAUDE.md-mandated explanatory comment.
- **Suggested action:** Add `// Intentional: any network error surfaces the same UI message
  to the user.`

---

## Coverage Matrix

| Epic / Area | Stories | HLD | LLD | ADRs | Code | Tests | Coverage |
|---|---|---|---|---|---|---|---|
| E1: Org Setup | 1.1–1.5 | Full | Inline + webhook LLD | ADR-0001, -0008, -0020 | Webhook, schema, RLS | installation-handlers, webhook | 70% — config UI deferred |
| E2: PRCC Flow | 2.1–2.9 | Full | lld-artefact-pipeline | ADR-0006, -0007, -0011 | None | None | 0% — expected |
| E3: FCS Flow | 3.1–3.6 | Full | Inline | ADR-0005, -0011 | 3.1/3.3/3.4/3.6 done | fcs, answering, results, deletion | 65% |
| E4: Engine | 4.1–4.5 | Full | Inline | ADR-0009, -0010, -0012, -0015 | All modules | Comprehensive | 100% |
| E5: Auth & Web | 5.1–5.4 | Full | 7 onboarding-auth LLDs | ADR-0003, -0004, -0020 | Auth, org-select, middleware | callback, org-membership, auth | 90% — nav/results separation added |
| E6: Reporting | 6.1–6.4 | Partial | lld-nav-results (synced) | None | Results, org overview | results, org tests | 50% |
| V3 E1: Hints (#214) | 1.1–1.3 | Final | lld-v3-e1-hints | — | Shipped | Full | 100% |
| V3 E2: Depth (#215) | 2.1–2.4 | Final | lld-v3-e2-depth | — | Shipped | Full | 100% |
| V2 E11: Quality (#233) | 11.1–11.2 | N/A | Cancelled | ADR-0023 | Reverted | Reverted | Cancelled |
| V2 E17: Retrieval (#240) | 17.1–17.2 | In LLD | lld-v2-e17 (synced) | ADR-0023 (Accepted) | All 7 tasks shipped | Comprehensive | 95% — C1 gap in finalise_rubric |
| V2 E18: Observability (#271) | 18.1–18.3 | In LLD | lld-e18 (synced) | ADR-0025 | All 3 tasks shipped | Per-story BDD | 90% |
| V2 E19: Issues Source (#286) | 19.1–19.3 | In LLD | lld-e19 (synced v1.2) | — | All 3 tasks shipped | Full | 100% |
| V4 E1: Question Quality (#310) | 1.1–1.4 | Final | lld-v4-e1-question-quality | — | #306, #311 shipped | Prompt tests | 100% |
| V4 E2: Epic Discovery (#321) | 2.1–2.2 | Final | lld-v4-e2-epic-discovery | — | #321, #322 shipped | Integration tests | 100% |
| V4 E3: Assessment Deletion (#317) | 3.1–3.2 | Final | lld-e3-assessment-deletion | — | #318, #319 shipped | API + UI tests | 100% |
| V5 E1: Token Budget (#327) | 1.1–1.3 | Final | lld-v5-e1-token-budget | — | Not started | Not started | 0% — by design |
| V6: LLM Tolerance + Relevance | — | In LLD | lld-v6-llm-tolerance (synced) | — | #335, #336 shipped | Full | 100% |
| V7: Frontend UX (#339) | T1–T9 | Final | lld-v7-frontend-ux (v1.4) | — | All 9 tasks shipped | Component + visual tests | 100% |
| Onboarding & Auth (#176) | O.1–O.6 | Full | 7 task LLDs | ADR-0020 | O.1–O.5 done | Full per task | 90% |

---

## Recommendations

1. **Fix C1 (`finalise_rubric` org_id) via issue #358.** One-line schema change per overload
   then `npx supabase db diff -f fix-finalise-rubric-org-scope` and `npx supabase db reset`.

2. **Accept ADR-0016 (I2).** Trivial status change — 2-minute edit.

3. **ADR-0012 stale body paragraphs (W1).** Add three `> [Superseded by ADR-0015]` callouts.
   5-minute edit; eliminates potential misreading of the interface history.

4. **Add explanatory comments to silent catches (W2, I4).** Two files, one comment each.
   5 minutes total.

5. **Human sign-off on `frontend-system.md` (I1).** Carried for 5 scans. V7 shipped 9
   tasks using this system — the design is stable and production-proven.
