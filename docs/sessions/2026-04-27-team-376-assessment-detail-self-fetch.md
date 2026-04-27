# Session Log — 2026-04-27 — Issue #376: fix assessment detail self-fetch

_Session recovered from crashed teammate (original session: `dfbbb266-1f85-4abb-9be7-02ae8fbad310`)._

## Work completed

**Issue:** [#376](https://github.com/mironyx/feature-comprehension-score/issues/376) — fix: replace relative-URL self-fetch in /assessments/[id] page with direct Supabase loader  
**PR:** [#380](https://github.com/mironyx/feature-comprehension-score/pull/380)  
**Branch:** `feat/fix-assessment-detail-self-fetch`

### Root cause fixed

`fetchAssessmentDetail` in `page.tsx` called `fetch('/api/assessments/' + id)` — a relative URL inside a Next.js server component. Node.js `fetch` (undici) requires an absolute URL; relative paths throw `ERR_INVALID_URL`. The LLD §T2 (lld-v8-assessment-detail.md) and a code comment both incorrectly stated that Next.js patches global fetch for server components to resolve relative URLs. This is false — only route caching/deduplication is patched.

### Files created / modified

| File | Change |
|------|--------|
| `src/app/(authenticated)/assessments/[id]/load-assessment-detail.ts` | New — direct Supabase loader; thin wrapper over shared queries |
| `src/app/api/assessments/[id]/assessment-detail-queries.ts` | New — extracted from `route.ts`; shared by API route and page loader |
| `src/app/api/assessments/[id]/route.ts` | Refactored — delegates to `assessment-detail-queries.ts`; re-exports types |
| `src/app/(authenticated)/assessments/[id]/page.tsx` | Updated — calls `loadAssessmentDetail(supabase, adminSupabase, user.id, id)` |
| `tests/.../load-assessment-detail.test.ts` | New — 23 tests covering loader behaviour |
| `tests/.../role-based-rendering.test.ts` | Updated — mock updated to match direct loader signature |
| `docs/design/lld-v8-assessment-detail.md` | Corrected §T2 spec; added implementation notes; bumped to v0.3 |

**Tests added:** 23 — **Total tests:** 1,701 (139 files)

## Decisions made

1. **Direct loader over `NEXT_PUBLIC_APP_URL` workaround** — the alternative was to inject a base URL env var so the HTTP fetch could construct an absolute URL. Rejected: adds env var management overhead, doubles the auth round-trip, and adds an unnecessary HTTP hop. Direct Supabase query is faster, simpler, and consistent with the `load-assessments.ts` pattern already used by the Org page.

2. **Extract `assessment-detail-queries.ts`** — rather than duplicating the query logic in both `route.ts` and `load-assessment-detail.ts`, the shared module was extracted. This keeps both call sites thin and ensures the API route and page loader always agree on field names and shapes.

3. **`route.ts` re-exports types** — existing importers (`import type { AssessmentDetailResponse } from '@/app/api/assessments/[id]/route'`) continue to work without changes, as `route.ts` re-exports all public types from `assessment-detail-queries.ts`.

## LLD sync

LLD `docs/design/lld-v8-assessment-detail.md` updated (v0.2 → v0.3):
- Corrected §T2 prose: "relative fetch" → "direct Supabase loader"
- Updated code snippet to use `loadAssessmentDetail(supabase, adminSupabase, user.id, id)`
- Updated implementation note (#364) to reflect actual helper name
- Added new files to T2 file list
- Updated internal decomposition table to include `assessment-detail-queries.ts` and `load-assessment-detail.ts`

## Cost retrospective

| Stage | Cost | Tokens (in/out/cache-read/cache-write) |
|-------|------|----------------------------------------|
| PR creation (original session) | $3.9975 | 972 / 63,040 / 7,004,782 / 288,674 |
| Recovery + feature-end | $4.4532 | 3,260 / 58,061 / 7,859,443 / 369,422 |
| **Final total** | **$8.4507** | 4,232 / 121,101 / 14,864,225 / 658,096 |

**Primary cost driver:** Claude Code crash mid-session. The original session completed implementation cleanly (PR up in 29 min, $3.99). The recovery session re-ran lld-sync from scratch plus the full feature-end pipeline, nearly doubling the cost.

**No implementation fix cycles** — tests passed on the first run, no RED→GREEN iterations. The implementation was clean.

**Two agent spawns in recovery:** ci-probe (small) and lld-sync skill (medium). lld-sync is the largest single cost driver in the recovery session.

**Improvement actions:**
- Crash cost is unavoidable, but the delta ($4.45) is mostly lld-sync + feature-end overhead. Keeping PRs small (this was ~300 lines) limits recovery cost.
- lld-sync re-read all changed source files from scratch — if lld-sync ran during feature-core (before crash), recovery would be cheaper. Consider adding lld-sync as an explicit step in feature-core before PR creation.

## Next steps

None — issue #376 is closed. Epic [#359](https://github.com/mironyx/feature-comprehension-score/issues/359) continues with remaining V8 tasks.
