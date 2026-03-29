# Drift Report: Requirements ↔ Design ↔ Code

**Scan date:** 2026-03-28
**Project phase:** Phase 0.5 — Scaffolding & Infrastructure (active MVP delivery; Epics 3–5 partially implemented, Epic 2 deferred)

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 4 |
| Warning  | 9 |
| Info     | 6 |

**Overall drift score:** V1 Epic 1–6 requirements (32 stories) have design coverage at L3/L4 level via `v1-design.md` and `lld-phase-2-web-auth-db.md`. Implementation coverage is approximately 55% of V1 in-scope stories. Code-to-design fidelity is high for implemented modules, but three concrete implementation-vs-design mismatches were detected: a test mock targeting a superseded API endpoint, an invalid enum value in a test fixture, and stale class/env-var names in the LLD. One designed-but-unimplemented route (`GET /api/assessments/[id]/scores`) blocks a core feature.

---

## Critical Issues

### C1 — `tests/mocks/anthropic.ts` targets a superseded API endpoint and response format

- **Requirement:** ADR-0015 (accepted 2026-03-27) replaced `AnthropicClient` with `OpenRouterClient`. All LLM traffic now routes to `https://openrouter.ai/api/v1` using the OpenAI wire protocol.
- **Expected:** Test mocks for LLM calls should intercept `https://openrouter.ai/api/v1/chat/completions` and return OpenAI-format responses (`choices[0].message.content`).
- **Found:** `tests/mocks/anthropic.ts` intercepts `https://api.anthropic.com/v1/messages` and returns Anthropic-native format (`content: [{ type: 'text', text: ... }]`). The `OpenRouterClient` uses the OpenAI SDK, which neither calls that URL nor parses that response shape.
- **Impact:** Any test that imports `mockClaudeMessages` and uses MSW HTTP interception will intercept the wrong URL and receive a response in the wrong format. The `client.test.ts` file currently bypasses this by injecting a `MockOpenAI` client directly — but any future integration or E2E test exercising the full stack via HTTP interception will silently produce `malformed_response` errors. The file is a live trap.

### C2 — `lld-phase-2-web-auth-db.md` specifies `AnthropicClient` and `ANTHROPIC_API_KEY` in the `buildLlmClient` contract

- **Requirement:** ADR-0015 mandates `OpenRouterClient` and `OPENROUTER_API_KEY`. The live implementation in `src/lib/api/llm.ts` correctly reads `OPENROUTER_API_KEY` and returns an `OpenRouterClient`.
- **Expected:** The LLD `buildLlmClient` private helper description to reference `OpenRouterClient` and `OPENROUTER_API_KEY`.
- **Found:**
  - `docs/design/lld-phase-2-web-auth-db.md` line ~884: `buildLlmClient() — constructs AnthropicClient from env; throws ApiError(500) if key absent`
  - Same file line ~998: `buildLlmClient(): LLMClient — factory; reads ANTHROPIC_API_KEY, returns AnthropicClient`
- **Impact:** A developer reading the LLD as implementation guidance will use the wrong env var and wrong class. The code is correct; the design is stale and misleading.

### C3 — Test fixture uses an invalid `naur_layer` enum value

- **Requirement:** The `assessment_questions.naur_layer` column has a DB constraint and a Zod enum (in `src/lib/engine/llm/schemas.ts` and `src/lib/supabase/types.ts`) permitting only: `'world_to_program'`, `'design_justification'`, `'modification_capacity'`.
- **Expected:** All test fixtures to use valid enum values.
- **Found:** `tests/app/api/assessments/[id].answers.test.ts` line 132 sets `naur_layer: 'program_to_domain'` on `QUESTION_2`. This value does not exist in the schema constraint or the Zod enum.
- **Impact:** The test currently passes only because the mock bypasses real validation. If this fixture is copy-pasted into an integration test or used with a real DB, it will cause a constraint violation. It also misleads any reader about valid enum values for this field.

### C4 — `GET /api/assessments/[id]/scores` is fully designed but not implemented, blocking Story 3.4

- **Requirement:** Story 3.4 — FCS self-directed private view. ADR-0005 (Option 4) specifically added the `score` and `score_rationale` columns to `participant_answers` and mandated this API endpoint.
- **Expected:** A route file at `src/app/api/assessments/[id]/scores/route.ts` implementing the self-view scores endpoint as specified in `lld-phase-2-web-auth-db.md` §2.4.
- **Found:** The route file does not exist. The LLD design is complete with a defined response shape. The DB columns exist (`score`, `score_rationale` confirmed in `src/lib/supabase/types.ts`). The MVP scope review lists issue #95 as deferred, but the LLD design section does not indicate the route is deferred.
- **Impact:** Story 3.4 self-directed view is entirely undeliverable from the frontend until this route exists. The feature is a core differentiator per ADR-0005 rationale and cannot be partially delivered.

---

## Warnings

### W1 — `v1-design.md` §4.1 `user_github_tokens` DDL is stale after the Vault migration

- **Location:** `docs/design/v1-design.md`, `user_github_tokens` table DDL
- **Issue:** The HLD still defines `encrypted_token text` and `key_id uuid` columns backed by pgsodium. Issue #84 (2026-03-23) migrated to Supabase Vault, changing the table to store `token_secret_id uuid` (a Vault secret reference). This is confirmed by `src/lib/supabase/types.ts`. The LLD documents the migration correctly (§2.2), but the parent HLD was not updated.
- **Suggested action:** Update the `user_github_tokens` DDL in `v1-design.md` §4.1 to replace `encrypted_token`/`key_id` with `token_secret_id uuid NOT NULL`. Add a cross-reference to issue #84 and the Vault migration rationale.

### W2 — `org_config` and `repository_config` HLD DDLs are missing the `context_file_patterns` column

- **Location:** `docs/design/v1-design.md` §4.1
- **Issue:** Both `org_config` and `repository_config` tables in the HLD DDL do not include `context_file_patterns`. The column exists in the live DB types (`src/lib/supabase/types.ts`) and is central to ADR-0013 (context file resolution strategy). The artefact pipeline LLD (`lld-artefact-pipeline.md` §2.5) describes its use but the parent HLD remains out of sync.
- **Suggested action:** Add `context_file_patterns text[] NOT NULL DEFAULT '{}'` to the `org_config` DDL and `context_file_patterns text[]` to the `repository_config` DDL in `v1-design.md` §4.1. Reference ADR-0013.

### W3 — ADR-0012 decision body still reads as if `AnthropicClient` is live without a clear in-body notice

- **Location:** `docs/adr/0012-llm-client-interface-and-model-default.md`
- **Issue:** The status header correctly says "Partially superseded by ADR-0015". However, the Decision and Consequences sections still read as live guidance for `AnthropicClient`, `ANTHROPIC_API_KEY`, and `claude-sonnet-4-5-20250514`. A developer consulting the ADR for implementation detail (rather than just the status line) will be misled.
- **Suggested action:** Insert a callout at the top of the Decision section: "Note: The concrete adapter described here (`AnthropicClient`, `ANTHROPIC_API_KEY`) was replaced by `OpenRouterClient` + `OPENROUTER_API_KEY` per ADR-0015 (2026-03-27). The `LLMClient` interface contract below remains unchanged."

### W4 — Deferred routes in `lld-phase-2-web-auth-db.md` §2.4 carry no deferral indicator

- **Location:** `docs/design/lld-phase-2-web-auth-db.md` §2.4
- **Issue:** The following routes are designed in full but not implemented, and have no deferral annotation in the LLD: `PUT /api/assessments/[id]` (skip/close — issue #60), `POST /api/assessments/[id]/reassess` (re-assessment — issue #60), `GET /api/assessments/[id]/scores` (self-view — issue #95). A developer reading §2.4 in order would implement these routes without knowing they are deferred.
- **Suggested action:** Add a "Status: Deferred — [issue]" inline note at the start of each deferred route section.

### W5 — Story 3.2 (email notification) remains TBD with no ADR or spike covering provider selection

- **Location:** `docs/design/v1-design.md` Component 5 (Email Service)
- **Issue:** The design explicitly states "V1 approach TBD — could be Supabase Edge Functions + Resend, or a simple transactional email service." The interaction diagram for FCS Phase 4 notification (§3.2) is complete, but there is no L4 contract and no provider selection decision.
- **Suggested action:** Before implementing Story 3.2, create an ADR or spike selecting the email provider. If email is out of scope for the current delivery phase, mark Component 5 explicitly as deferred.

### W6 — Story 3.6 deferral note is in the DB schema section, not near the API route design

- **Location:** `docs/design/lld-phase-2-web-auth-db.md` §2.1 (implementation note on `is_reassessment`); §2.4 `POST /api/assessments/[id]/reassess`
- **Issue:** The deferral of Story 3.6 is documented as an implementation note in the DB schema section (§2.1) but the API route design at §2.4 carries no deferral marker.
- **Suggested action:** Add a "Status: Deferred — issue #60" callout at the start of `POST /api/assessments/[id]/reassess` in §2.4.

### W7 — MVP scope review incorrectly states relevance validation was deferred

- **Location:** `docs/plans/2026-03-25-mvp-scope-review.md` §Deferred: Relevance Validation
- **Issue:** The scope review states "For MVP all answers are accepted and scored directly." However, `src/app/api/assessments/[id]/answers/service.ts` fully implements relevance detection (`detectRelevance()` calls), `relevance_failed` status, and the re-attempt loop. The deferral document has not been updated to reflect reality.
- **Suggested action:** Update the deferral section to note that relevance validation was implemented as part of the answer submission service (issue #59).

### W8 — V2 requirements (Epics 7–17) have no design coverage and several stories have open ambiguities

- **Location:** `docs/requirements/v2-requirements.md`
- **Issue:** All 11 V2 epics and 22 stories are requirements-only with no corresponding design documents, ADRs, or LLD sections. Story 7.3 has an explicit "format TBD" for structured response parsing and notes "Privacy implications require design review before implementation."
- **Suggested action:** Before beginning any V2 implementation, write an ADR for Epic 7 (PR Decorator) covering question generation prompt mode, GitHub PR comment authorship, configuration model, and privacy/surveillance framing.

### W9 — `lld-artefact-pipeline.md` (v0.2 Draft) carries no implementation status annotations

- **Location:** `docs/design/lld-artefact-pipeline.md`
- **Issue:** Unlike `lld-phase-2-web-auth-db.md`, this LLD has no implementation notes indicating which sections are live, partial, or deferred. The GitHub adapter `src/lib/github/artefact-source.ts` exists but the coverage is unclear from the document alone.
- **Suggested action:** Add implementation notes after each major section following the same convention as `lld-phase-2-web-auth-db.md`. At minimum, note which stories and sections are implemented versus deferred (e.g., multi-PR merge strategy — issue #48).

---

## Informational

- **I1:** `docs/design/v1-design.md` Component 4 still names "Anthropic Claude API" in the component diagram (§2). Should be updated to "OpenRouter (LLM Gateway)" per ADR-0015. Low priority, cosmetic only.

- **I2:** Issue #37 ("Track PR-centric field naming debt") — the `assessments` table uses `pr_number` / `pr_head_sha` even for FCS assessments where they are always null. This is an acknowledged naming inconsistency, not a new drift issue.

- **I3:** `tests/mocks/handlers.ts` may contain additional Anthropic intercept registrations. Should be audited as part of resolving C1.

- **I4:** `docs/design/spike-003-github-check-api.md` and `spike-004-supabase-auth-github-oauth.md` are not linked from the `v1-design.md` table of contents or from any ADR directly. They informed design decisions but are effectively orphaned references.

- **I5:** ADR-0012 Decision section references model string `claude-sonnet-4-5-20250514`; the live `DEFAULT_MODEL` in `src/lib/engine/llm/client.ts` is `anthropic/claude-sonnet-4-6`. The W3 callout handles the forward pointer; no separate action needed.

- **I6:** The MVP scope review (`docs/plans/2026-03-25-mvp-scope-review.md`) was written 2026-03-25 and reflects state at that time. Several items it lists as "open" have since been implemented (e.g., `POST /api/fcs`, scoring integration, navigation layout). Treat it as a historical snapshot.

---

## Coverage Matrix

| Epic | Stories | Designed (HLD/LLD) | ADR'd | Code implemented | Tests | Coverage |
|------|---------|-------------------|-------|-----------------|-------|----------|
| Epic 1: Org Setup & Config | 5 (1.1–1.5) | Yes — v1-design.md L1–L4, lld-phase-2-web-auth-db.md §2.3 | ADR-0001, 0004, 0008 | Stories 1.1, 1.2, 1.5 implemented; Stories 1.3, 1.4 config UI deferred | Unit tests for webhook, org sync, org-select | ~70% |
| Epic 2: PRCC Flow | 9 (2.1–2.9) | Yes — v1-design.md L3 §3.1, L4 §4.4 | ADR-0006, 0007, 0011 | None — entirely deferred per MVP scope review | None | 0% (deferred) |
| Epic 3: FCS Flow | 6 (3.1–3.6) | Yes — v1-design.md L3 §3.2, L4 §4.4; lld-phase-2-web-auth-db.md §2.4 | ADR-0005 | Stories 3.1, 3.3 implemented; Story 3.4 blocked by C4; Stories 3.2, 3.5, 3.6 deferred | Tests for FCS creation, answer submission, results page | ~50% |
| Epic 4: Assessment Engine | 5 (4.1–4.5) | Yes — v1-design.md L4 §4.6; lld-artefact-pipeline.md | ADR-0005, 0009, 0010, 0011, 0012, 0013, 0015 | All 5 stories implemented: question generation, scoring, relevance, aggregate, LLM error handling | Unit tests for all engine modules | ~95% |
| Epic 5: Web App & Auth | 4 (5.1–5.4) | Yes — v1-design.md L3 §3.3, L4 §4.4; lld-phase-2-web-auth-db.md §2.2–2.3 | ADR-0002, 0003, 0014 | All 4 stories implemented: GitHub OAuth, access control, answer UI, nav layout | Tests for auth callback, org sync, middleware, nav | ~85% |
| Epic 6: Reporting & Results | 4 (6.1–6.4) | Yes — v1-design.md L1 C7; lld-phase-2-web-auth-db.md §2.4 | — | Story 6.2 partially implemented (results page, aggregate score); Stories 6.1, 6.3, 6.4 deferred | Tests for results page | ~25% |
| V2 Epics 7–17 | 22 (across 11 epics) | No design documents exist | None | None | None | 0% (future scope) |

---

## Recommendations

Ordered by urgency and blast radius:

1. **Fix `tests/mocks/anthropic.ts` (C1 — Critical, medium effort).** Either delete if unused, or replace with an OpenRouter mock targeting `https://openrouter.ai/api/v1/chat/completions` with OpenAI-format responses. Audit `tests/mocks/handlers.ts` at the same time (I3).

2. **Fix `naur_layer: 'program_to_domain'` in test fixture (C3 — Critical, trivial effort).** Change `tests/app/api/assessments/[id].answers.test.ts` line 132 to a valid value — `'design_justification'` is the closest semantic match.

3. **Update `lld-phase-2-web-auth-db.md` stale references to `AnthropicClient` and `ANTHROPIC_API_KEY` (C2 — Critical, low effort).** Two places: lines ~884 and ~998. Change to `OpenRouterClient` / `OPENROUTER_API_KEY`.

4. **Implement `GET /api/assessments/[id]/scores` route (C4 — Critical, medium effort).** Story 3.4 self-directed view is a core V1 feature per ADR-0005. DB columns exist; LLD design is complete. Create `src/app/api/assessments/[id]/scores/route.ts` per LLD §2.4 contract and close issue #95.

5. **Update `v1-design.md` §4.1 `user_github_tokens` DDL (W1 — Warning, low effort).** Replace `encrypted_token`/`key_id` with `token_secret_id`. Reference issue #84.

6. **Add `context_file_patterns` to HLD DDL (W2 — Warning, low effort).** The column is live in the DB; the HLD never recorded it. Reference ADR-0013.

7. **Add "Status: Deferred" annotations to unimplemented routes in `lld-phase-2-web-auth-db.md` §2.4 (W4, W6 — Warning, low effort).** Add references to the governing issue for each deferred route.

8. **Update MVP scope review to reflect relevance validation is implemented (W7 — Warning, trivial effort).** The deferral section is now incorrect.

---

**Artefacts scanned:** `docs/requirements/v1-requirements.md`, `docs/requirements/v2-requirements.md`, `docs/design/v1-design.md`, `docs/design/lld-phase-2-web-auth-db.md`, `docs/design/lld-artefact-pipeline.md`, `docs/adr/0001`–`0015`, `docs/plans/2026-03-25-mvp-scope-review.md`, `src/lib/engine/llm/client.ts`, `src/lib/engine/llm/schemas.ts`, `src/lib/supabase/types.ts`, `src/app/api/webhooks/github/route.ts`, `src/app/api/assessments/route.ts`, `src/app/api/assessments/[id]/answers/service.ts`, `src/app/api/fcs/route.ts`, `src/lib/api/llm.ts`, `tests/mocks/anthropic.ts`, `tests/app/api/assessments/[id].answers.test.ts`, `tests/lib/engine/llm/client.test.ts`
