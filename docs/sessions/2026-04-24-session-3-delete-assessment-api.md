# Session 3 — 2026-04-24 — Delete Assessment API (#318)

## Summary

Implemented Story 3.1 of Epic 3 (V4 assessment deletion): `DELETE /api/assessments/[id]` endpoint
with RLS DELETE policy enforcing Org Admin authorisation via `is_org_admin(org_id)`. Built
exactly as specified in `docs/design/lld-e3-assessment-deletion.md §3.1` with no design
deviations.

PR: #320 (closes #318) — merged on feat/delete-assessment-api → main.

## Work completed

- **RLS policy** `assessments_delete_admin` added to `supabase/schemas/policies.sql` +
  generated migration `20260424121625_assessments_delete_admin_policy.sql`.
- **Service** `deleteAssessment(ctx, assessmentId): Promise<void>` in
  `src/app/api/assessments/[id]/delete-service.ts` — uses `ctx.supabase` (user-scoped) with
  `.delete().eq().select('id').single()` to distinguish 1-row success from 0-row
  not-found/denied; throws `ApiError(404)` on either failure mode.
- **Controller** — new `DELETE` export in `src/app/api/assessments/[id]/route.ts`,
  5-line body delegating to the service, 204 No Content on success.
- **Tests** — `tests/app/api/assessments/delete-assessment.test.ts` — 13 tests covering
  all 7 acceptance criteria and invariants I1–I3, enumerating every observable contract
  property (status variations, error paths, admin-client prohibition).
- **LLD sync** — added implementation note to §Story 3.1 confirming verbatim build;
  Document Control row updated.

## Decisions made

- **No deviation from LLD.** The design specified a single-query DELETE with `.select('id').single()`
  under user-scoped RLS as the cleanest way to couple existence-check + admin-authorisation.
  Implementation followed verbatim because the design was already minimal and correct.
- **Pressure-tier classification:** Standard — 48 src lines, new module. Warranted the
  full pipeline (test-author + evaluator agents) rather than the Light path.
- **Evaluator verdict:** PASS with no adversarial tests added. All 10 testable criteria
  (7 ACs + I1–I3) mapped to at least one passing test. The `test-author` agent enumerated
  14 contract properties; evaluator confirmed coverage without gaps.

## Review feedback addressed

`/pr-review-v2` returned `[]` — no blockers, no warnings. Single-agent path used because
85% of the 459-line diff was the new test file + generated migration (trivial-heavy diff).
No fix cycle needed.

## Verification

| Check | Result |
|-------|--------|
| `npx vitest run` | 1265 / 1265 passing (117 files) |
| `npx tsc --noEmit` | clean |
| `npm run lint` | clean |
| Playwright E2E (placeholder env) | 1 passed, 4 skipped (auth'd flows require real env) |
| CI (all jobs) | pass (run 24889540817) |

## Cost

- **At PR creation:** $4.5846 (902 in / 30,273 out / 5.85M cache-read / 232K cache-write)
- **Final total:** $9.8460 (1,017 in / 45,372 out / 10.98M cache-read / 614K cache-write)
- **Delta (post-PR):** $5.2614 — covered pr-review comment, ci-probe, lld-sync, session log, and /feature-end

## Cost retrospective

### Drivers

| Driver | Detected | Impact |
|--------|---------|--------|
| Agent spawns | test-author (1), feature-evaluator (1), pr-review single-agent (1), ci-probe (1) | Medium — each re-sends the diff, but the Standard-tier flow requires all of them |
| Diagnostics fallback | No `.diagnostics/` folder in worktree + CodeScene MCP unavailable → manual code-quality review | Low — skipped the diag loop, saved one round |
| Repeated "tasks tools haven't been used" nudges | Appeared after many tool calls | Zero marginal — ignored per meta-guidance |
| Build retry on env var | First `npm run build` failed on missing `GITHUB_WEBHOOK_SECRET` | Low — one re-run with placeholder |
| Playwright browser install | Worktree started without chromium cached | Low — one-time 110 MiB download, not session-cost |

### Improvement actions

- **Worktree bootstrap can pre-cache Playwright.** The session-tag step runs `npm install` implicitly;
  adding `npx playwright install chromium` to the worktree setup (or documenting the env-var set) would
  save one fix-cycle on feature branches that run the E2E suite.
- **Document `GITHUB_WEBHOOK_SECRET` as a placeholder-eligible env var** in CLAUDE.md alongside the
  existing Supabase placeholders — currently teams hit "Missing GITHUB_WEBHOOK_SECRET" on first build.
- **`/compact` can't be invoked from a skill.** `feature-core` Step 10b asks the agent to run
  `/compact`, but it's a built-in CLI command and the `Skill` tool rejects it. Either (a) remove
  the step, or (b) reword it as "end your message with a `/compact` reminder line." Worth fixing
  in `.claude/skills/feature-core/SKILL.md`.
- **LLD quality is paying off.** Second issue in a row where the LLD needed no corrections
  (see also #317 architect session). Keep this pattern.

## Next steps

- Story 3.2 (#319) — UI delete action on organisation page. Blocked on #318 (now merged);
  can be picked up next.
- No follow-up items from this issue.
