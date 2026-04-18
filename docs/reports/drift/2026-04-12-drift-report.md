# Drift Report: Requirements ↔ Design ↔ Code

**Scan date:** 2026-04-12
**Scanner:** requirements-design-drift agent
**Project phase:** Phase 0.5: Scaffolding & Infrastructure

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3 |
| Warning  | 7 |
| Info     | 6 |

**Overall drift score:** Approximately 67% of V1 requirements have full design-to-code coverage (Epics 3–5 and the Onboarding & Auth area). The remaining 33% comprises Epics 2 and 6 (zero code, full design) and partial stories within Epics 3 and 5 — all appropriate for Phase 0.5.

**Resolved since last scan (2026-04-01):**

- C1 — `organisation_contexts` missing from TypeScript types: resolved; `types.ts` now includes the table.
- C2 — `v1-design.md` omitting `rubric_failed` from status enum: resolved; both the DDL section and `AssessmentStatus` type alias now include `rubric_failed`.
- C3 — LLD reference to `service-role.ts` filename: resolved in active LLDs; `lld-phase-2-web-auth-db.md` is correctly marked superseded.
- W6 — artefact quality hardcoded to `code_only`: resolved; `classifyArtefactQuality(raw)` is now called at `src/app/api/fcs/service.ts:282`.
- W3 — `v1-design.md` Component 4 still named "Anthropic Claude API": resolved; Component 4 is now titled "OpenRouter (LLM Gateway)" in v1-design.md v0.9.

---

## Critical Issues

### C1: `fetchRepoInfo` select string missing `installation_id` — runtime returns `undefined`

- **Requirement:** `docs/design/lld-onboarding-auth-client-migration.md` §4 states the Supabase select must be `organisations!inner(github_org_name, installation_id)`. The `RepoRow` interface in `src/app/api/fcs/service.ts` is typed as `{ github_org_name: string; installation_id: number }`. `toRepoInfo` at line 131 reads `repo.organisations.installation_id`.
- **Found:** Line 156 of `src/app/api/fcs/service.ts` selects only `organisations!inner(github_org_name)` — `installation_id` is absent from the SQL select string. A type cast (`as unknown as Promise<...>`) at line 158 suppresses the TypeScript type mismatch. At runtime, `repo.organisations.installation_id` is `undefined`, so `createGithubClient(undefined)` is called, which in turn calls `getInstallationToken(undefined)`.
- **Why tests pass:** `tests/app/api/fcs.test.ts` mocks the Supabase client and returns a fixture at line 144 that includes `installation_id: 42`. The mock bypasses the actual select string entirely, so the omission is never exercised.
- **Impact:** Every FCS assessment creation in production will call `createGithubClient(undefined)`. The installation token cache is keyed by `installationId` — a key of `undefined` means every FCS call shares a single cache slot, or the call throws depending on environment. Either path is incorrect. This is a latent production failure in merged code.
- **Artefact trail:** `docs/design/lld-onboarding-auth-client-migration.md` (Status: in progress, issue #192) — the client signature migration landed but the `fetchRepoInfo` select fix did not.

### C2: `lld-onboarding-auth-client-migration.md` is "in progress" with no record of remaining work or open issue

- **Requirement:** Per ADR-0018, an LLD in "in progress" status means active implementation. Once a task's PR merges, the LLD is revised to reflect the delivered state. The task this LLD covers (#192) appears partially merged.
- **Found:** `docs/design/lld-onboarding-auth-client-migration.md` retains `Status: in progress`. The `createGithubClient` signature migration has landed (the file at `src/lib/github/client.ts` now takes `installationId: number`), but the select-string fix has not. There is no open issue or board item tracking this gap.
- **Impact:** Engineers reading the LLD cannot tell whether #192 is blocked, partially merged, or abandoned. The C1 runtime bug above will persist until the remaining work is tracked and completed.
- **Suggested action:** Update the LLD status to "Partially implemented — select string for `fetchRepoInfo` incomplete (issue #192 open)". Verify issue #192 is on the board and in the correct status column.

### C3: `docs/design/github-auth-hld.md` is "Draft (pending human security sign-off)" — the primary auth security model is unapproved

- **Requirement:** `github-auth-hld.md` is designated the single source of truth for all GitHub token flows and the cross-org isolation model (superseding `v1-design.md` §3 in part). The document defines which code patterns are permitted and which create cross-org data leakage risk (§4.3 three-entry-point model).
- **Found:** The document header reads `Status: Draft (pending human security sign-off)`. The security model described in §4.3 — including the deferred mechanical guard (revoking `SELECT (installation_id)` from service role) — is already implemented in production-path code from Tasks 2, 3, and 5 of epic #176. The design document governing the security boundary has never received its required human approval gate.
- **Impact:** If a future reviewer disagrees with a design decision (e.g., the accepted risk of service-role free-form `installation_id` access), there is no record that the tradeoff was deliberate. The §4.3 cross-org isolation guarantee is consequential; running it without sign-off increases organisational risk surface.
- **Suggested action:** Schedule a human security review of `docs/design/github-auth-hld.md`. If approved as-is, change status to "Accepted". The document also mentions a follow-up CLAUDE.md rule ("Installation IDs have three entry points…") that has not been added to `CLAUDE.md`.

---

## Warnings

### W1: `lld-onboarding-auth-webhooks.md` has two open acceptance criteria with no tracking issues

- **Location:** `docs/design/lld-onboarding-auth-webhooks.md` §8
- **Issue:** Two criteria remain unchecked after the LLD was marked "Revised": (1) `organisations.installer_github_user_id` populated from `sender.id` on `installation.created` — marked "deferred → follow-up pending #179 merge"; (2) assessments referencing a removed repo remain readable — marked "not explicitly tested — query-level coverage deferred". Neither has a corresponding open GitHub issue. The schema, `types.ts`, and `installation-handlers.ts` all confirm `installer_github_user_id` was never added.
- **Suggested action:** Create follow-up issues for each item. If `installer_github_user_id` is genuinely no longer needed (the first-install-race mitigation was descoped in `lld-onboarding-auth-cutover.md` §6), mark that criterion as "descoped" rather than leaving an open checkbox.

### W2: `fetchRepoInfo` uses `adminSupabase` (service role) instead of user-scoped client — violates HLD §4.3 edge E3

- **Location:** `src/app/api/fcs/service.ts`, lines 152–165
- **Issue:** `github-auth-hld.md` §4.3 (edge E3) and `lld-onboarding-auth-client-migration.md` §4 both state that `fetchRepoInfo` must use the user-scoped Supabase client so RLS enforces org membership at the point of reading `installation_id`. The implementation passes `adminSupabase` (service role, bypasses RLS). The cross-org isolation guarantee for the FCS path depends on `assertOrgAdmin` being called first — if it is removed in a refactor, `fetchRepoInfo` would silently serve any org's `installation_id` to any authenticated user.
- **Suggested action:** This fix is part of the unfinished task #192. Extend `fetchRepoInfo` to accept a user-scoped client for the org/repo lookup.

### W3: ADR-0012 body references `AnthropicClient` and old model name after partial supersession

- **Location:** `docs/adr/0012-llm-client-interface-and-model-default.md`
- **Issue:** ADR-0012 discusses `AnthropicClient` and a model string (`claude-sonnet-4-5-20250514`) that were replaced by ADR-0015. The header is correctly annotated "Partially superseded by ADR-0015" but the body is not annotated at the specific paragraphs. A reader following ADR-0012 to understand the current implementation will be misled.
- **Suggested action:** Add inline supersession callouts at the paragraphs that reference `AnthropicClient` and the old model string.

### W4: ADR-0015 Consequences section lists follow-up items as pending when they are complete

- **Location:** `docs/adr/0015-openrouter-as-llm-gateway.md`, Consequences section
- **Issue:** Follow-up items noted in the Consequences section (e.g., "Update `src/lib/engine/llm/client.ts` — replace `AnthropicClient` with `OpenRouterClient`") have been completed but the ADR still reads as if they are pending.
- **Suggested action:** Add a "Completed (issue #N / PR #N)" note against each delivered follow-up.

### W5: Epics 2 (PRCC) and 6 (Reporting) have full design contracts but zero implemented code

- **Location:** `docs/design/v1-design.md` §3.1, §3.4, §3.5; `src/app/api/webhooks/github/route.ts`
- **Issue:** Stories 2.1–2.9 (PRCC trigger, check run creation, scoring gate, skip, metadata export) and Stories 6.1–6.4 (results pages, org overview, repo assessment history) have L1–L4 design coverage in `v1-design.md`. The webhook handler exists and verifies signatures but no `pull_request.*` event is handled. No results-page routes exist. This is an expected gap in Phase 0.5, but explicit board items should reflect this.
- **Suggested action:** Confirm Epic 2 and Epic 6 issues exist on the board with appropriate priority ordering. No immediate action needed given current phase focus.

### W6: Stories 3.2 (email notifications), 3.5 (partial participation), and 3.6 (self-reassessment) have HLD-level design but no LLDs

- **Location:** `docs/design/v1-design.md` §C3; `docs/requirements/v1-requirements.md` Stories 3.2, 3.5, 3.6
- **Issue:** The HLD for Component 5 (Email Service) reads "V1 approach TBD". Story 3.2 (participant notification, 48h reminder) and 3.5 (close with partial participation) have no LLDs and no implementation. Story 3.6 (self-reassessment) was added in v0.9 (ADR-0005 revision, Option 4) with HLD coverage but no LLD. These are non-trivial V1 features requiring a technology decision before implementation.
- **Suggested action:** An ADR is needed for the email service provider before any of these stories can be designed at L4 or implemented. Create an ADR, then run `/architect` to produce LLDs.

### W7: `docs/design/lld-organisation-context.md` §6 (Settings UI, issue #158) remains a content-free placeholder

- **Location:** `docs/design/lld-organisation-context.md` §6
- **Issue:** The document explicitly defers §6 ("design will be written when #158 is scheduled"). The backend and API write path (issues #140, #157) are implemented. Users have no way to view or edit the organisation context from the UI. Issue #158 has no evident board status from the artefacts available.
- **Suggested action:** Create an issue for #158 if one does not exist, add it to the board, and write §6 when it is next prioritised. The deferred state is acceptable but should be tracked.

---

## Informational

- `docs/requirements/v2-requirements-proposed-additions.md` contains four planned insertions to `v2-requirements.md` that have not been merged into the main document. This is a dangling draft — apply and delete, or convert to a tracked change entry in the requirements change log.
- `docs/requirements/v1-prompt-changes.md` describes two prompt edits as a standalone document rather than as a directly applied change. Verify the changes are reflected in `src/lib/engine/prompts/prompt-builder.ts`; if so, delete the file. If not, apply the changes and delete.
- `docs/plans/2026-03-09-v1-implementation-plan.md` carries a supersession notice ("Superseded in part by epic #176 / ADR-0020") at the top. Several tests still cite it in comments (`// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.4`). No action needed now; update comment references during a future cleanup pass.
- `docs/design/frontend-system.md` has `Status: Draft — awaiting human approval`. The technology choices it describes (Tailwind, shadcn/ui, Syne + Outfit fonts, amber accent) are in active use. If they are considered finalised, update status to "Accepted". An ADR is not required (CLAUDE.md notes "No ADR required — all choices follow the skill's default recommendations") but the document should be approved.
- `docs/design/github-auth-hld.md` §4.3 mentions a CLAUDE.md rule ("Installation IDs have three entry points…") that should be added to `CLAUDE.md` under Coding Principles. This rule is the mechanical enforcement of the cross-org isolation principle. It has not been added.
- `docs/design/spike-003-github-check-api.md` and `docs/design/spike-004-supabase-auth-github-oauth.md` are historical research spikes that correctly informed ADR-0001 and ADR-0003. No action needed.

---

## Coverage Matrix

| Epic / Area | Stories | HLD Coverage | LLDs | Key ADRs | Code Implemented | Tests | Coverage |
|---|---|---|---|---|---|---|---|
| Epic 1: Org Setup & Config | 1.1–1.5 | Full (v1-design.md §C1, §4.1–4.3) | lld-phase-2-web-auth-db.md (historical); onboarding-auth webhook LLD | ADR-0001, ADR-0008, ADR-0020 | Webhook handler, installation handlers, DB schema, RLS | installation-handlers.test.ts, webhook.test.ts | 70% — config UI (1.3/1.4) not yet implemented |
| Epic 2: PRCC Flow | 2.1–2.9 | Full (v1-design.md §3.1, §4.4–4.8) | None | ADR-0006, ADR-0007, ADR-0011 | None | None | 0% — expected in Phase 0.5 |
| Epic 3: FCS Flow | 3.1–3.6 | Full (v1-design.md §3.2; ADR-0005) | lld-phase-2-demo-ready.md, lld-artefact-pipeline.md | ADR-0005, ADR-0011 | 3.1/3.3/3.4 implemented; 3.2/3.5/3.6 missing | fcs.test.ts, answering tests, results tests | 50% — email, partial participation, re-assessment unimplemented |
| Epic 4: Assessment Engine | 4.1–4.5 | Full (v1-design.md §4.2–4.5) | lld-artefact-pipeline.md | ADR-0009, ADR-0010, ADR-0012, ADR-0013, ADR-0015 | All modules: generate, score, relevance, aggregate, pipeline | Comprehensive unit tests | 100% |
| Epic 5: Web App & Auth | 5.1–5.4 | Full (v1-design.md §3.3; github-auth-hld.md) | onboarding-auth cutover/resolver/empty-state/telemetry/client-migration LLDs; frontend-system.md | ADR-0002, ADR-0003, ADR-0004, ADR-0014, ADR-0016, ADR-0020 | Auth callback, org-select, sign-in, middleware, org-membership | callback.test.ts, org-membership.test.ts, auth.test.ts | 80% — nav/layout (5.4) partial; HLD not yet approved (C3) |
| Epic 6: Reporting | 6.1–6.4 | Partial (v1-design.md §C7, L1 only) | None | None | None | None | 0% — expected in Phase 0.5 |
| Onboarding & Auth (O.1–O.6) | 6 stories | Full (req-onboarding-and-auth.md; github-auth-hld.md; 7 task LLDs) | lld-onboarding-auth-{app-permission, resolver, cutover, empty-state, webhooks, telemetry, client-migration} | ADR-0020 | O.1–O.5 implemented; O.6 customer guide exists | eval suites + unit tests per task | 85% — fetchRepoInfo select bug (C1); HLD not approved (C3); installer_github_user_id deferred (W1) |
| V2 Requirements (Epics 7–17) | 11 epics | Draft (v2-requirements.md) | None | None | None | None | N/A — correctly deferred |

---

## Recommendations

Ordered by impact:

1. **Fix the `fetchRepoInfo` select string (C1) before the next production release.** Add `installation_id` to the `organisations!inner(...)` select at `src/app/api/fcs/service.ts:156`. The correct string is `organisations!inner(github_org_name, installation_id)` per `lld-onboarding-auth-client-migration.md` §4. Update the mock in `tests/app/api/fcs.test.ts` to assert that `createGithubClient` receives a numeric value, not `undefined`. This is a production runtime failure in merged code.

2. **Obtain human security sign-off on `docs/design/github-auth-hld.md` (C3).** The document defines the cross-org isolation model and has been running in production without approval. Schedule a review. Add the CLAUDE.md "three entry points" rule from §4.3 of the HLD at the same time.

3. **Update `lld-onboarding-auth-client-migration.md` status and reopen or create issue #192 (C2).** Record the specific remaining work (select string fix + user-scoped client switch in W2). "In progress" is misleading for a document whose associated task has partially merged.

4. **Track deferred items from `lld-onboarding-auth-webhooks.md` in GitHub issues (W1).** Create an issue for the assessments-readable-after-removal test gap. Mark `installer_github_user_id` as "descoped" in the LLD acceptance criteria to match `lld-onboarding-auth-cutover.md` §6.

5. **Apply the E3 fix from W2 as part of resolving C2/issue #192.** Switching `fetchRepoInfo` to the user-scoped client makes the cross-org isolation guarantee structural rather than relying on `assertOrgAdmin` being present.

6. **Create an ADR for the email service provider before scheduling Stories 3.2, 3.5, or 3.6.** Component 5 remains "TBD" in `v1-design.md`. The ADR unlocks LLD authoring and implementation for these stories.

7. **Annotate stale claims in ADR-0012 and close out ADR-0015 follow-up items (W3, W4).** Minor documentation hygiene that prevents engineers from chasing replaced artefacts.
