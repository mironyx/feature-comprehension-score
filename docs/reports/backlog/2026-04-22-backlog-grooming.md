# Backlog Grooming

**Date:** 2026-04-22
**Period since last grooming:** 2026-04-16
**Declared phase (CLAUDE.md):** `Phase 1: Core Feature Implementation — Assessment engine, GitHub integration, Supabase storage, API routes.`

## Summary

| Column | Count |
|--------|------:|
| Todo | 17 (actual open; 6 board entries are stale — closed issues) |
| In Progress | 0 |
| Blocked | 0 |
| Done (since last grooming) | 38 |
| Orphan issues (open, not on board) | 10 |
| Open issues total | 27 |

Backlog is in **amber** health. Delivery velocity is exceptional — 38 issues closed in 6 days across 5 epics (E11 shipped-then-reverted, E17, E18, E19, #294 nav separation). Board hygiene has degraded: 6 closed issues sit in the Todo column, 10 open issues are orphaned off the board, and the phase label is still stale from the previous grooming. V4 requirements were written today, introducing two new epics. The critical `finalise_rubric` org_id scoping bug (drift C1) remains unfixed.

## Phase accuracy

**CLAUDE.md phase label is stale — second consecutive grooming flagging this.**

Evidence:

- Declared: "Phase 1: Core Feature Implementation". Last grooming proposed "Phase 2: Productionising the FCS flow and expanding coverage."
- Since then, three full V2 epics shipped (E17, E18, E19), a V1 navigation/results epic shipped (#294), and V4 requirements were written. The project is well past Phase 1 by any measure.
- V1 baseline coverage is 74% of in-scope stories (2026-04-21 baseline). Remaining V1 gaps: PRCC (6%), FCS stories 3.2/3.5/3.6 (blocked on email ADR), Reporting 6.3/6.4 (not started).
- Activity is in a "requirements + quality refinement" mode — V4 prompt engineering, bug fixes from real assessments, view separation for real users.

Proposed `CLAUDE.md` edit (NOT actioned):

```
## Current Phase

**Phase 2 (in progress): Quality refinement and remaining V1 coverage.**
FCS manual cycle is live with agentic retrieval (E17), pipeline observability (E18),
GitHub issues as artefact source (E19), and role-based view separation (#294).
V4 prompt quality refinements in progress. Remaining V1: PRCC (Epic 2), Reporting
(Epic 6), email-dependent stories (3.2/3.5/3.6).
Tech stack unchanged: Next.js (App Router), TypeScript, Supabase (PostgreSQL + Auth + RLS),
OpenRouter (LLM gateway — see ADR-0015), GCP Cloud Run.
```

## Progress since last grooming (2026-04-16)

**Closed (38 issues):**

- **E11 Artefact Quality** (shipped then reverted): #233 epic, #234–#239 tasks
- **E17 Agentic Retrieval** (7 tasks): #240 epic, #243, #245, #246, #247, #249, #250, #251
- **E18 Pipeline Observability** (3 tasks): #271 epic, #272, #273, #274
- **E19 Issues as Artefact Source** (3 tasks + 1 fix): #286 epic, #287, #288, #282, #291
- **#294 Nav & Results View Separation** (3 tasks): #295, #296, #297
- **Bug fixes**: #261, #279, #280, #281
- **Epics closed**: #214 (Hints), #215 (Depth) — cleaned up in retro
- **Miscellaneous**: #241, #242, #244, #248 (E17 sub-tasks closed during epic completion)

**New issues created:**

- #278 — ADR-0025 adminSupabase audit
- #301 — compact before /feature-end experiment
- #302 — Results page LLM content markdown rendering (bug)

**New requirements:** V4 (`docs/requirements/v4-requirements.md`) — question generation quality + epic-aware artefact discovery. Two epics, 6 stories.

## Actions from previous grooming (2026-04-16)

| Proposal | Status | Notes |
|----------|--------|-------|
| Dogfooding re-run of FCS assessment post-v3 | **Partial** | Assessment ran 2026-04-21; revealed V4 quality issues (hint restating, depth leaking). No formal before/after report written yet. |
| Close epics #214 and #215 | **Done** | Closed in 2026-04-21 retro session. |
| Run `/drift-scan` | **Done** | 2026-04-21 drift report produced. Found C1 (finalise_rubric org_id). |
| Close/board-attach 7 orphan issues | **Not done** | Same 7 still orphaned, plus 3 new orphans (#266, #302, and #18 was removed from board then re-orphaned). |
| Email-service ADR | **Not done** | Sixth consecutive carry across retros + groomings. |
| PRCC epic decomposition | **Not done** | No architect run for PRCC. |
| Bus Factor Map MVP | **Not done** | No issue created. |
| Artefact-quality surfacing on results page | **Superseded** | E11 was built then reverted. `classifyArtefactQuality` text is shown; no numeric score. |
| AI-baseline on every assessment | **Not done** | |
| HLD security sign-off | **Done** | github-auth-hld.md header updated to "Accepted (human security sign-off 2026-04-12)" per drift resolution. |

## In-flight health

- **No issues in In Progress or Blocked.** Board lifecycle is Todo → Done only (consistent with previous observation).
- **#302** — bug filed today (LLM content markdown rendering). Already has a fix commit on `fix/results-formatting` branch but not merged to main.
- **#278** — ADR-0025 audit created 2026-04-21, no activity yet. Security hygiene task.
- **#301** — compact experiment created 2026-04-21, no activity yet. Process improvement.

## Backlog health findings

| # | Issue / artefact | Finding | Severity |
|---|---|---|---|
| 1 | Board: #66, #73, #241, #242, #244, #248 | Closed issues still in Todo column on the board. Board shows 23 Todo but only 17 are actually open. | Warning |
| 2 | #18, #33, #35, #36, #37, #145, #146, #171, #266, #302 | 10 open issues not on the board (orphans). #18 was removed from board in retro then never re-added or closed. #266 and #302 are new. | Warning |
| 3 | C1: `finalise_rubric` org_id scoping | Critical drift finding from 2026-04-21 scan. Both RPC overloads violate ADR-0025. No issue tracks the fix. | Critical |
| 4 | `fetchLinkedIssues` silent catch (W5) | `catch { return null; }` with no logging or comment. CLAUDE.md violation. No issue tracks the fix. | Warning |
| 5 | ADR-0012, ADR-0016 status stale | ADR-0012 body references `AnthropicClient` (W3). ADR-0016 still "Proposed" despite Pino in active use (I2). | Info |
| 6 | `retry-button.tsx` silent catch (I7) | `catch { setError('Network error'); }` — no explanatory comment. Low priority. | Info |
| 7 | `frontend-system.md` still "Draft" (I1) | Fourth consecutive scan. Blocked on human approval. | Info |

## Requirements coverage

### Current version (V1) gaps

| Requirement | Coverage | Status |
|---|---|---|
| **E2: PRCC Flow (2.1–2.9)** | 6% | Webhook handler exists; all PRCC logic unimplemented. No task issues. |
| **E3: FCS Stories 3.2, 3.5, 3.6** | 0% | Blocked on email-service ADR (sixth carry). |
| **E6: Reporting 6.3, 6.4** | 0% | Org Assessment Overview and Repository Assessment History not started. |
| **E5: Story 5.4 divergence** | Divergent | "My Assessments" shows all org assessments, not participant-scoped. Partially addressed by #294 (admin/participant view split) but the underlying query still doesn't filter by participant. |
| **Story 1.3: Repo config UI** | Partial | DB schema exists; no web UI for per-repo config. |

### V4 requirements (new today)

- **Epic 1: Question Generation Quality** (3 stories) — prompt-only changes to `prompt-builder.ts` and `score-answer.ts`. No issues created yet.
- **Epic 2: Epic-Aware Artefact Discovery** (3 stories) — GraphQL child-issue traversal from epics. No issues created yet.

### Parked future ideas

- **V2 Epics 7–10, 12–16** — correctly parked, no issues needed yet.
- **V2 proposed additions** (`v2-requirements-proposed-additions.md`) — dangling draft, not merged. Still Info-level.
- **V3** — 100% delivered and closed.

## Signals from reports

### From latest drift report (2026-04-21)

- **C1:** `finalise_rubric` missing `org_id` in UPDATE WHERE clause — **no issue tracks this.**
- **W2:** ADR-0023 still "Proposed" — **resolved in retro** (status changed to Accepted).
- **W3:** ADR-0012 stale `AnthropicClient` references — carried, no issue.
- **W4:** E11 LLD has no "Cancelled" marker — **resolved in retro** (status banner added).
- **W5:** `fetchLinkedIssues` silent catch — **no issue tracks this.**

### From latest retro (2026-04-21)

| # | Action | Status |
|---|--------|--------|
| 1 | Replace `gh run watch` with status polling in CI probe | Not done |
| 2 | Use `[skip ci]` on doc-only commits | Not done |

### From recent ADRs

- **ADR-0025** (service-role writes require org_id) — created this period. Follow-up audit issue #278 exists but not started. The `finalise_rubric` gap (C1) is the most urgent application.
- **ADR-0023** (tool-use loop) — accepted in retro. No follow-up.

### From bug report (2026-04-21)

`docs/requirements/bug-report-21-04-26.md` documents repeated `malformed_response` failures on tool-use assessments. Three attempts failed — two with JSON parse errors, one with loop turn cap exceeded. Root causes already fixed in #279 (response_format constraint) and #280 (retryable flag), but the bug report's observation about epic issues discovering zero PRs is the direct motivation for V4 Epic 2 (epic-aware discovery).

## Creative / research proposals

- **"Dogfooding re-run with V4 prompt refinements."** Source: session-log theme + creative. The 2026-04-21 assessment revealed V4 issues; once V4 Epic 1 ships, re-run the same epic assessment to validate the fix. This creates a three-point narrative arc: V3 calibration → V4 quality → measured improvement. High article value. Low effort.

- **"Comprehension debt benchmarking mode."** Source: research. The 2026 Anthropic study found AI-assisted developers scored 17% lower on comprehension quizzes (50% vs 67%). FCS could position as the first product that operationalises this finding. A "benchmark mode" that records pre/post AI-adoption FCS scores per team would be uniquely differentiating. Aligns with V2 Epic 15 (Benchmark Mode) but the framing is sharper now. [Ref: arxiv.org/abs/2604.13277]

- **"Assessment from epic" as the default workflow."** Source: creative + V4 Epic 2. Once epic-aware discovery ships, the natural unit for FCS assessment becomes "assess this epic" rather than "assess these PRs". This is a UX shift worth calling out — the creation form should prominently offer "Enter an epic issue number" as the primary input, with individual PRs/issues as fallback. Zero backend cost (V4 E2 handles it); pure UX priority.

- **"Silent catch audit."** Source: drift + CLAUDE.md. W5 and I7 flag two silent catches; there may be more. A quick `grep -r 'catch' src/` audit for catch blocks without logging or comments would be a 30-minute chore that closes a class of CLAUDE.md violations. Low effort, high hygiene value.

- **"Email-service decision (kill or commit)."** Source: sixth-consecutive carry. At this point, the email-service ADR has been carried for 7 weeks across 3 retros and 2 groomings. Either commit to an ADR (Resend, 1-day spike) or descope Stories 3.2/3.5/3.6 to V2. The paralysis costs more than either decision. Mark: creative.

- **"PR Decorator preview (V2 Epic 7, smallest slice)."** Source: creative + article positioning. When PRCC ships, a GitHub PR comment summarising the comprehension assessment is the most natural "meet developers where they are" feature. The Addy Osmani piece on comprehension debt and the arxiv paper both describe the problem in PR-centric terms. A PR comment decorator would make FCS visible where the debt accumulates. Aligns with V2 E7 but could be a tiny MVP slice.

## Recommended next (≥10 items, propose-only)

Scoring: `score = 0.4*value + 0.3*unblocks + 0.2*risk_of_drift + 0.1*(1 − effort)`

### Top priority (score ≥ 0.60)

| Rank | # / proposal | Title | Score | V | U | R | 1−E | Rationale |
|------|--------------|-------|------:|----:|----:|----:|----:|-----------|
| 1 | (new) | **fix: `finalise_rubric` org_id scoping (C1)** | 0.79 | 0.80 | 0.50 | 1.00 | 0.90 | Critical drift finding, ADR-0025 violation, one-line schema fix per overload. Security issue. |
| 2 | #302 | **fix: render LLM content with markdown formatting** | 0.72 | 0.80 | 0.30 | 0.60 | 0.95 | Already has fix on branch `fix/results-formatting`. Merge to main. |
| 3 | (new) | **Board hygiene: remove 6 closed issues from Todo, add 10 orphans or close** | 0.68 | 0.50 | 0.50 | 0.80 | 1.00 | Board is materially inaccurate — 23 shown vs 17 actual Todo. Orphan count grew from 7 to 10. ~15 min. |
| 4 | (new) | **V4 Epic 1: `/architect` + `/feature` for question generation quality** | 0.66 | 0.90 | 0.40 | 0.60 | 0.50 | Direct fix for issues found in real assessment. Three prompt-only stories. Unblocks dogfooding re-run. |
| 5 | (new) | **V4 Epic 2: `/architect` + `/feature` for epic-aware artefact discovery** | 0.64 | 0.85 | 0.60 | 0.50 | 0.40 | Enables "assess this epic" workflow — the natural unit for FCS. Unlocked by V4 requirements. |
| 6 | #278 | **chore: audit adminSupabase usages for org_id scoping** | 0.62 | 0.70 | 0.30 | 0.80 | 0.50 | ADR-0025 compliance. Complements the finalise_rubric fix. Security hygiene. |
| 7 | (new) | **Email-service: decide (ADR) or descope 3.2/3.5/3.6** | 0.61 | 0.60 | 0.95 | 0.50 | 0.40 | Seventh-week carry. Three V1 stories blocked. Either Resend ADR or move to V2. |

### Worth doing soon (0.45–0.59)

| Rank | # / proposal | Title | Score | V | U | R | 1−E | Rationale |
|------|--------------|-------|------:|----:|----:|----:|----:|-----------|
| 8 | #126 | **fix: personal account owner assigned 'member' role** | 0.56 | 0.60 | 0.45 | 0.50 | 0.80 | Real bug affecting solo/demo accounts. Small fix. |
| 9 | (new) | **Dogfooding re-run with V4 calibration (after V4 E1 ships)** | 0.55 | 0.85 | 0.10 | 0.30 | 0.90 | Three-point narrative arc for the article. Depends on V4 E1. |
| 10 | #170 | **fix: vitest test isolation** | 0.50 | 0.45 | 0.55 | 0.55 | 0.45 | Carries across retros. Erodes CI trust. |
| 11 | (new) | **fix: silent catches — `fetchLinkedIssues` + `retry-button.tsx`** | 0.49 | 0.40 | 0.20 | 0.70 | 0.85 | CLAUDE.md violations. Quick audit + fix. |
| 12 | #150 | **audit: Supabase queries for RLS alignment** | 0.48 | 0.60 | 0.20 | 0.80 | 0.20 | Security hygiene. Large read, small/zero write. |
| 13 | #111 | **feat: design decisions summary as FCS input (Tier 1)** | 0.48 | 0.70 | 0.20 | 0.40 | 0.50 | Article "why not what" framing. PR template approach is cheap. |
| 14 | (new) | **Update CLAUDE.md phase label** | 0.47 | 0.40 | 0.30 | 0.80 | 0.90 | Second consecutive grooming flagging staleness. 2-minute edit. |

### Lower priority (< 0.45)

| Rank | # / proposal | Title | Score | V | U | R | 1−E | Rationale |
|------|--------------|-------|------:|----:|----:|----:|----:|-----------|
| 15 | #301 | experiment: compact before /feature-end | 0.42 | 0.40 | 0.30 | 0.30 | 0.70 | Process optimisation. Measure on next 3 runs. |
| 16 | #266 | design: GraphQL batched readFiles tool | 0.40 | 0.50 | 0.25 | 0.40 | 0.40 | Orphan issue. Design work for E17 follow-up. |
| 17 | #203 | feat: pass teammate session ID in spawn prompt | 0.40 | 0.45 | 0.20 | 0.50 | 0.50 | Cost-tracking correctness in parallel runs. |
| 18 | #145 | feat: contextual logging (module + requestId) | 0.40 | 0.45 | 0.20 | 0.55 | 0.50 | Quality-of-life. No immediate pain. |
| 19 | #175 | Forced session invalidation on membership change | 0.33 | 0.40 | 0.10 | 0.30 | 0.35 | Explicitly non-goal at V1. |
| 20 | #146 | docs: docs/INDEX.md | 0.38 | 0.35 | 0.30 | 0.40 | 0.75 | Quality-of-life. |
| 21 | #88 | Recover Vault migration | 0.30 | 0.15 | 0.10 | 0.40 | 0.40 | Likely moot — `user_github_tokens` table removed in ADR-0020 migration. Verify and close. |
| 22 | Deferred-post-mvp pile | #33, #35, #36, #37, #60, #63, #89, #90, #91, #95 | < 0.35 | | | | | Bulk triage needed — schedule or close. |

## Proposed new issues (NOT created — human-approve to action)

- [ ] **"fix: add org_id guard to finalise_rubric RPC overloads (ADR-0025)"** — C1 from drift report. One-line schema change per overload + migration.
  - Suggested labels: `bug`, `kind:task`
  - Suggested acceptance criteria: Both UPDATE WHERE clauses include `AND org_id = p_org_id`; `db diff` clean after reset.

- [ ] **"epic: V4 Question Generation Quality"** — container for V4 E1 stories 1.1–1.3.
  - Suggested labels: `epic`
  - After creation: run `/architect` to produce LLD, then `/feature` per story.

- [ ] **"epic: V4 Epic-Aware Artefact Discovery"** — container for V4 E2 stories 2.1–2.3.
  - Suggested labels: `epic`
  - Dependency: V2 E19 (delivered).

- [ ] **"chore: board hygiene — remove closed items from Todo, triage orphans"** — remove #66, #73, #241, #242, #244, #248 from board; triage #18, #33, #35, #36, #37, #145, #146, #171, #266, #302.
  - Suggested labels: `chore`

- [ ] **"fix: add logging/comment to silent catches (W5, I7)"** — `fetchLinkedIssues` in `artefact-source.ts` and `retry-button.tsx`. CLAUDE.md violations.
  - Suggested labels: `bug`, `kind:task`

- [ ] **"ADR: email service provider — or descope Stories 3.2/3.5/3.6 to V2"** — seventh-week carry. Decision required: Resend ADR or descope.
  - Suggested labels: `ADR`

- [ ] **"docs: dogfooding re-run report — V3 baseline vs V4 quality"** — once V4 E1 ships, re-run assessment on same epic, record before/after as article artefact.
  - Suggested labels: `docs`, `kind:task`

## Proposed reprioritisation (NOT actioned)

- **#278 (adminSupabase audit) should follow immediately after the `finalise_rubric` fix** — both are ADR-0025 compliance. Do the critical fix first, then the broader audit.
- **#88 (Vault migration) should be verified and likely closed** — `user_github_tokens` table was removed in ADR-0020 migration. The original problem (pgsodium permissions on cloud) is moot if the table no longer exists.
- **V4 work should take priority over remaining V1 PRCC** — V4 fixes real quality issues found in production use; PRCC is the V1 headline feature but has no users yet. Ship quality fixes first.
- **Move deferred-post-mvp pile to a single bulk triage decision** — don't grind through 10+ deferred issues linearly.

## Proposed issue edits (NOT actioned)

- **#88** — verify whether `user_github_tokens` still exists. If not, close with "moot — table removed in ADR-0020 migration".
- **#266** — orphan, add to board at Todo or close if E17 batched readFiles is no longer planned.
- **#302** — orphan (new bug). Add to board at Todo.
- **#126** — add Given/When/Then acceptance criteria (suggested in previous grooming, still missing).

## Actions summary for the human

Nothing actioned. Pointers:

- **Merge #302 fix:** branch `fix/results-formatting` exists with commit `34a25b5`.
- **Create `finalise_rubric` fix issue:** `./scripts/gh-create-issue.sh` then `/feature`.
- **Board cleanup:** `./scripts/gh-project-status.sh remove <N>` for closed items; `./scripts/gh-project-status.sh add <N> Todo` for orphans.
- **V4 epics:** `./scripts/gh-create-issue.sh` → `/architect` → `/feature` per story.
- **Email ADR:** `/create-adr` or descope decision.
- **CLAUDE.md phase:** manual edit.
