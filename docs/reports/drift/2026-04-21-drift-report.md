# Drift Report: Requirements ↔ Design ↔ Code

**Scan date:** 2026-04-21
**Scanner:** requirements-design-drift agents (2 parallel)
**Project phase:** Phase 1: Core Feature Implementation

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1 |
| Warning  | 5 |
| Info     | 7 |

**Overall drift score:** One critical finding: `finalise_rubric` RPC missing `org_id` scope
violates the ADR-0025 pattern created this period. E17 (7 tasks) and E18 (3 tasks) are fully
shipped with LLDs post-implementation synced. E19 is correctly designed-not-implemented. ADR
statuses are the main hygiene gap — two ADRs (0023, 0016) still "Proposed" despite governing
shipped code.

**Resolved since last scan (2026-04-18):**

- W1 — `github-auth-hld.md` still "Draft": **Fixed.** Header now reads "Accepted (human
  security sign-off 2026-04-12)".
- W3 — ADR-0003 Vault encryption follow-up: **Partially resolved** — ADR-0003 header
  acknowledges partial supersession by ADR-0020, but the stale follow-up inside the body has
  not been annotated. Downgraded to I5.
- I3 — ADR-0023 "Proposed" before E17 implementation: E17 has shipped; ADR status still not
  updated. Upgraded to W2.
- I5 — Silent catch in `fetchLinkedIssues`: Still present. Upgraded to W5 per CLAUDE.md rule.

---

## Critical Issues

### C1: `finalise_rubric` RPC does not scope UPDATE by `org_id` (ADR-0025 violation)

- **Location:** `supabase/schemas/functions.sql` lines 299–302 (legacy 3-arg) and 341–344
  (observability 8-arg)
- **Issue:** Both overloads of `finalise_rubric` run
  `UPDATE assessments SET ... WHERE id = p_assessment_id` without an `AND org_id = p_org_id`
  guard. The `p_org_id` parameter is accepted but used only for the `assessment_questions`
  INSERT. ADR-0025 mandates `org_id` scoping on all service-role writes as defence-in-depth.
- **Impact:** A service-role caller passing a miscomputed `assessmentId` could silently update
  another organisation's assessment row. Not currently exploitable (service always passes the
  correct ID), but removes the safety net that ADR-0025 was created to provide.
- **Suggested action:** Add `AND org_id = p_org_id` to both UPDATE WHERE clauses. One-line
  schema change per overload, then `npx supabase db diff -f fix-finalise-rubric-org-scope`.

---

## Warnings

### W1: ADR-0025 "Identified follow-up" note is stale

- **Location:** `docs/adr/0025-service-role-writes-require-org-scoping.md`, Consequences
  section, lines 97–99
- **Issue:** The ADR identifies `retriggerRubricForAssessment` as a pending follow-up requiring
  `org_id` scoping. This was fixed in E18.2 (PR #277) — `service.ts` lines 571–572 now chain
  `.eq('id', assessmentId).eq('org_id', orgId)`. The note reads as an open item that no longer
  exists.
- **Suggested action:** Update to "Resolved in `retriggerRubricForAssessment` (E18.2, PR #277)."

### W2: ADR-0023 (Tool-Use Loop) still "Proposed" after E17 ships

- **Location:** `docs/adr/0023-tool-use-loop-rubric-generation.md`, line 3
- **Issue:** Status remains `Proposed` dated 2026-04-16. E17 shipped across 7 tasks with the
  tool-use loop architecture in production code (`src/lib/engine/llm/tool-loop.ts`,
  `src/lib/engine/llm/tools.ts`, `src/lib/github/tools/`).
- **Suggested action:** Change status to `Accepted`. Add implementation date and PR references.

### W3: ADR-0012 body references `AnthropicClient` after partial supersession (carried)

- **Location:** `docs/adr/0012-llm-client-interface-and-model-default.md`
- **Issue:** Header correctly notes "Partially superseded by ADR-0015" but body still discusses
  `AnthropicClient` and old model string. The adapter is now `OpenRouterClient`.
- **Suggested action:** Add inline `> Superseded by ADR-0015` callouts at stale paragraphs.

### W4: E11 LLD has no "Cancelled" status marker (carried)

- **Location:** `docs/design/lld-v2-e11-artefact-quality.md`
- **Issue:** The LLD reads as an active feature design. The cancellation rationale lives only in
  the 2026-04-18 session log and ADR-0023.
- **Suggested action:** Add status entry: "Cancelled — 2026-04-18. See ADR-0023 and session log."

### W5: `fetchLinkedIssues` silent catch with no explanatory comment (carried, upgraded)

- **Location:** `src/lib/github/artefact-source.ts` lines 198–200
- **Issue:** `catch { return null; }` silently discards errors from `octokit.rest.issues.get`
  without logging or comment. CLAUDE.md mandates no silent catch/swallow without an inline
  comment. A 403 (scope problem) or 500 is indistinguishable from a 404.
- **Suggested action:** Add `logger.warn` before returning null, or at minimum an inline comment
  explaining why swallowing is intentional.

---

## Informational

### I1: `frontend-system.md` still "Draft — awaiting human approval" (carried, 4th scan)

- **Location:** `docs/design/frontend-system.md`
- **Issue:** Technology choices (Tailwind, shadcn/ui, fonts) are in active use. Blocked on human.

### I2: ADR-0016 (Structured Logging with Pino) still "Proposed" (carried)

- **Location:** `docs/adr/0016-structured-logging-pino.md`
- **Issue:** Pino logging implemented and in active use (E18 added structured step logging).
  Console-call count "35+" is a stale snapshot.

### I3: `finalise_rubric` legacy 3-arg overload does not clear progress fields

- **Location:** `supabase/schemas/functions.sql` lines 279–303
- **Issue:** Legacy overload only sets `status = 'awaiting_responses'` — does not clear
  `rubric_progress` or `rubric_progress_updated_at`. The observability overload does. No code
  path currently calls the 3-arg form.

### I4: `failGeneration` hard-codes `step: 'llm_request_sent'` regardless of failure step

- **Location:** `src/app/api/fcs/service.ts` line 362
- **Issue:** A `malformed_response` after five tool calls logs `step: 'llm_request_sent'`
  rather than `step: 'llm_tool_call'`. Minor observability inaccuracy.

### I5: ADR-0003 Vault encryption follow-up obsoleted by ADR-0020 (carried)

- **Location:** `docs/adr/0003-auth-supabase-auth-github-oauth.md`, Consequences section
- **Issue:** Follow-up states Vault encryption should be validated in Phase 2. ADR-0020
  supersedes this. Header acknowledges partial supersession but body follow-up not annotated.

### I6: V2 Epics 7–10, 12–16 have requirements but no design or issues (carried)

- **Location:** `docs/requirements/v2-requirements.md`
- **Issue:** Nine epics as requirements only. Expected for current phase.

### I7: `retry-button.tsx` catch block has no explanatory comment

- **Location:** `src/app/(authenticated)/assessments/retry-button.tsx` line 48
- **Issue:** `catch { setError('Network error'); }` swallows error without comment. Defensible
  UI error handling but lacks CLAUDE.md-mandated comment. Low priority.

---

## Coverage Matrix

| Epic / Area | Stories | HLD | LLDs | ADRs | Code | Tests | Coverage |
|---|---|---|---|---|---|---|---|
| E1: Org Setup | 1.1–1.5 | Full | Inline + webhook LLD | ADR-0001, -0008, -0020 | Webhook handler, schema, RLS | installation-handlers, webhook | 70% — config UI deferred |
| E2: PRCC Flow | 2.1–2.9 | Full | lld-artefact-pipeline | ADR-0006, -0007, -0011 | None | None | 0% — expected |
| E3: FCS Flow | 3.1–3.6 | Full | Inline | ADR-0005, -0011 | 3.1/3.3/3.4 done | fcs, answering, results | 50% |
| E4: Engine | 4.1–4.5 | Full | Inline | ADR-0009, -0010, -0012, -0015 | All modules | Comprehensive | 100% |
| E5: Auth & Web | 5.1–5.4 | Full | 7 onboarding-auth LLDs | ADR-0003, -0004, -0020 | Auth, org-select, middleware | callback, org-membership, auth | 85% |
| E6: Reporting | 6.1–6.4 | Partial | None | None | Basic results page | results tests | 25% |
| V3 E1: Hints (#214) | 1.1–1.3 | Final | lld-v3-e1-hints | — | All shipped | Full | 100% |
| V3 E2: Depth (#215) | 2.1–2.4 | Final | lld-v3-e2-depth | — | All shipped | Full | 100% |
| V2 E11: Quality (#233) | 11.1–11.2 | N/A | Obsolete (W4: no cancelled marker) | ADR-0023 | Reverted | Reverted | Cancelled |
| V2 E17: Retrieval (#240) | 17.1–17.2 | In LLD | lld-v2-e17 (synced) | ADR-0023 (W2: still Proposed) | All 7 tasks shipped | Comprehensive | 95% — C1 gap |
| V2 E18: Observability (#271) | 18.1–18.3 | In LLD | lld-e18 (synced) | ADR-0025 | All 3 tasks shipped | Per-story BDD specs | 90% |
| V2 E19: Issues Source (#286) | 19.1–19.3 | In LLD | lld-e19 (Draft) | — | Not started | Not started | 0% — by design |
| Onboarding & Auth (#176) | O.1–O.6 | Full | 7 task LLDs | ADR-0020 | O.1–O.5 done | Full per task | 85% |

---

## Recommendations

1. **Fix `finalise_rubric` org_id scoping (C1).** One-line schema change per overload.
   Create a bug issue and fix via `/feature`.

2. **ADR hygiene pass (W1–W3).** Accept ADR-0023, resolve ADR-0025 stale note, annotate
   ADR-0012 stale paragraphs. Three 5-minute edits.

3. **Add comment/logging to silent catches (W5, I7).** Two files need inline comments
   explaining why errors are swallowed.

4. **Mark E11 LLD as Cancelled (W4).** One status-table addition.

5. **Accept ADR-0016 (I2).** Status change from Proposed to Accepted.
