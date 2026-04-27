# Session Log — 2026-04-27 — Session 4 — Issue #366

## Issue

**[#366](https://github.com/mironyx/feature-comprehension-score/issues/366)** — feat: add repository from GitHub installation (POST API + modal)

**Epic:** [#360](https://github.com/mironyx/feature-comprehension-score/issues/360) — V8 Repository Management
**PR:** [#374](https://github.com/mironyx/feature-comprehension-score/pull/374)
**Branch:** `feat/add-repository-post-api`

---

## Work completed

### Edited files

- `src/app/api/organisations/[id]/repositories/route.ts` — added POST handler (imports `addRepository` and `AddRepoBody` from `./service`; ADR-0014 contract comment)
- `src/app/api/organisations/[id]/repositories/service.ts` — added exported types `AddRepoBody` / `AddRepoResponse`, exported `addRepository` (assertOrgAdmin + dedup SELECT + delegate to `insertRepository`), private `insertRepository` helper with justification comment
- `src/app/(authenticated)/organisation/add-repository-button.tsx` — replaced disabled T1 placeholder with functional `'use client'` component (loading state, 409 handling, router.refresh, network error catch)

### Tests

- `tests/app/api/organisations/[id].repositories.test.ts` — T2 section appended (13 new tests covering 403, 201 success shape, 409 dedup, 500 on dedup DB error, 500 on insert error)
- `tests/app/(authenticated)/organisation/add-repository-button.test.ts` — new file, 23 tests (loading label, disabled state, router.refresh, 409 message, generic error, network error, no error on success)
- `tests/evaluation/lld-v8-t2-add-repository.eval.test.ts` — 3 adversarial evaluator tests (INSERT payload includes `status: 'active'`, correct `org_id`, both repo fields)

**Tests added:** 39 | **Total suite after:** 163 tests (8 test files)

### Post-PR fixes

- `fix: handle dedup SELECT error in addRepository` — pr-review-v2 blocker: dedup `error` was silently dropped; added `existingError` capture + throw
- `fix: rename dedupError to existingError for clarity` — user feedback: `dedupError` misleads; renamed to pair with `data: existing`
- `fix: rename admin to adminSupabase in insertRepository for consistency` — user feedback: parameter named `admin` while callers use `adminSupabase`; renamed throughout

---

## Decisions made

1. **`insertRepository` extracted as private helper** — `addRepository` with inline insert exceeded the CLAUDE.md 20-line limit. Extracted `insertRepository`; added `// Justification:` comment. Noted as deviation from the LLD (which showed all three steps inline).

2. **`AddRepoBody`/`AddRepoResponse` exported from `service.ts`** — LLD showed them as route-level interfaces. Moving them to `service.ts` is the standard pattern (types live where they are used for the function signature) and makes the import explicit in `route.ts`.

3. **Dedup error must be captured** — LLD silently dropped `error` from the dedup SELECT (`const { data: existing } =`). Pr-review-v2 correctly flagged this as a silent error swallow. Fixed by capturing `existingError` and throwing `ApiError(500, ...)`.

4. **`BUTTON_CLASSES` constant** — long Tailwind class string extracted to module-level constant for readability; not a design change.

5. **`assertOrgAdmin` reused** — LLD showed inline admin check; implementation reuses the T1 helper, which is DRY and already tested.

---

## Review feedback addressed

- **Blocker:** silent discard of dedup SELECT error → captured `existingError` and added throw on DB failure
- No other blockers; pr-review-v2 posted a clean report after the fix

---

## LLD sync

Updated `docs/design/lld-v8-repository-management.md` §T2 (version 0.2 → 0.3):

- Corrected `addRepository` to show `assertOrgAdmin` reuse rather than inline query
- Corrected dedup block to capture `existingError`
- Added `insertRepository` private helper with justification
- Corrected contract types location: exported from `service.ts`, imported by `route.ts`
- Added `BUTTON_CLASSES` implementation note on `AddRepositoryButton`

---

## Cost

| Stage | Cost | Tokens (in/out/cache-read/cache-write) |
|-------|------|----------------------------------------|
| PR creation | $4.1533 | 1,552 / 57,984 / 7,856,673 / 319,177 |
| Final total | $7.5458 | 16,290 / 100,870 / 14,421,338 / 580,075 |
| **Post-PR delta** | ~$3.39 | review fix + naming fixes + lld-sync + feature-end |

---

## Cost retrospective

**Post-PR work (~$3.39)** was driven by:

1. **Silent error discard caught by pr-review** — the dedup SELECT was written without capturing `error`. Fix required a re-run of tests and a new push. _Action: when writing Supabase queries, always destructure both `data` and `error` — never drop `error` silently. Template: `const { data: X, error: XError } = await ...`_

2. **Two naming fix commits after PR** — `dedupError` and `admin` parameter were flagged by the user after PR creation. _Action: before committing, do a final read of all new variable and parameter names to check they are consistent with the surrounding codebase conventions._

3. **14 agent spawns** — test-author, 5× test-runner, evaluator, 3× pr-review agents, CI probe ×2, diag. Each re-sends the full diff. _Action: for Standard-pressure features, try to batch verification (run `vitest && tsc && lint` in one agent call rather than three separate test-runner invocations)._

---

## Next steps

- **Epic #360 complete** — both T1 (#365) and T2 (#366) are merged
- Next Wave 2 items: check board for the next Epic #360 follow-on or new epic tasks
