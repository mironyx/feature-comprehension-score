# Drift Report: Requirements ↔ Design ↔ Code

**Scan date:** 2026-03-24
**Scanner:** requirements-design-drift agent
**Project phase:** Phase 0.5 — Scaffolding & Infrastructure (active API development; Epics 2–5 partially implemented)

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| Warning  | 9 |
| Info     | 7 |

**Overall drift score:** Design coverage is strong across all six epics (L3/L4 contracts exist for every story). Implementation coverage is approximately 45% of V1 stories, which is expected for Phase 0.5. The most significant risks are a stale model string that has persisted through multiple drift scans unresolved, and the absence of integration tests for the two recently-merged API endpoints.

---

## Critical Issues

### C1: ADR-0012 internally inconsistent — model string in "Options Considered" does not match code or "Decision" section

- **Requirement:** N/A — design artefact quality issue
- **Expected:** ADR-0012 "Option D" (Options Considered section) to name the same model string as the Decision section and the implementation
- **Found:** Options Considered section (line 44) reads `claude-sonnet-4-20250514`; Decision section (line 76) reads `claude-sonnet-4-5-20250514`; `src/lib/engine/llm/client.ts:43` reads `claude-sonnet-4-5-20250514`; `docs/design/v1-design.md §4.6` reads `claude-sonnet-4-20250514`. This discrepancy was flagged in the 2026-03-20 drift report with a recommended fix that has not been applied.
- **Impact:** Any developer using the ADR or HLD as a reference will configure or mock the wrong model identifier. In a testing context this produces silent mismatches; if the model string is ever externalised to configuration, the wrong value will be used as the default. This is a silent correctness risk, not just documentation debt.

### C2: Six API routes specified in LLD §2.4 have no corresponding source files

- **Requirement:** Stories 2.4 (answer submission), 2.7 (skip gate), 3.4 (FCS scoring/results), 3.5 (close without full participation), 3.6 (reassessment), 5.3 (answering UI)
- **Expected:** The LLD §2.4 specifies the following route files that must exist:
  - `src/app/api/assessments/[id]/scores/route.ts` — FCS self-view scores (Story 3.4, §2.4)
  - `src/app/api/assessments/[id]/answers/route.ts` — answer submission (Stories 2.4, 3.3, §2.4)
  - `src/app/api/assessments/[id]/reassess/route.ts` — FCS reassessment (Story 3.6, §2.4)
  - `PUT` handler in `src/app/api/assessments/[id]/route.ts` — skip/close actions (Stories 2.7, 3.5, §2.4)
  - `src/app/api/webhooks/github/route.ts` — GitHub webhook handler (Stories 2.1, 1.1)
- **Found:** None of the above files exist. The only implemented API routes are `GET /api/assessments` and `GET /api/assessments/[id]`. The `[id]` route exposes only a `GET` handler; no `PUT` is present.
- **Impact:** The PRCC and FCS core flows cannot execute end-to-end. Answer submission, gate enforcement, skip, and self-view are all blocked. These are Phase 2 deliverables and are noted as in-progress, but the absence creates a gap between the LLD's claimed "Implementation plan: Phase 2" status and the actual file system.

---

## Warnings

### W1: `v1-design.md §4.6` model string stale — not updated after ADR-0012 finalised the model

- **Location:** `docs/design/v1-design.md`, line ~1968
- **Issue:** The HLD §4.6 "Shared configuration" table shows `claude-sonnet-4-20250514`. ADR-0012 Decision section and the implementation both use `claude-sonnet-4-5-20250514`. These are different model identifiers. The HLD is a reader's first reference; leaving it stale produces inconsistent expectations.
- **Suggested action:** Update `v1-design.md §4.6` model row to `claude-sonnet-4-5-20250514` and add a footnote cross-referencing ADR-0012.

### W2: `GET /api/assessments` — test suite mocks `requireOrgAdmin` but implementation calls `assertAuthOrParticipant`

- **Location:** `tests/app/api/assessments.test.ts:13` and `src/app/api/assessments/route.ts:46`
- **Issue:** The test mocks `requireOrgAdmin` directly. The production route calls `assertAuthOrParticipant`, which internally calls `requireOrgAdmin` but swallows 403 errors. The mock intercepts at `requireOrgAdmin` level, so the test for "regular user returns 200 scoped by RLS" passes a 403 `ApiError` from the mock — which `assertAuthOrParticipant` is designed to catch and ignore. This works today but the test's mock level is one layer below the actual call site. If `assertAuthOrParticipant` is refactored to call a different function, the test will silently stop exercising the intended code path.
- **Suggested action:** Mock `assertAuthOrParticipant` directly (once it is exported), or document the layering explicitly in the test file so the dependency is visible.

### W3: `GET /api/assessments/[id]/scores` is fully specified in LLD §2.4 but has no test file

- **Location:** `docs/design/lld-phase-2-web-auth-db.md §2.4`
- **Issue:** The design specifies the `scores` endpoint in detail (response shape, sequence, visibility rules for FCS participants). No source file exists and no test file covers it. Given the project's TDD discipline, a test should be written before implementation. The LLD describes this as a current-phase deliverable.
- **Suggested action:** Create the test spec for `GET /api/assessments/[id]/scores` before implementing the route, per the Red-Green-Refactor discipline.

### W4: Story 3.4 acceptance criteria split across two endpoints — `my_scores` removed from `GET /api/assessments/[id]` without a requirements update

- **Location:** `docs/design/lld-phase-2-web-auth-db.md §2.4`, `docs/requirements/v1-requirements.md §Story 3.4`
- **Issue:** The LLD records a design decision on 2026-03-24: "Self-view scores moved to `GET /api/assessments/[id]/scores`. `my_scores` removed from response shape." Story 3.4 acceptance criteria still describes the participant self-view as part of the FCS results page — it does not specify a separate endpoint. A developer reading only the requirements will expect `my_scores` in the detail endpoint.
- **Suggested action:** Add a note to Story 3.4 acceptance criteria documenting that self-view scores are served by `GET /api/assessments/[id]/scores` (not embedded in the detail response), with cross-reference to the LLD design decision.

### W5: `pgsodium` token storage is non-functional on Supabase cloud — Story 3.1 FCS PR context fetch depends on it

- **Location:** `docs/design/lld-phase-2-web-auth-db.md §2.2`
- **Issue:** The LLD documents a known gap: "`store_github_token` requires `pgsodium` to be enabled and `postgres` to have execute permission on `crypto_aead_det_encrypt`. On Supabase cloud, the GRANT cannot be applied — token storage is currently non-functional on cloud." Story 3.1 (FCS PR context fetch) depends on decrypting the stored user OAuth token. This is an open blocker for any cloud deployment.
- **Suggested action:** The LLD notes "Supabase Vault as alternative — tracked in issue #82." Ensure issue #82 is tracked on the project board and not blocked.

### W6: `POST /assessments` (FCS creation endpoint) is absent from both source and test files

- **Location:** LLD §2.4 describes `POST /api/assessments` implicitly through the FCS flow (Story 3.1); `v1-design.md §4.4`
- **Issue:** The design describes FCS creation via the web UI posting to an assessment creation endpoint. No `POST` handler is present in `src/app/api/assessments/route.ts` (only `GET`). No test covers FCS creation. Story 3.1 (Create Feature Assessment) has full L4 contract coverage but zero implementation.
- **Suggested action:** Add to the implementation backlog. Given the current phase, this is expected — but flag it so it is not overlooked when Phase 2 FCS work begins.

### W7: `src/app/api/webhooks/github/` directory does not exist — Epic 2 (PRCC) is entirely unimplemented

- **Location:** `docs/design/v1-design.md §3.1`, `docs/design/lld-artefact-pipeline.md`
- **Issue:** The entire PRCC flow (Stories 2.1–2.9) depends on the webhook handler at `/api/webhooks/github`. No such route exists. The artefact source adapter (`GitHubArtefactSource`) and engine pipeline are implemented, but without the webhook entry point, the PRCC flow cannot trigger.
- **Suggested action:** This is a known Phase 2 gap. Ensure Epic 2 issues exist on the project board in priority order.

### W8: `docs/design/lld-artefact-pipeline.md §6 Issue Scope Mapping` — two components listed as "New issue needed" with no GitHub issue

- **Location:** `docs/design/lld-artefact-pipeline.md §6`
- **Issue:** The `ArtefactSource` port interface and `GitHubArtefactSource` adapter are listed as "New issue needed — —". Both are now implemented (`src/lib/engine/ports/artefact-source.ts`, `src/lib/github/artefact-source.ts`) but the LLD's issue scope table still shows them as untracked. The multi-PR merge strategy is also listed as "New issue needed".
- **Suggested action:** Update the LLD §6 table to reflect the actual issue numbers and status for the artefact source components. Close or link the multi-PR merge strategy item.

### W9: No integration tests for the two implemented assessment API routes

- **Location:** `tests/app/api/assessments.test.ts`, `tests/app/api/assessments/[id].test.ts`
- **Issue:** Both assessment endpoint tests are unit-level (mocked Supabase clients, no DB interaction). Per ADR-0009 (test diamond), API routes should be "20% unit / 70% integration". The current tests mock the DB entirely and do not test RLS enforcement, actual query behaviour, or constraint validation. RLS correctness (participant visibility, org scoping) cannot be verified with mocked clients.
- **Suggested action:** Add integration tests using the `resetDatabase` + factory pattern already established in `tests/helpers/`. Prioritise the RLS boundary cases: non-admin access scoping; cross-org denial; `PGRST116` not-found handling.

---

## Informational

- **I1: Open question in `lld-artefact-pipeline.md §8`** — Cross-section file deduplication (question 7) remains unresolved. If a file matches both a context pattern and the top-N selection, it will appear twice in the assembled prompt. A decision is needed before the FCS flow is built end-to-end.

- **I2: `docs/design/lld-phase-2-web-auth-db.md §2.5`** — Assessment answering UI section exists in the LLD but no `src/app/assessments/` page files exist yet. The LLD describes a multi-step UI; none of it is implemented. Expected for Phase 0.5.

- **I3: Story 3.6 (FCS Self-Reassessment) is explicitly deferred** — The `is_reassessment` column is scaffolded in the DB but the `POST /api/assessments/[id]/reassess` endpoint and business logic are deferred post-MVP per the LLD implementation note (issue #50). This is a known, documented deferral. No action required.

- **I4: `OrgList`/`OrgCard` sub-components and repo count in org card** — The LLD §2.3 notes these are deferred. The org-select page uses flat JSX. Low risk.

- **I5: `validateParams()` deferred** — LLD §2.4 lists it but notes it was not implemented. Query parameter validation in API routes falls back to inline checks. This leaves a coverage gap for malformed UUIDs in path parameters; low risk for Phase 0.5.

- **I6: Email service (Story 3.2) has no design coverage below L2** — The HLD Component 5 describes the email service as "V1 approach TBD". No LLD section, no ADR, and no implementation exists. Acceptable for Phase 0.5 but will need resolution before FCS notifications are built.

- **I7: `docs/reports/2026-03-24-process-retro.md` is untracked in git** — The file exists but has not been staged. No drift impact; noted for completeness.

---

## Coverage Matrix

| Epic | Stories | Designed (L3/L4) | ADR'd | Code implemented | Tests | Coverage |
|------|---------|-----------------|-------|-----------------|-------|----------|
| Epic 1: Organisation Setup | 5 (1.1–1.5) | Yes — LLD §2.1, v1-design §4.1–4.3 | ADR-0001, 0003, 0004, 0008 | DB schema + migrations only; webhook handler (1.1) absent | Integration tests for schema/migrations only | 35% |
| Epic 2: PRCC Flow | 9 (2.1–2.9) | Yes — v1-design §3.1, LLD §2.4, spike-003 | ADR-0001, 0006, 0007, 0011, 0013 | Engine + GitHub adapter implemented; webhook handler, answers, skip routes absent | Engine unit tests comprehensive; no API route tests | 30% |
| Epic 3: FCS Flow | 6 (3.1–3.6) | Yes — v1-design §3.2, LLD §2.4, LLD-artefact-pipeline | ADR-0005, 0011, 0013 | Engine shared logic only; no FCS creation/notification/reassess routes | No FCS-specific tests | 20% |
| Epic 4: Assessment Engine | 5 (4.1–4.5) | Yes — v1-design §4.6, LLD-artefact-pipeline, ADR-0010, 0011, 0012 | ADR-0010, 0011, 0012 | Fully implemented: generation, scoring, relevance, aggregate, pipeline, artefact source | Comprehensive unit tests; LLM client test; pipeline test | 85% |
| Epic 5: Web App & Auth | 4 (5.1–5.4) | Yes — LLD §2.2, 2.3, 2.5, v1-design §3.3 | ADR-0002, 0003 | Auth callback, sign-in, sign-out, middleware, org-sync, org-select — all implemented | Unit + integration tests for auth, org-sync, org-context, middleware | 65% |
| Epic 6: Reporting | 4 (6.1–6.4) | Partial — v1-design §4.4 API contracts; no LLD section for result pages | None specific | `GET /api/assessments` + `GET /api/assessments/[id]` (list and detail only) | Unit tests for both routes | 25% |

---

## Recommendations

Prioritised actions to close the most critical gaps:

1. **Fix the model string in two places (Critical C1):** Update `docs/adr/0012-llm-client-interface-and-model-default.md` "Options Considered — Option D" and `docs/design/v1-design.md §4.6` to read `claude-sonnet-4-5-20250514`. This is a one-line fix in each file that has been flagged since the 2026-03-20 report.

2. **Add integration tests for the two live API routes (Warning W9):** `GET /api/assessments` and `GET /api/assessments/[id]` are in production use but have only mock-based unit tests. Write integration tests using the `resetDatabase` + factory helpers. Test the RLS boundaries: non-admin access scoping, cross-org denial, `PGRST116` not-found handling.

3. **Update Story 3.4 requirements to reflect the `scores` endpoint split (Warning W4):** Add a note to `docs/requirements/v1-requirements.md §Story 3.4` stating that self-view scores are served by `GET /api/assessments/[id]/scores`, not embedded in the detail response.

4. **Write the test spec for `GET /api/assessments/[id]/scores` before implementing it (Warning W3):** Per TDD discipline. The LLD §2.4 has a complete spec; translate it into a BDD test file first.

5. **Create GitHub issues for remaining Phase 2 routes (Critical C2 partial mitigation):** Ensure `POST /api/assessments`, `POST /api/assessments/[id]/answers`, `PUT /api/assessments/[id]`, `GET /api/assessments/[id]/scores`, and `POST /api/webhooks/github` each have a GitHub issue on the project board in Todo status.

6. **Resolve issue #82 (pgsodium on Supabase cloud, Warning W5):** This blocks the FCS PR context fetch on any cloud deployment. Track it as a blocker for FCS end-to-end testing.

7. **Update `lld-artefact-pipeline.md §6` issue scope table (Warning W8):** Replace "New issue needed" entries with the actual issue numbers and mark the artefact source components as implemented.

8. **Resolve open question §8.7 in `lld-artefact-pipeline.md` (Info I1):** The cross-section file deduplication question needs a decision recorded before FCS end-to-end build begins.
