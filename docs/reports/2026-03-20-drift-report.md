# Drift Report: Requirements ↔ Design ↔ Code

**Scan date:** 2026-03-20
**Scanner:** requirements-design-drift agent
**Project phase:** Phase 0.5 — Scaffolding & Infrastructure

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2 |
| Warning  | 7 |
| Info     | 8 |

**Overall drift score:** Epic 4 (Assessment Engine) — the only fully implemented epic — achieves approximately 90% design-to-code alignment. All other epics are 0–25% implemented, which is expected for Phase 0.5 (Scaffolding & Infrastructure). Two critical issues are ADR-to-migration contradictions that create incorrect reference points for Phase 1/2 development. Seven warnings require action before the corresponding implementation work begins.

---

## Critical Issues

### C1 — ADR-0008 contradicts the deployed `participant_answers` schema

- **Requirement:** Story 3.4 (FCS Scoring and Results), Story 3.6 (FCS Self-Reassessment), ADR-0005 Option 4
- **Expected:** ADR-0008 (Data Model & Multi-Tenancy) states explicitly in its "Key schema principles" table: "`participant_answers` — Submitted answers. **No score column** — individual scores are calculated transiently during aggregate computation and not persisted (ADR-0005)."
- **Found:** Migration `supabase/migrations/20260316000001_participant_answers_v08.sql` adds `score numeric(3,2) CHECK (score IS NULL OR score BETWEEN 0.0 AND 1.0)` and `score_rationale text` to `participant_answers`. The generated TypeScript types in `src/lib/supabase/types.ts` include both columns. The LLD `docs/design/lld-phase-2-web-auth-db.md §2.1` documents these columns as existing in the live schema.
- **Impact:** ADR-0008 is the definitive data model reference. Any developer reading it to understand the schema — when writing queries, designing RLS policies, or planning migrations — will believe `participant_answers` has no score column. The gap was caused by ADR-0005 being revised to Option 4 after ADR-0008 was written, without a corresponding amendment to ADR-0008. The deployed schema (migration + `types.ts`) is correct; ADR-0008 must be updated.

---

### C2 — ADR-0013 names the wrong table for `context_file_patterns`

- **Requirement:** Story 1.3 (Repository Configuration), Story 2.2 (PR Artefact Extraction), `lld-artefact-pipeline.md §2.5`
- **Expected:** ADR-0013 (Context File Resolution Strategy) Consequences section states: "**`repositories` table needs a `context_file_patterns` column** (`text[] DEFAULT NULL`). `NULL` means 'use org default'. Schema migration required before the config service layer is built."
- **Found:** Migration `supabase/migrations/20260317000001_context_file_patterns.sql` adds `context_file_patterns` to `repository_config`, not `repositories`. The updated `get_effective_config` function in migration `20260317000002` correctly reads from `repository_config`. TypeScript types show `context_file_patterns: string[] | null` on `repository_config` (not on `repositories`). The `lld-artefact-pipeline.md` open question #6 explicitly notes: "Note: LLD previously referenced `repositories` table — the correct table is `repository_config`."
- **Impact:** Any developer reading ADR-0013 to plan the config service layer, write RLS policies, or add further migrations will be directed to the wrong table. Adding `context_file_patterns` to `repositories` (when it already exists on `repository_config`) would create schema drift and broken config resolution. The code is correct; ADR-0013's consequence must be corrected.

---

## Warnings

### W1 — Multi-PR linked-issue deduplication uses `title` rather than issue number

- **Location:** `src/lib/github/artefact-source.ts`, `mergeRawArtefacts()` function
- **Issue:** `lld-artefact-pipeline.md §2.6` specifies: "**Linked issues** — deduplicated by issue number. An issue linked from multiple PRs is included once." The code uses `issueMap.set(issue.title, issue)`. Two distinct GitHub issues with identical titles collapse into one entry. The `LinkedIssue` type (`src/lib/engine/prompts/artefact-types.ts`) carries only `title` and `body` — no `number` field.
- **Suggested action:** Add `number: number` to `LinkedIssueSchema` and the `LinkedIssue` type; update `fetchLinkedIssues` in the adapter to include the issue number; change the deduplication key in `mergeRawArtefacts` to use `issue.number`. Update test fixtures and the corresponding port interface.

---

### W2 — ADR-0012 "Options Considered" section references a stale model string

- **Location:** `docs/adr/0012-llm-client-interface-and-model-default.md`, Option D description
- **Issue:** The Options Considered section states "currently `claude-sonnet-4-20250514`". The Decision section and `src/lib/engine/llm/client.ts:43` both use `claude-sonnet-4-5-20250514`. The Options Considered section was not updated when the model was finalised, leaving the ADR internally inconsistent.
- **Suggested action:** Update Option D in ADR-0012 to replace `claude-sonnet-4-20250514` with `claude-sonnet-4-5-20250514`.

---

### W3 — Phase 2 web application is fully designed but has no implementation

- **Location:** `docs/design/lld-phase-2-web-auth-db.md` (v0.3, comprehensive), `src/app/` (only `layout.tsx` and `page.tsx` exist)
- **Issue:** The LLD specifies a complete set of implementation artefacts including auth routes (`/auth/callback`, `/auth/sign-in`, `/auth/sign-out`), middleware (`src/middleware.ts`), org sync (`src/lib/supabase/org-sync.ts`), API routes (`/api/assessments`, etc.), and UI pages. None of these files exist. Only the Supabase SSR client files have been implemented (`server.ts`, `route-handler.ts`, `middleware.ts`, `service-role.ts`, `env.ts`).
- **Suggested action:** Expected for Phase 0.5. Flag as a Phase 2 delivery requirement.

---

### W4 — No integration tests for API routes or webhook handler

- **Location:** `tests/` (no API route integration tests); `tests/e2e/` (one skeleton test at `home.e2e.ts`)
- **Issue:** ADR-0009 specifies 70% integration test coverage for API routes and webhooks. No integration tests exist for any API route — only engine unit tests, Supabase client tests, and migration schema tests. The test diamond strategy is not yet being realised for the API layer.
- **Suggested action:** Expected for Phase 0.5. API integration tests must be written alongside (or before) route implementations in Phase 2 per TDD discipline.

---

### W5 — Email service for Story 3.2 has no design decision or LLD coverage

- **Location:** `docs/design/v1-design.md`, Component 5 (Email Service): "V1 approach TBD — could be Supabase Edge Functions + Resend, or a simple transactional email service."
- **Issue:** Story 3.2 (FCS Participant Notification) has concrete acceptance criteria (invitation email with feature name, repo, question count, link; single reminder after configurable timeout). No ADR covers the email provider choice. No LLD section covers implementation. This is a design gap that must be closed before Phase 3 (FCS flow) implementation begins.
- **Suggested action:** Create an ADR for the email service provider decision. Add a section to a Phase 3 LLD covering the notification trigger, email template, and reminder scheduling.

---

### W6 — OAuth scope requirement conflicts between requirements and ADR-0003

- **Location:** `docs/requirements/v1-requirements.md` Story 5.1 ("Minimum OAuth scopes: `read:user`, `read:org`") vs `docs/adr/0003-auth-supabase-auth-github-oauth.md` ("OAuth scopes: `user:email` + `read:org`")
- **Issue:** `read:user` and `user:email` are distinct GitHub OAuth scopes. `user:email` grants access to private email addresses; `read:user` grants read access to the full user profile. The ADR is more precise and is the decision document. A developer implementing the OAuth flow from the requirements alone would configure the wrong scope.
- **Suggested action:** Update Story 5.1 acceptance criteria to use `user:email` to match ADR-0003. If the broader `read:user` scope is intentional, update ADR-0003 and document the rationale.

---

### W7 — `supabase/schemas/` declarative schema directory described but not created

- **Location:** `docs/design/lld-phase-2-web-auth-db.md §2.1`, "Declarative schema adoption" subsection
- **Issue:** The LLD describes a schema workflow change: create `supabase/schemas/` with `tables.sql`, `functions.sql`, and `policies.sql` as the authoritative schema source; generate migrations via `supabase db diff`. The directory does not exist. Hand-written migration files continue to be the primary authoring mechanism.
- **Suggested action:** Either implement the `supabase/schemas/` directory as specified, or update the LLD to record this as explicitly deferred with rationale.

---

## Informational

- **I1 — Story 3.6 reassessment endpoint explicitly deferred post-MVP.** `lld-phase-2-web-auth-db.md §2.1` records this as an implementation note. The `is_reassessment` column is retained as scaffolding. No action needed.
- **I2 — Epic 7 (PR Decorator, V2) has no design, ADR, or LLD.** Correct — V2 features explicitly have no L4 design. No action until V2 scoping begins.
- **I3 — `lld-artefact-pipeline.md` open question #1 (token estimation: `chars / 4` heuristic) acknowledged as unresolved.** Low risk given the generous (100k of 200k) token budget.
- **I4 — `lld-artefact-pipeline.md` open question #3 (FCS multi-PR token budget with global truncation) acknowledged as unresolved.** No known risk; impact unknown until real usage.
- **I5 — `maxFiles: 10` is hardcoded in `src/lib/github/artefact-source.ts`.** Not per-org configurable in V1. Matches `lld-artefact-pipeline.md §2.3` ("Default `maxFiles: 10`"). Acknowledged as a V1 simplification.
- **I6 — `docs/design/v1-design.md` status is "Draft" despite containing all four approved design levels.** Consider updating status to "Approved" to signal its authority as the governing L4 design document.
- **I7 — `assessments.artefact_quality` has no DB-level CHECK constraint.** The migration defines this as `text` with no enum constraint. The engine enforces the five valid `ArtefactQuality` values at the TypeScript / Zod layer, but invalid values could be inserted via direct SQL or service-role bypasses. Low risk in V1 given the controlled insertion paths.
- **I8 — Question generation fixture assigns `design_justification` to a question that reads as `world_to_program`.** `tests/fixtures/llm/question-generation.ts` assigns `naur_layer: 'design_justification'` to "What does this change do at a high level?" — which tests domain intent rather than structural decisions. Low risk (test fixture only) but could mislead future Naur-layer-aware test assertions.

---

## Coverage Matrix

| Epic | Stories | Designed | ADR'd | Code implemented | Tests | Coverage |
|------|---------|----------|-------|-----------------|-------|----------|
| Epic 1: Org Setup & Config | 5 (1.1–1.5) | Yes — v1-design.md L1–L4; lld-phase-2-web-auth-db.md §2.1, §2.3 | ADR-0001, 0003, 0004, 0006, 0007, 0008 | Schema only (migrations 1–4, 20260316–17); no app code | Migration schema integration tests | 20% |
| Epic 2: PRCC Flow | 9 (2.1–2.9) | Yes — v1-design.md L1–L4 §3.1, §4.4–4.8; lld-phase-2-web-auth-db.md §2.4 | ADR-0001, 0006, 0007, 0011, 0013 | `GitHubArtefactSource` complete; webhook handler, Check Run, scoring trigger not started | Unit: `artefact-source.test.ts`; no webhook/API tests | 25% |
| Epic 3: FCS Flow | 6 (3.1–3.6) | Yes — v1-design.md §3.2; lld-phase-2-web-auth-db.md §2.4; lld-artefact-pipeline.md | ADR-0005, 0011, 0013 | Engine layer complete (reused from Epic 4); FCS creation UI, notification, self-view API not started | Unit: pipeline tests | 20% |
| Epic 4: Assessment Engine | 5 (4.1–4.5) | Yes — v1-design.md §4.5–4.6; lld-artefact-pipeline.md (full) | ADR-0010, 0011, 0012 | Complete — LLM client, schemas, artefact types, classify-quality, truncate, prompt-builder, generate-questions, score-answer, detect-relevance, calculate-aggregate, assess-pipeline, `GitHubArtefactSource` | Full unit coverage; MSW integration for GitHub adapter | 90% |
| Epic 5: Web App & Auth | 4 (5.1–5.4) | Yes — lld-phase-2-web-auth-db.md §2.2–2.5; v1-design.md §3.3–3.4, §4.4 | ADR-0002, 0003, 0004 | Supabase SSR clients complete; auth routes, org-sync, API routes, UI pages not started | Unit: `supabase-ssr-clients.test.ts` | 15% |
| Epic 6: Reporting & Results | 4 (6.1–6.4) | Yes — v1-design.md §4.4 (response shapes); lld-phase-2-web-auth-db.md §2.4 | ADR-0005 | Not started | None | 0% |

---

## Recommendations

Listed in priority order:

1. **[Critical] Amend ADR-0008** to reflect the revised `participant_answers` schema introduced by the ADR-0005 Option 4 decision. Add a note recording that `score`, `score_rationale`, and `is_reassessment` were added in migration `20260316000001`, and that RLS restricts score reads to the owning participant.

2. **[Critical] Correct ADR-0013 Consequences** to reference `repository_config` rather than `repositories` as the table receiving `context_file_patterns`. Cross-reference migration `20260317000001`.

3. **[Warning] Fix linked-issue deduplication** in `src/lib/github/artefact-source.ts` to use issue number as the deduplication key. Add `number: number` to `LinkedIssueSchema` and propagate the change through the adapter and test fixtures.

4. **[Warning] Resolve the OAuth scope discrepancy** between Story 5.1 (`read:user`) and ADR-0003 (`user:email`) before implementing the auth callback route.

5. **[Warning] Create an ADR and LLD section for the email service** before Phase 3 (FCS flow) implementation begins.

6. **[Warning] Fix the internal inconsistency in ADR-0012** by correcting the model name in the Options Considered section from `claude-sonnet-4-20250514` to `claude-sonnet-4-5-20250514`.

7. **[Warning] Decide the fate of `supabase/schemas/`** — implement the declarative schema directory or explicitly defer it in the LLD with rationale.

8. **[Info] Update `docs/design/v1-design.md` status** from "Draft" to "Approved" or "Stable".
