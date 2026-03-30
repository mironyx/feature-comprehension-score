# MVP Phase 2 Plan — Demo-Ready FCS Cycle

**Goal:** A human can demo the complete FCS cycle to someone — create assessment, participants answer questions, view scores — with structured logging for debuggability.

**Decisions confirmed:** 2026-03-29

---

## Context

MVP Phase 1 delivered the core engine, auth, assessment creation, answering, and scoring. First smoke test (2026-03-29) revealed:

1. **Access Denied bug** — `link_participant` RPC called with service-role client; `auth.uid()` returns NULL, so participant `user_id` never gets set.
2. **No observability** — 35+ ad-hoc `console.error` calls, no structured logging, no visibility into LLM prompts/responses.
3. **Naur layer prompt drift** — world-to-program questions ask about project history/motivation instead of domain-to-code correspondence per Naur's original framework.
4. **Missing UX polish** — no success feedback after creation, no rubric_generation status visibility, no retry for failed generation.
5. **No E2E test coverage** — no automated smoke test, no manual checklist.

Four bugs from the smoke test (#125, #127, #128, #129) were fixed on `main` but issues left open.

---

## Design approach

**Lightweight by default, formal where it matters.**

| Item type | Design artefact |
|-----------|----------------|
| Bug fix (simple) | Root cause + fix in issue body |
| Small feature | Acceptance criteria + approach in issue body |
| Cross-cutting decision | ADR |
| Domain/prompt change | Update existing design doc section |

Post-implementation: `/lld-sync` catches drift, `/pr-review` checks design conformance.

**Future improvement:** An `/architect` agent skill to produce upfront design for all items in a plan, enabling parallel `/feature` implementation after human design review.

---

## Items

### P0 — Blocking (demo cannot run without these)

| # | Item | Issue | Design needed | Dependencies |
|---|------|-------|---------------|--------------|
| 1 | Fix `link_participant` called with service-role client — `auth.uid()` returns NULL | New | No — one-line fix | None |
| 2 | Close already-fixed issues #125, #127, #128, #129 | Housekeeping | No | None |

**Root cause (item 1):** `src/app/assessments/[id]/page.tsx:127` calls `adminSupabase.rpc('link_participant', ...)`. The function uses `auth.uid()` to set `user_id`, but the service-role client has no user session. Fix: call with `supabase` (user's authenticated client). The function is `SECURITY DEFINER` so it bypasses RLS regardless.

### P1 — Demo flow (happy path works end-to-end)

| # | Item | Issue | Design needed | Dependencies |
|---|------|-------|---------------|--------------|
| 3 | Show assessments in `rubric_generation` status on assessments page | #130 | No — small UI state | None |
| 4 | Show success feedback after assessment creation | #131 | No — UI polish | None |
| 5 | Fix world-to-program prompt drift (Naur layer accuracy) | New | Yes — update prompt design in `v1-design.md` §4 | None |

**Prompt drift detail (item 5):** The system prompt in `src/lib/engine/prompts/prompt-builder.ts:14-15` defines world-to-program as "domain intent" with example patterns like "Why does this code exist?" This steers the LLM toward motivation/rationale questions rather than domain-to-code correspondence.

Per Naur's original framework (and the FCS article §"What gets tested"):
> The world-to-program mapping layer asks whether the team understands how **real-world affairs are reflected in the program structure** — which aspects of the domain the program handles, and why others were left out.

Fix: sharpen example patterns to focus on domain-object-to-code-structure mapping. Add negative guidance: do not ask about project history, file creation motivation, or development process.

### P1.5 — Question Quality (prompt improvements beyond drift fix)

| # | Item | Issue | Design needed | Dependencies |
|---|------|-------|---------------|--------------|
| 12 | Add question depth constraint — reject shallow recall-level questions across all Naur layers | #139 | No — spec in `docs/requirements/v1-prompt-changes.md` Change 1 | None |
| 13 | Organisation context — structured client customisation slots (domain vocabulary, focus areas, exclusions, domain notes) | #140 | No — spec in `docs/requirements/v1-prompt-changes.md` Change 2 | None |

**Question depth (item 12):** New constraint bullet in `QUESTION_GENERATION_SYSTEM_PROMPT`. Rejects questions answerable by reading code for 30 seconds. Tests understanding that persists after a developer moves on — architectural reasoning, design intent, domain understanding, safe change judgement. Applies across all three Naur layers.

**Organisation context (item 13):** Introduces `OrganisationContext` type with four structured slots (`domain_vocabulary`, `focus_areas`, `exclusions`, `domain_notes`). Injected into user prompt before code diff. Does not expose or compete with system prompt. Types in `artefact-types.ts`, formatting in `prompt-builder.ts`, exports from `index.ts`. UI surface is V1.x scope — backend schema only in Phase 2. See `docs/requirements/v1-prompt-changes.md` for full spec.

### P2 — Observability (can debug issues without guessing)

| # | Item | Issue | Design needed | Dependencies |
|---|------|-------|---------------|--------------|
| 6 | Add Pino structured logging — replace `console.error`, JSON to stdout | New | ADR (library choice, format, log levels, OTel path) | None |
| 7 | Log LLM prompts and responses in FCS service | New | Covered by logging ADR | Item 6 |

**Logging scope (items 6-7):**
- Replace all 35+ `console.error` calls with Pino structured logger.
- JSON output to stdout (Cloud Run / GCP Logging compatible).
- Request context: `requestId`, `userId`, `assessmentId` where available.
- LLM calls: log assembled artefact summary (file count, token estimate), full prompt, full response, latency.
- Log levels: `error` for failures, `warn` for degraded paths, `info` for LLM calls and assessment lifecycle events.
- OTel: design for future `pino-opentelemetry-transport` integration but do not implement in Phase 2.

### P3 — Resilience (obvious error cases handled)

| # | Item | Issue | Design needed | Dependencies |
|---|------|-------|---------------|--------------|
| 8 | Admin retry for failed rubric generation | #132 | Light — in issue body | Item 3 |
| 9 | Wrap multi-step DB writes in transactions | #118 | No — implementation concern | None |

### P4 — Testing (can verify the cycle repeatably)

| # | Item | Issue | Design needed | Dependencies |
|---|------|-------|---------------|--------------|
| 10 | Manual smoke test checklist | New | The checklist IS the deliverable | Items 1-5 |
| 11 | Automated Playwright smoke test (sign in → create → verify, mock LLM) | New | Light — in issue body | Items 1-5 |

**Test org:** User will create a separate GitHub org for realistic multi-participant testing. Steps documented in smoke test checklist.

---

## Implementation order

```
Phase 2a (unblock demo):     Items 1-2   — bug fix + housekeeping
Phase 2b (happy path):       Items 3-5   — UI polish + prompt fix
Phase 2b+ (question quality): Items 12-13 — depth constraint + org context
Phase 2c (observability):    Items 6-7   — structured logging
Phase 2d (resilience):       Items 8-9   — error handling
Phase 2e (testing):          Items 10-11  — smoke tests
```

Items within each sub-phase have no dependencies on each other and can be parallelised (once the `/architect` workflow is in place).

---

## Estimated effort

~5-6 focused sessions. Items 1-2 are quick wins (< 1 session). Items 3-5 are ~1 session each but parallelisable. Items 12-13 are ~1 session (12 is a one-liner, 13 is a small feature with types + formatting + tests). Items 6-7 are ~1 session. Items 8-11 are ~1-2 sessions.

---

## Requirements and design sync needed

| Document | Update needed |
|----------|--------------|
| `docs/requirements/v1-requirements.md` | Add observability/logging requirements (currently absent). Update story 3.1 acceptance criteria re: rubric_generation visibility. |
| `docs/design/v1-design.md` §4 (Assessment Engine) | Update Naur layer definitions in prompt design. Add negative guidance for world-to-program. |
| `docs/requirements/v1-prompt-changes.md` | Prompt change specs: question depth constraint + organisation context. Implementation-ready — no further design needed. |
| New ADR | Structured logging: Pino, JSON stdout, log levels, OTel readiness. |

---

## Process improvements (post-Phase 2)

- `/architect` skill — upfront design generation for plan items, enabling parallel `/feature` execution after human design review.
- Smoke test as CI gate — automated Playwright suite runs on every PR.

---

## Success criteria

1. A human can sign in, create an FCS assessment, answer questions as a participant, and view scores.
2. Generated questions correctly map to Naur's three layers (no project-history questions in world-to-program).
3. Generated questions test architectural reasoning and design intent, not shallow code recall.
4. Organisation context (when provided) influences question generation without exposing the system prompt.
5. Server logs show structured JSON with request context and full LLM exchange.
6. Manual smoke test checklist passes end-to-end.
7. Automated Playwright smoke test passes in CI.
