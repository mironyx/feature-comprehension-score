# Session — 2026-04-30 — /architect V11 E11.1

**Skill:** `/architect`
**Scope:** V11 plan, epic E11.1 (Project Management foundation)
**Plan input:** `docs/plans/2026-04-30-v11-implementation-plan.md`

## What ran

`/architect docs/plans/2026-04-30-v11-implementation-plan.md --epic E11.1` — produced design artefacts for the E11.1 foundation epic only. E11.2/E11.3/E11.4 deferred to subsequent `/architect` runs (per dependency: E11.1 must land first).

## Decisions

- **Decomposition (6 task issues).** E11.1 estimated total PR size well above the 200-line budget (~5 stories + schema + sign-in extension + 5 endpoints + 3 pages). Clean file-disjoint seams allowed splitting along the natural DB / auth / API / UI layers without creating awkward boundaries.
- **No new ADRs.** ADR-0027/0028/0029 already cover all cross-cutting decisions for this epic. Story-local choices (hard-delete-only-when-empty, partial-payload PATCH, snapshot shape) live in the LLD per the v11-design.md §"Decisions captured as ADRs" guidance.
- **Snapshot shape (recommended in LLD).** Picked `user_organisations.admin_repo_github_ids bigint[]` over a sibling junction table — single read in the gate helper, atomic upsert with the existing membership write, bounded by org repo count. ADR-0029 §1 explicitly delegates this choice to the LLD.
- **Story 4.2's `/projects` admin-only redirect** is implemented in T1.5 here (it would be churn to defer the guard). Noted in the LLD as a coupling refinement; E11.4 inherits without rework.
- **Project pages fetch via service calls, not HTTP self-fetch** — established repo pattern (issue #376). Service functions take `ApiContext` so the same code paths back both API and SSR.

## Artefacts produced

| Item | Path / link |
|------|-------------|
| LLD for E11.1 | `docs/design/lld-v11-e11-1-project-management.md` |
| Epic issue | #393 — epic: V11 E11.1 — Project Management foundation |
| T1.1 — Schema | #394 |
| T1.2 — Sign-in snapshot + gate | #395 |
| T1.3 — POST/GET /api/projects | #396 |
| T1.4 — GET/PATCH/DELETE /api/projects/[id] | #397 |
| T1.5 — /projects list + new pages | #398 |
| T1.6 — /projects/[id] dashboard + inline edit | #399 |

## Execution waves

- **Wave 1:** #394 (schema)
- **Wave 2:** #395 (consumes new column)
- **Wave 3:** #396 ∥ #397 (file-disjoint API)
- **Wave 4:** #398 (needs #396) ∥ #399 (needs #397)

## Parallelism vs kickoff's map

Kickoff's epic-level map has E11.1 as a foundation with no parallel partners. Internal task-level parallelism (T1.3 ∥ T1.4, T1.5 ∥ T1.6) does not affect that. **No plan patch needed.**

## Open questions

None blocking. The "New assessment" CTA on the dashboard depends on E11.2's `/projects/[id]/assessments/new` route — T1.6 will render it disabled with an inline comment until E11.2 ships.

## Suggested next step

Human reviews the LLD + 6 task issues, then `/feature` (or `/feature-team` for parallel waves) starts with #394.
