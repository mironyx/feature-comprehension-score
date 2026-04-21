# Team Session — Epic 19: GitHub Issues as Artefact Source

| Field | Value |
|-------|-------|
| Date | 2026-04-21 |
| Lead | team-lead |
| Epic | #286 |
| Issues | #287, #282, #288 + follow-up #291 |

## Issues shipped

| Issue | Story | PR | Branch | Merged at |
|-------|-------|----|--------|-----------|
| #287 | Accept issue numbers at assessment creation (E19.1) | #289 | feat/e19-accept-issue-numbers | 2026-04-21 |
| #282 | Enhanced artefact extraction logging (E19.3) | #290 | feat/e19-enhanced-logging | 2026-04-21 |
| #288 | Discover linked PRs from issues (E19.2) | #292 | feat/e19-discover-linked-prs | 2026-04-21 |

## Cross-cutting decisions

**Sequential execution forced by shared `service.ts`.** Epic body declared all three waves sequential. No parallelism attempted — correct given every story touches `service.ts`.

**LLD was not pulled before validation.** `lld-e19.md` existed on `origin/main` (commit `809712f0`) but the main repo had not been fetched. Lead validated design references by checking the local filesystem only and incorrectly reported the LLD as missing. Root cause: Step 2 validation must run `git fetch` before checking referenced design files. Issue raised with user; fetch performed; Wave 3 proceeded correctly.

**Discrepancies report produced before lld-sync.** Teammates #287 and #282 ran without the LLD (reported it missing). After the LLD was fetched, lead compared LLD spec against merged PRs and produced a structured discrepancies report covering five divergences (D1–D5). Decision: fix D1/D2 (code bug) before running lld-sync, so the sync reflects correct final state.

**Follow-up issue #291 opened.** `validateIssues` returns `void`; `issue_title` is never captured or persisted despite the `fcs_issue_sources` table having the column. Tracked in epic #286 checklist for immediate follow-up.

**`RepoCoords` consolidation (Wave 3).** Teammate-288's first commit introduced a local `RepoRef` interface in `service.ts`, duplicating `RepoCoords` from `artefact-source.ts`. Caught in human review; fixed by extracting `RepoCoordsSchema` to the port so all three param schemas extend from a single base. No behaviour change.

## Coordination events

- Wave 1 spawned immediately; connection interruption required lead to nudge teammate-287 via SendMessage to resume.
- Wave 2 spawned after #289 merged; teammate-282 correctly noted missing LLD and derived tests from requirements doc.
- Lead incorrectly flagged LLD as missing before Wave 3 — user corrected; `git fetch` revealed it on `origin/main`.
- Wave 3 teammate-288 pushed a follow-up refactor commit after human review flagged duplicate type definitions.
- teammate-288 ran `/feature-end 288` autonomously (user triggered directly) before lead forwarded the message — lead's forwarded message arrived after completion; teammate correctly reported idempotent state.

## What worked

- Sequential wave gating worked cleanly — no merge conflicts across all three PRs.
- All three CIs green on first run (after the Wave 3 refactor push).
- Discrepancies report caught a real data bug (D1/D2) before lld-sync baked it in.
- Human review on Wave 3 caught a meaningful structural issue (`RepoCoords` duplication).

## What did not work

- Lead did not run `git fetch` before checking referenced design files — caused false "LLD missing" report and unnecessary user interruption.
- Session-log commit for #287 was pushed without `[skip ci]` — pre-existing memory rule not applied by teammate.
- `issue_title` not persisted (D1/D2) — slipped through TDD and evaluator because the test asserted row existence but not column values.

## Process notes for /retro

- **Validation step must `git fetch`** before checking for referenced files on disk. A reference in the issue body is not sufficient — the file must exist locally after fetching.
- **Persistence tests should assert column values**, not just row existence. `issue_title` missing would have been caught by: `expect(row.issue_title).toBe('Expected Title')`.
- **`[skip ci]` on docs commits** — teammate-287 missed this on the session-log commit. Should be enforced in the feature-end skill prompt or as a pre-commit reminder.
- **lld-sync order matters** — always fix code bugs before running lld-sync, or the sync enshrines the bug in the design doc.
