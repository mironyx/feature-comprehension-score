# Drift Report: Requirements ↔ Design ↔ Code

**Scan date:** 2026-04-01
**Project phase:** Phase 0.5: Scaffolding & Infrastructure / MVP Phase 2 (Demo-Ready FCS Cycle)

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| Warning  | 9 |
| Info     | 8 |

**Overall drift score:** Core V1 requirements (Epics 1–6) have partial design coverage — the FCS happy-path is well-covered by LLDs, but Epics 2, 3 (partial), 6, and several cross-cutting concerns remain design-only or not yet implemented. Of the implemented code, three structural mismatches were found between design contracts and source; three ADR stale-reference issues were found; and two design artefacts exist with no route back to the current requirements scope.

## Critical Issues

### C1: `organisation_contexts` table missing from generated TypeScript types

- **Location:** `src/lib/supabase/types.ts`
- **Expected:** The `organisation_contexts` table was added to `supabase/schemas/tables.sql` (issue #140, LLD `lld-organisation-context.md` §2). `src/lib/supabase/types.ts` is the generated type layer that all Supabase queries use. The table should appear in the `Tables` section of the `Database` interface.
- **Found:** The `organisation_contexts` table is entirely absent from `types.ts`. The `org-prompt-context.ts` helper queries this table using an untyped `SupabaseClient` (not `SupabaseClient<Database>`), which bypasses the TypeScript type system for all reads and writes on that table.
- **Impact:** Any typo in column names on `organisation_contexts` queries will fail at runtime with no compile-time warning. The design contract (LLD §5.2) explicitly notes the admin client is needed "because the `organisation_contexts` table is not in the generated Database types" — this was acknowledged as a constraint but the fix (regenerating types) was not applied. This is a latent runtime-failure risk on every query to `organisation_contexts`.

### C2: `v1-design.md` assessment status enum does not include `rubric_failed`

- **Location:** `docs/design/v1-design.md`, §4.1 (database schema DDL at line ~878) and §4.4 (`AssessmentStatus` type alias at line ~1424)
- **Expected:** `rubric_failed` was added to the DB status enum in issue #132 and is documented in `lld-phase-2-demo-ready.md` §2d.1. It is present in `supabase/schemas/tables.sql` and in `src/lib/supabase/types.ts`. The main design document (`v1-design.md`) is the authoritative L4 contract and should be the single source of truth for the status enum.
- **Found:** `v1-design.md` line ~878 lists `'generation_failed'` but not `'rubric_failed'`. The `AssessmentStatus` type alias at line ~1424 likewise omits `rubric_failed`. The schema, the TypeScript types, and the LLD are all consistent with each other — but the main design doc is stale.
- **Impact:** The main design document is the reference a new engineer reads to understand the system. It shows a status set that contradicts the live database. Any future migration or API contract review based on `v1-design.md` will miss `rubric_failed` and may incorrectly assume `generation_failed` is the sole failure terminal state.

### C3: LLD names service-role client file as `service-role.ts`; actual file is `secret.ts`

- **Location:** `docs/design/lld-phase-2-web-auth-db.md`, §2.2 (Supabase SSR client setup, line ~210 and line ~1473)
- **Expected:** The LLD specifies `src/lib/supabase/service-role.ts` as the service-role client file. It is referenced in multiple places throughout the LLD.
- **Found:** The actual file is `src/lib/supabase/secret.ts`. The export is `createSecretSupabaseClient()`, not `createServiceRoleSupabaseClient()`. No `service-role.ts` file exists anywhere in `src/lib/supabase/`.
- **Impact:** An engineer following the LLD to find the service-role client will look for `service-role.ts`, not `secret.ts`. This creates navigation friction and makes code-review against the design contract unreliable.

## Warnings

### W1: ADR-0012 contains stale model name and stale adapter name

- **Location:** `docs/adr/0012-llm-client-interface-and-model-default.md`
- **Issue:** ADR-0012 references `AnthropicClient`, `claude-sonnet-4-5-20250514`, and `api.anthropic.com`. These are all superseded by ADR-0015 (`OpenRouterClient`, `anthropic/claude-sonnet-4-6`). ADR-0012 is marked "Partially superseded by ADR-0015" but the body text has not been updated.
- **Suggested action:** Update the body to note supersession. Do not delete the ADR — its interface design rationale remains valid.

### W2: ADR-0015 references follow-up items as pending when they are complete

- **Location:** `docs/adr/0015-openrouter-as-llm-gateway.md`, Consequences section
- **Issue:** The Consequences section says "Follow-up: Update `src/lib/engine/llm/client.ts` — replace `AnthropicClient` with `OpenRouterClient`." This follow-up has been completed, but the ADR still reads as pending.
- **Suggested action:** Mark the follow-up items as done.

### W3: `v1-design.md` Component 4 still names "Anthropic Claude API" after ADR-0015 decision

- **Location:** `docs/design/v1-design.md`, §L2 Component 4 (line ~173)
- **Issue:** After ADR-0015, the integration point is OpenRouter, not Anthropic directly. The component boundary diagram needs updating.
- **Suggested action:** Rename Component 4 to "OpenRouter (LLM Gateway)" and cross-reference ADR-0015.

### W4: `lld-organisation-context.md` §6 (Settings UI, Issue #158) is a placeholder

- **Location:** `docs/design/lld-organisation-context.md`, line 34
- **Issue:** Issue #158 is referenced but has no design content. Any developer picking up #158 has no design contract.
- **Suggested action:** Add §6 content when #158 is scheduled, or add an explicit deferral note.

### W5: `e2e-seed.ts` `seedOrg` helper omits `context_file_patterns` from `org_config` insert

- **Location:** `tests/helpers/e2e-seed.ts`, line ~33–44
- **Issue:** The `seedOrg` function inserts an `org_config` row without specifying `context_file_patterns`. E2E tests will always use an empty pattern array, meaning the artefact pipeline will never fetch context files during E2E runs. This may hide bugs.
- **Suggested action:** Add `context_file_patterns: []` explicitly for clarity.

### W6: `triggerRubricGeneration` sets `artefact_quality: 'code_only'` hardcoded before classification

- **Location:** `src/app/api/fcs/service.ts`, line ~280
- **Issue:** The `artefact_quality` field is hardcoded to `'code_only'` before passing to `generateRubric`. The design (`lld-artefact-pipeline.md` §3.3) specifies that `classifyArtefactQuality(raw)` should be called first. The classification function exists in `src/lib/engine/prompts/classify-quality.ts` but is not being called from the service.
- **Impact:** Every FCS assessment stores `artefact_quality: 'code_only'` regardless of actual artefacts, making the quality signal meaningless.
- **Suggested action:** Call `classifyArtefactQuality(raw)` before constructing `AssembledArtefactSet`.

### W7: Transaction wrapping of multi-step DB writes (Phase 2d, Issue #118) status unclear

- **Location:** `docs/design/lld-phase-2-demo-ready.md`, §2d.2; `src/lib/github/installation-handlers.ts`
- **Issue:** `handleInstallationCreated` and `handleRepositoriesAdded` still use sequential multi-step DB writes without transaction wrapping. A partial installation event could leave the DB with an `organisations` row but no `org_config` row.
- **Suggested action:** Verify whether issue #118 addressed `installation-handlers.ts`. If not, create a follow-up issue.

### W8: `frontend-system.md` status is "Draft — awaiting human approval" with no issue backing it

- **Location:** `docs/design/frontend-system.md`
- **Issue:** Committed on 2026-04-01 with draft status. No GitHub issue referenced.
- **Suggested action:** Create a GitHub issue for the frontend design system implementation.

### W9: `v1-requirements.md` and `v1-design.md` not updated with observability cross-references

- **Location:** `docs/requirements/v1-requirements.md`, `docs/design/v1-design.md`
- **Issue:** The requirements appendix decision log lists ADRs 0001–0008 only; ADR-0016 (Pino structured logging) is not referenced. The design document does not mention Pino.
- **Suggested action:** Add ADR-0016 to the requirements appendix. Update `v1-design.md` infrastructure concerns section.

## Informational

1. **`console.error` / `console.log` calls remain in frontend files.** Three occurrences in `src/app/assessments/[id]/answering-form.tsx` and `src/app/(authenticated)/assessments/new/create-assessment-form.tsx`. ADR-0016 specifies no `console.*` in production code paths. These are client-side components where Pino cannot be used directly — may be acceptable but should be documented.

2. **Open question 7 in `lld-artefact-pipeline.md` (cross-section file deduplication) remains unresolved.** Flagged as "decision needed before FCS is built end-to-end." FCS is now live. Should be closed or tracked as a known limitation.

3. **Open question 3 in `lld-artefact-pipeline.md` (FCS multi-PR token budget approach) also remains open.** Should be resolved and closed.

4. **`lld-phase-2-web-auth-db.md` has accumulated 22 revision entries.** A periodic `/lld-sync` pass would help keep the spec and implementation narrative aligned.

5. **ADR-0017 schema DDL differs slightly from `tables.sql`.** ADR-0017 shows `UNIQUE (org_id, project_id)`; actual uses `UNIQUE NULLS NOT DISTINCT (org_id, project_id)`. Low risk since the LLD has the correct schema.

6. **`v2-requirements.md` and `v2-requirements-proposed-additions.md` exist with no design coverage.** Expected for V2 backlog items.

7. **`docs/reports/2026-04-01-process-retro.md` is untracked.** New file not yet committed. No action needed from a drift perspective.

8. **Issue #158 (Organisation Context Settings UI)** has no parent LLD coverage for the broader repository configuration UI (Story 1.3).

## Coverage Matrix

| Epic | Stories | Designed (LLD) | ADR coverage | Code implemented | Coverage |
|------|---------|----------------|--------------|------------------|----------|
| Epic 1: Org Setup & Config | 1.1–1.5 | Partial — 1.1 (webhook), 1.5 (multi-tenancy, DB/RLS) covered. 1.2–1.4 not LLD'd | ADR-0001, 0003, 0004, 0008, 0013, 0017 | 1.1: webhook ✓; 1.2: org-select ✓; 1.3–1.4: not built; 1.5: RLS ✓ | ~40% |
| Epic 2: PRCC Flow | 2.1–2.9 | `v1-design.md` L3/L4 covers PRCC flow; no dedicated LLD | ADR-0001, 0005, 0006, 0007 | Deferred — none implemented | 0% |
| Epic 3: FCS Flow | 3.1–3.6 | 3.1: full LLD. 3.2, 3.5 not LLD'd. 3.4: partial. 3.6: deferred | ADR-0005, 0008 | 3.1: ✓; 3.2: ✗; 3.3: ✓; 3.4: partial; 3.5–3.6: deferred | ~55% |
| Epic 4: Assessment Engine | 4.1–4.5 | `lld-artefact-pipeline.md` (full), `v1-design.md` §4.6 | ADR-0005, 0009–0012, 0015 | All engine modules implemented; quality classification bypassed (W6) | ~85% |
| Epic 5: Web App & Auth | 5.1–5.4 | `lld-phase-2-web-auth-db.md` §2.2–2.6; `frontend-system.md` (draft) | ADR-0003, 0004, 0014, 0016 | 5.1–5.4 all implemented | ~80% |
| Epic 6: Reporting & Results | 6.1–6.4 | High-level only; no dedicated LLD | ADR-0005 | 6.2: partial; 6.1, 6.3, 6.4: deferred | ~20% |
| Cross-cutting: Observability | N/A | ADR-0016 | ADR-0016 | Pino logger implemented; LLM call logging wired | ~90% |
| Cross-cutting: Org Context | Story 3.1 | `lld-organisation-context.md`, ADR-0017 | ADR-0017 | DB, engine, API write path ✓; Settings UI pending | ~70% |

## Recommendations (prioritised)

1. **Regenerate `src/lib/supabase/types.ts`** to include `organisation_contexts` (C1)
2. **Update `v1-design.md`** — add `rubric_failed` to status enum (C2), rename Component 4 to OpenRouter (W3)
3. **Sync `lld-phase-2-web-auth-db.md`** — `service-role.ts` → `secret.ts` (C3)
4. **Fix `triggerRubricGeneration`** to call `classifyArtefactQuality(raw)` (W6)
5. **Verify issue #118 scope** for `installation-handlers.ts` atomicity (W7)
6. **Update ADR-0012 and ADR-0015** stale references (W1, W2)
7. **Create GitHub issue for `frontend-system.md`** (W8)
8. **Close open questions 3 and 7 in `lld-artefact-pipeline.md`** (Info)
9. **Add ADR-0016 cross-references** to requirements and design docs (W9)
10. **Add LLD §6 to `lld-organisation-context.md`** when #158 is scheduled (W4)
