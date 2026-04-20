# Session 2026-04-20 #2 — Issue #274 Pipeline Progress Visibility (E18.3)

**Issue:** [#274](https://github.com/mironyx/feature-comprehension-score/issues/274)
**Epic:** [#271](https://github.com/mironyx/feature-comprehension-score/issues/271) — V2 Epic 18 Pipeline Observability & Recovery
**PR:** [#276](https://github.com/mironyx/feature-comprehension-score/pull/276)
**Branch:** `feat/e18-progress-visibility` (worktree)
**Design reference:** `docs/design/lld-e18.md` §18.3

## Work completed

- Added `rubric_progress` + `rubric_progress_updated_at` columns to `assessments` (migration `20260420105844_add_rubric_progress_columns.sql`).
- `updateProgress(adminSupabase, assessmentId, orgId, step)` helper in `src/app/api/fcs/service.ts`, wired at each pipeline step boundary (`artefact_extraction` → `llm_request` → `llm_tool_call` → `rubric_parsing` → `persisting`).
- `finalise_rubric` RPC clears progress on success; `markRubricFailed` clears progress on failure.
- `onToolCall` callback plumbed through `src/lib/engine/llm/{tool-loop,tools}.ts`, `generation/generate-questions.ts`, `pipeline/assess-pipeline.ts` — engine stays framework-free; service layer provides the closure.
- `GET /api/assessments/[id]` exposes `rubric_progress` + `rubric_progress_updated_at`.
- Client: `poll-status.ts` returns `PollSnapshot`; `use-status-poll.ts` exposes progress + `timedOut`; `PollingStatusBadge` shows per-step label and stale warning (>240 s).
- Tests: 963 passing (103 files), including 4 adversarial `toSnapshot` tests the evaluator added.

## Decisions made

- **Tenant scoping on progress writes.** `adminSupabase` is the service-role client (bypasses RLS); `updateProgress` / `markRubricFailed` now filter by both `id` AND `org_id`. Mirrors the `p_org_id` contract already used by `create_fcs_assessment` and `finalise_rubric` RPCs. Added regression test asserting every progress UPDATE is dual-scoped.
- **`pendingWrites` over fire-and-forget.** LLD originally specified `void updateProgress(...)` inside `onToolCall`. Replaced with a `pendingWrites: Promise<void>[]` array collected in `finaliseRubric`, flushed via `Promise.allSettled` after `generateRubric` returns. Without this, a late-resolving tool-call write could land after `rubric_parsing` and silently clobber the step. `allSettled` preserves best-effort semantics.
- **`onToolCall` lands in 18.3 rather than 18.1.** The bridge is required by AC-3 of 18.3 (refresh `rubric_progress_updated_at` on every tool call). 18.1 will layer structured logging onto the same `ToolCallEvent` shape.
- **LLD-deviation helpers.** Three helpers extracted to satisfy the 20-line complexity budget: `makeToolCallProgressHandler`, `extractArtefacts`, `toSnapshot`. All carry `// Justification:` comments; LLD §18.3 captures the table.
- **Test-author mock fix.** The `test-author` sub-agent wrote inline `vi.mock('@/lib/github', ...)` inside an `it()` block; Vitest hoists `vi.mock` to the top of the file, silently breaking every other test. Restructured with `vi.hoisted()` + `MockGitHubArtefactSource` class sharing an `extractFromPRs` fn; per-test overrides now work via `mockRejectedValueOnce`.

## Review feedback addressed

- **`/pr-review-v2 276` (initial):** flagged race on fire-and-forget `updateProgress('llm_tool_call')`, plus missing justification comments on `makeToolCallProgressHandler` / `extractArtefacts`. Fixed in commit `a4d3e56` (pendingWrites flush + justifications + unrelated MD056 markdown fix in another session log blocking CI).
- **Human review — tenant isolation:** user pointed out that V2 req §17.1 (installation-token isolation) is preserved for tool calls, but `adminSupabase` writes still bypass RLS. Fixed in commit `38e39f6` — dual-scoped filters + regression test.

## Cost retrospective

- **Cost:** $25.33 final (9,206 input / 179,783 output / 33,633,233 cache-read / 948,926 cache-write tokens; 39 min to PR). Prometheus was reachable this run, so both PR-creation and final figures were captured.
- **Drivers observed this session:**
  - Context compaction mid-cycle (summary continuation). Session survived intact because PR was already open.
  - One fix cycle on independent-test-authorship mock hoisting (`vi.mock` inside `it()` block) — avoidable if test-author prompt explicitly warned against inline `vi.mock`.
  - Two PR-review cycles (initial findings → fix → re-review); one additional review round after human-spotted tenant-isolation gap.
  - Evaluator wrote 4 adversarial tests (over the report-only signal of 3), all targeting `toSnapshot` field-mapping the test-author missed.
- **Improvement actions:**
  - Tighten `test-author` prompt: forbid inline `vi.mock` inside `it()`; require top-level `vi.hoisted()` for per-test override slots.
  - Add an item to the review skill to check service-role clients are always paired with explicit `.eq('org_id', …)` filters.
  - When LLD prescribes a fire-and-forget `void`, reviewer should ask "can this resolve after the next state transition?" and add a flush if yes.

## Next steps / follow-up

- `/feature-end 274` will merge PR #276 and close the issue.
- Remaining Epic 18 work: #272 (18.1 — error capture & structured logging), #273 (18.2 — retry from UI). 18.1 layers `logger.info` onto the same `onToolCall`/`ToolCallEvent` shape landed here.
