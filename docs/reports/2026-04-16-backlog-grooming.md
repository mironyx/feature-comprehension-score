# Backlog Grooming

**Date:** 2026-04-16
**Period since last grooming:** first grooming (no prior `*-backlog-grooming.md` report).
**Declared phase (CLAUDE.md):** `Phase 1: Core Feature Implementation — Assessment engine, GitHub integration, Supabase storage, API routes.`

## Summary

| Column | Count |
|--------|------:|
| Todo | 19 |
| In Progress | 0 |
| Blocked | 0 |
| Done (since 2026-04-12 retro) | 13 |
| Open issues not on board (orphans) | 7 |
| Open issues total | 26 |

Backlog is in **amber** health. Delivery cadence is strong (13 issues closed in 4 days — the full v3 rubric-enhancement slate shipped on time). Hygiene has regressed: two completed epics remain open, seven open issues sit off the board, there is still no In Progress / Blocked column activity to show how work flows through the board, and the declared phase label is materially out of date.

## Phase accuracy

**CLAUDE.md phase label is stale. Proposed update below.**

Evidence:

- The declared phase is "Phase 1: Core Feature Implementation" and the latest drift report (2026-04-12) describes the project as "Phase 0.5: Scaffolding & Infrastructure". Neither matches reality.
- Phases 0.5, 1, 2 (web/auth/db) and parts of Phase 4 (FCS flow end-to-end) are delivered. The Onboarding & Auth epic (#176) is merged and closed. V3 rubric enhancements (hints + comprehension depth — not even part of the original v1 plan) have shipped.
- Phase 2 of the v1 implementation plan (PRCC webhook flow — Stories 2.1–2.9) remains at 0% code. Phase 5 (Reporting — Stories 6.1–6.4) remains at 0% code. Stories 3.2 (email notifications), 3.5 (partial participation), 3.6 (self-reassessment) have HLD only (drift W6).
- In activity terms we are post-MVP-demo: manual FCS cycle works end-to-end, the calibration gaps that the first real assessment surfaced (scoring scale, NULL scores, hint guidance, depth control) have been closed. The next coherent chunks of v1 are PRCC, Reporting, and the email-dependent FCS stories.

Proposed `CLAUDE.md` edit (NOT actioned):

```
## Current Phase

**Phase 2 (in progress): Productionising the FCS flow and expanding coverage.**
FCS manual cycle is live and calibrated (v3 hints + comprehension depth shipped).
Remaining v1 surface: PRCC webhook flow (Epic 2), Reporting (Epic 6), email-dependent
FCS stories (3.2 / 3.5 / 3.6 — blocked on an email-service ADR).
Tech stack unchanged: Next.js (App Router), TypeScript, Supabase (PostgreSQL + Auth + RLS),
OpenRouter (LLM gateway — see ADR-0015), GCP Cloud Run.
```

## Progress since last grooming (= since 2026-04-12 retro)

Closed issues:

- `#176` epic: Onboarding & Auth (installation-token org membership)
- `#206` bug: participant cannot discover assessments before link_participant fires
- `#207` feat: auto-refresh assessment status after rubric generation
- `#208` feat: UI polish pass for auth / assessment forms
- `#212` bug: scoring prompt does not specify 0–1 scale — LLM returns inverted scores
- `#213` bug: NULL score not retried or surfaced to user
- `#219` / `#220` / `#221` — v3 Epic 1 (hints) stories 1.1, 1.2, 1.3
- `#222` / `#223` / `#224` / `#225` — v3 Epic 2 (comprehension depth) stories 2.1, 2.2, 2.3, 2.4

No items moved into In Progress — the board's lifecycle column is empty (Todo → Done only, In Progress and Blocked are unused in practice).

## Actions from previous grooming

No previous grooming report exists. Carrying the still-open retro actions from `2026-04-12-process-retro.md` into this report for visibility:

| Proposal (from 2026-04-12 retro) | Status | Notes |
|---|---|---|
| Run `/drift-scan` immediately | **Not done** — **fifth consecutive carry**. Last scan 2026-03-28, then 2026-04-12; nothing since. | 13 issues merged since 2026-04-12 including v3 schema + prompt changes. |
| Move `#18`, `#27` out of "Done" (`deferred-post-mvp`) | **Not done** | Still in Done column. |
| Create issues for drift W1 (assessments-readable-after-removal test gap) and W5 / W6 (email-service ADR) | **Not done** — fifth consecutive carry. | |
| Decide harness commit tracking policy | Not done | |
| Create board issues for retro actions >5 min | Not done | |
| Validate parallel cost pipeline | Not done (one recent parallel run on 2026-04-15/16 proceeded anyway) | |

## In-flight health

- **No issues are In Progress on the board.** Post `/feature-end` status is set to Done, not left at In Progress (see `feedback_feature_board_status.md`). This means the board's In Progress column never lights up in practice. Not a bug, but worth acknowledging — reports should read the Todo-age signal rather than In Progress staleness.
- **No issues in Blocked.** Consistent with above.

## Backlog health findings

| # | Issue / artefact | Finding | Severity |
|---|---|---|---|
| 1 | Epics `#214` and `#215` | All child tasks merged but epics still OPEN with success-criteria checkboxes unticked. `#176` was closed promptly on epic completion; `#214` / `#215` broke that pattern. | Warning |
| 2 | `#18`, `#27` | Open issues with `deferred-post-mvp` label, still in "Done" column on the board. Flagged for the 2nd consecutive retro period. | Warning |
| 3 | `#33`, `#35`, `#36`, `#37`, `#145`, `#146`, `#171` | Open issues not on the project board at all (orphans). Six of seven carry `deferred-post-mvp` / harness / low-priority labels; `#171` (frontend-system spec issue) is a small chore. | Warning |
| 4 | `#22` (harness roadmap), `#48` (multi-PR merge strategy) | Not updated since 2026-03-25 (21 days). Both are aspirational/deferred; stale but not actively harmful. | Info |
| 5 | `#66` (parallel agent dispatch + OTLP) | Scope significantly delivered (parallel spawn via `/feature-team` works, OTLP stack live). Success criteria on the issue body no longer map 1:1 to remaining work. | Info |
| 6 | `#126` (personal-account admin role) | Has `kind:task` but no acceptance-criteria Given/When/Then block (has a plain bullet). Body is clear so downgrade to Info. | Info |
| 7 | `#171` (frontend system spec) | No acceptance criteria; thin body. Also orphan (finding 3). | Info |
| 8 | Drift Info items | `v1-prompt-changes.md` and `v2-requirements-proposed-additions.md` are dangling docs flagged by 2026-04-12 drift report; no tracking issue created. | Info |
| 9 | Harness commits (53% of commits in the retro period lacked issue refs per 2026-04-12 retro) | Standing tension between CLAUDE.md "no work without an issue" and `(harness)` scope commits. No decision recorded. | Info |

## Requirements coverage

### Current version (v1) gaps — real next-up work

- **Epic 2: PRCC Flow (Stories 2.1–2.9)** — full L1–L4 design, zero code. This is the preventative gate and the headline feature of v1. No open issues track individual PRCC stories — a single epic issue should exist.
- **Epic 6: Reporting (Stories 6.1–6.4)** — HLD only at L1 for `6.3` / `6.4`; no LLDs; no code beyond the per-assessment results page. Org Overview and Repository Assessment History have never been designed past L1.
- **Story 3.2 (participant notification / 48h reminder)** — HLD says "Component 5 (Email Service) — V1 approach TBD". Blocked on an email-service ADR.
- **Story 3.5 (close FCS with partial participation)** — HLD only; depends on `3.2`.
- **Story 3.6 (self-reassessment)** — HLD only; the re-assessment endpoint / UI does not exist.
- **Story 1.3 / 1.4 (per-repo config UI + org-level defaults)** — API surface exists (`#63` still open); UI does not. Org context settings panel (`#158`) is a separate capability that is implemented.

No open issue exists for any of these except `#63` (org/repo config API routes) and the epic-level tracking story.

### Parked future ideas (v2, proposed additions, v3 roadmap)

Surfaced for visibility only — explicitly not overdue.

- `v2` Epics 7–17 (PR Decorator, Decay Tracking, AI vs Human Delta, Bus Factor Map, Artefact Quality, Cognitive Debt Indicators, Outcome Correlation, Expanded Assessment Areas, Benchmark Mode, OSS Models, Agentic Retrieval). None of these have open issues — correctly parked.
- `v2-requirements-proposed-additions.md` — four unmerged insertions into `v2-requirements.md` (AI-agentic framing, Conway's-Law angle on AI delta, Agent Session Comprehension Signals V3 epic). Dangling draft (drift Info).
- v3 roadmap notes (intent debt, spec-to-behaviour gap, ADR coverage, unified triple-debt dashboard) — future work, not overdue.

### v3 rubric enhancements

**Effectively complete.** Epic 1 (hints) and Epic 2 (comprehension depth) have all stories merged. The epic issues themselves (`#214`, `#215`) remain OPEN — hygiene, not coverage.

## Signals from reports

### From latest drift report (2026-04-12)

- **C1 (`fetchRepoInfo` missing `installation_id`)** — RESOLVED in commit `81c4cae` (`src/app/api/fcs/service.ts:158` now selects `organisations!inner(github_org_name, installation_id)`).
- **C2 (`lld-onboarding-auth-client-migration.md` status stale)** — unverified here; originally tracked against `#192` which is closed.
- **C3 (`github-auth-hld.md` still "Draft — pending human security sign-off")** — no evidence of resolution; HLD governs the cross-org isolation model in production. No issue tracks the sign-off request.
- **W1 (`lld-onboarding-auth-webhooks.md` — two open acceptance criteria, no issues)** — no corresponding open issue.
- **W6 (Email Service ADR blocking Stories 3.2 / 3.5 / 3.6)** — no open issue. **Fifth-consecutive-carry retro action.**
- **W7 (org-context settings UI placeholder)** — RESOLVED; `#158` closed and `src/app/org-settings` shipped.

### From latest retro (2026-04-12)

Key uncreated issues:

- Email service ADR (carries Story 3.2 / 3.5 / 3.6).
- Drift-scan cadence enforcement (now 5 consecutive carries).
- Harness commit tracking policy.
- Parallel cost-pipeline validation.

### From recent ADRs

- **ADR-0022 (Tiered Feature Process)** — now being exercised; the 2026-04-13 "#212 is a tier-1 bug fix" decision worked well. No follow-up work.
- **ADR-0020 (Installation-token org membership)** — fully implemented. The "installation IDs have three entry points" CLAUDE.md rule referenced in `github-auth-hld.md` §4.3 has still not been added to `CLAUDE.md` (drift Info).
- **ADR-0019 (Feature-evaluator agent)** — in use; no follow-up.

## Creative / research proposals

Deliberately broader than the existing issue set — the product is past MVP demo and needs a coherent next-phase narrative that the article can point at.

- **"Dogfooding re-run" calibration experiment.** _Source: session-log theme + creative._ The 2026-04-13 real FCS assessment exposed scoring bugs and the hint/depth gaps. Now that `#212`/`#213`/v3 Epic 1/Epic 2 have shipped, re-run a fresh FCS assessment on a recent FCS feature (e.g. the onboarding-auth epic) with `comprehension_depth='conceptual'` and hints on. Record scores in a runbook; the before/after becomes a direct evidence artefact for the article. Low engineering cost, very high narrative value.
- **"Bus Factor Map (MVP)."** _Source: creative — subset of v2 Epic 10._ Single static page listing features × participants × pass/fail, computed from existing `assessments` + `assessment_participants` + current threshold. No new data model. Per v2 Epic 10 motivation, this is the single highest-visibility "why FCS matters" artefact for engineering leaders. A minimal read-only view is ~1 day of work and unlocks a second v1 narrative chapter without touching the core engine.
- **"AI-baseline score on every assessment" (v2 Epic 9, MVP slice).** _Source: creative._ Running the rubric through the LLM-as-participant and storing the baseline next to the human aggregate is the feature most likely to be quoted by a reviewer of the article ("same AI that caused cognitive debt also measures it"). Even unpolished, surfacing the delta on the results page would be a distinctive differentiator no other product has.
- **Artefact quality score surfaced in results (v2 Epic 11, MVP slice).** _Source: creative._ The `classifyArtefactQuality` function already runs and produces `code_only` / `code_and_requirements` / `full`. Surface it as a visible tag on the results page and add a one-line "teams often score lower when artefact quality is `code_only`" contextual note. Zero new LLM calls; purely UI.
- **Decay re-assessment (v2 Epic 8, minimum slice).** _Source: creative._ "Re-run this assessment" button on a completed FCS that creates a new assessment reusing the same question set and rubric. This is a narrow superset of Story 3.6 (self-reassessment) and gives a concrete, demoable decay story.
- **PR Decorator (v2 Epic 7, smallest slice).** _Source: creative._ When the PRCC webhook path is built, posting a reflection-style PR comment is cheap add-on. The decorator is the most natural V2 preview and unlocks the "meet devs where they already are" positioning.
- **Email-service ADR, unblocking Stories 3.2 / 3.5 / 3.6.** _Source: retro carry + requirements gap._ Five-consecutive-carry retro action. Candidate providers: Resend (cheap, DX-friendly), Postmark (deliverability). A short ADR + spike ends the paralysis that's been holding back three stories.
- **"Self-probe dashboard" on the results page.** _Source: creative._ After submitting, show the participant their own per-question rationale and a contextual note derived from depth (conceptual / detailed). The backend already has per-answer rationale; the UI doesn't surface it to the self-assessor past `submitted`. Cheap win that supports Naur's "the measurement is the conversation" framing.
- **Formalise "post-MVP demo" runbook.** _Source: session-log theme._ `mvp-phase2-smoke-test-checklist.md` exists but the article assumes a customer-runnable narrative. A short one-page runbook ("If you have 10 minutes, install the App, create an assessment, see results") would make the dogfooding story shareable. Probably more like updating `docs/runbooks/` than a new artefact.
- **"Structured design decisions" PR section (`#111`, simplified).** _Source: existing issue + session-log theme._ `#111` proposes two tiers; Tier 1 (PR template + additional prompt input) is the cheap tier and directly addresses the article's "why not what" framing. Treat as a slim version of the existing issue.

## Recommended next (≥10 items, propose-only)

Scoring formula reminder: `score = 0.4*value + 0.3*unblocks + 0.2*risk_of_drift + 0.1*(1 − effort)`. `V`, `U`, `R`, `1−E` each 0.0–1.0.

### Top priority (score ≥ 0.60)

| Rank | # / proposal | Title | Score | V | U | R | 1−E | Rationale |
|---|---|---|---:|---:|---:|---:|---:|---|
| 1 | (new) | **Dogfooding re-run of FCS assessment with v3 calibration** | 0.77 | 0.90 | 0.30 | 0.70 | 0.90 | Validates that the v3 work actually fixed the calibration gap. High-value narrative artefact for the article. Almost free to run. |
| 2 | (new) | **Close epics `#214` and `#215`; tick their success-criteria checkboxes** | 0.66 | 0.50 | 0.40 | 0.80 | 1.00 | Hygiene; the epic-close pattern broke. `#176` did it right. ~5 min each. |
| 3 | (new) | **Run `/drift-scan`** (fifth-consecutive carry) | 0.65 | 0.55 | 0.40 | 0.90 | 0.85 | 13 issues merged since the last scan including the full v3 schema + prompt surface. Proactive > reactive. |
| 4 | (new) | **Close / board-attach the seven orphan issues** (`#33` `#35` `#36` `#37` `#145` `#146` `#171`) | 0.63 | 0.50 | 0.60 | 0.70 | 0.90 | Board should be a faithful picture of open work. Either add to Todo or close if genuinely abandoned. |
| 5 | (new) | **Email-service ADR** — unblocks Stories 3.2 / 3.5 / 3.6 | 0.62 | 0.65 | 0.95 | 0.70 | 0.30 | Carries three v1 stories, has been blocked since 2026-03. Single ADR + ~1-day spike. |
| 6 | (new) | **`#214` / `#215` epic issues not on board; add to Done or close** | merged into Rank 2 | | | | | See rank 2. |
| 7 | (new) | **Bus Factor Map MVP (read-only view over existing data)** | 0.60 | 0.85 | 0.30 | 0.50 | 0.50 | Single highest-visibility "why FCS matters" artefact. One-day task on existing data model. Article ready. |

### Worth doing soon (0.45–0.59)

| Rank | # / proposal | Title | Score | V | U | R | 1−E | Rationale |
|---|---|---|---:|---:|---:|---:|---:|---|
| 8 | (new) | **Artefact-quality surfacing on results page** (v2 Epic 11, MVP slice) | 0.58 | 0.70 | 0.30 | 0.40 | 0.80 | `classifyArtefactQuality` is already computed and ignored in the UI. Pure wiring. |
| 9 | `#126` | fix: personal account owner assigned `'member'` instead of `'admin'` | 0.56 | 0.60 | 0.45 | 0.50 | 0.80 | Real bug affecting solo users / demo accounts. Small fix + test. |
| 10 | (new) | **PRCC epic — decompose into task issues and put on board** | 0.56 | 0.90 | 0.50 | 0.30 | 0.20 | Epic 2 is the v1 headline feature still at 0% code. Don't start building yet — write the epic + task breakdown (/architect) and schedule. |
| 11 | (new) | **AI-baseline on every assessment (v2 Epic 9, smallest slice)** | 0.55 | 0.90 | 0.15 | 0.40 | 0.35 | Differentiating feature; single additional LLM call + DB column + results-page row. Expensive to keep perfect, cheap to prototype. |
| 12 | `#111` | feat: include AI session log / design decisions summary as FCS question generation input (Tier 1 only) | 0.53 | 0.70 | 0.25 | 0.60 | 0.55 | Directly serves the "why, not what" framing. Tier 1 (PR template) is a day's work. |
| 13 | `#170` | fix: vitest isolation (`installation-handlers.test.ts` + `github.test.ts`) | 0.50 | 0.45 | 0.55 | 0.55 | 0.45 | Carries across retros; quietly erodes CI trust. |
| 14 | `#150` | audit: review all Supabase queries for RLS alignment | 0.48 | 0.60 | 0.20 | 0.80 | 0.20 | Security hygiene. Large read, small or zero write. |
| 15 | (new) | **HLD security sign-off on `github-auth-hld.md` + add "three-entry-points" CLAUDE.md rule** | 0.48 | 0.55 | 0.40 | 0.70 | 0.30 | C3 from drift report; no issue tracks it. Document governs the cross-org isolation guarantee. |

### Lower priority (< 0.45)

| Rank | # / proposal | Title | Score | V | U | R | 1−E | Rationale |
|---|---|---|---:|---:|---:|---:|---:|---|
| 16 | `#203` | harness: pass teammate session ID explicitly in spawn prompt | 0.42 | 0.50 | 0.20 | 0.60 | 0.50 | Fixes cost-tracking correctness in parallel runs. Small. |
| 17 | `#126` | (already ranked 9 above) | | | | | | Listed once only. |
| 18 | `#145` | feat: contextual logging (module child loggers + requestId) | 0.40 | 0.45 | 0.20 | 0.55 | 0.50 | Good practice, no immediate pain. |
| 19 | `#146` | docs: `docs/INDEX.md` | 0.38 | 0.35 | 0.30 | 0.40 | 0.75 | Small quality-of-life. |
| 20 | (new) | **Surface the "three entry points for installation IDs" rule in `CLAUDE.md`** | 0.36 | 0.35 | 0.25 | 0.55 | 0.80 | Documentation hygiene; makes the HLD guarantee mechanical. |
| 21 | `#88` | Recover Vault migration for GitHub token storage | 0.35 | 0.20 | 0.10 | 0.50 | 0.40 | Partially moot since the installation-token migration; verify whether `user_github_tokens` is still needed at all. |
| 22 | `#175` | Forced session invalidation on upstream membership change | 0.33 | 0.40 | 0.10 | 0.30 | 0.35 | Requirement explicitly non-goal at v1. |
| 23 | `#48` / `#22` / `#66` | Deferred or superseded infrastructure roadmap items | < 0.35 | | | | | Keep, but reassess instead of grinding through. |
| 24 | `#18` / `#27` / `#33` / `#35` / `#36` / `#37` / `#60` / `#63` / `#89` / `#90` / `#91` / `#95` | `deferred-post-mvp` pile | < 0.35 | | | | | Review and either schedule or close in bulk — do NOT work through linearly. |

## Proposed new issues (NOT created — human-approve to action)

Each of these is a concrete proposal the human can approve via `./scripts/gh-create-issue.sh`. Labels and epic links are suggestions.

- [ ] **"docs: dogfooding re-run of FCS assessment post-v3 calibration"** — write a session-log artefact with before/after scores for the same feature. Suggested labels: `docs`, `kind:task`. No epic; it's a one-off runbook-style artefact for the article.
- [ ] **"chore: close epics `#214` and `#215` on task completion"** — update epic body checkboxes, add closing comment pointing to shipped PRs, close. Suggested labels: `chore`.
- [ ] **"chore: run `/drift-scan` and file report in `docs/reports/`"** — fifth-consecutive-carry retro action. Suggested labels: `chore`.
- [ ] **"chore: backlog-hygiene — board reconciliation for orphan issues"** — triage of `#33 #35 #36 #37 #145 #146 #171`. For each: add to board at appropriate status OR close with a rationale comment. Suggested labels: `chore`.
- [ ] **"ADR: email service provider for participant notifications (Stories 3.2 / 3.5 / 3.6)"** — Resend vs Postmark vs SES, factoring in deliverability and cost. Suggested labels: `ADR`, `L2-components`. Output: `docs/adr/0023-email-service-provider.md`. Unblocks three v1 stories.
- [ ] **"epic: PRCC flow (v1 Epic 2)"** — create the epic issue, run `/architect` over Stories 2.1–2.9 producing the task breakdown. Suggested labels: `epic`, `priority:high`. Parent HLD: `v1-design.md §3.1`.
- [ ] **"feat: Bus Factor Map MVP"** — single read-only page at `/orgs/[id]/bus-factor` showing features × participants pass/fail from existing data. No new LLM calls. Depth `detailed` assessments show individual scores; `conceptual` shows pass/fail only. Suggested labels: `feat`, `MVP2`, `kind:task`. Parent epic: propose new `epic: Visible Comprehension Insights (v2 preview slice)` or attach to v2 Epic 10 when created.
- [ ] **"feat: surface artefact-quality tag on the results page"** — wire the existing `classifyArtefactQuality` output into a visible badge + contextual note. No new data model. Suggested labels: `feat`, `kind:task`.
- [ ] **"feat: AI-baseline score alongside human aggregate (MVP)"** — run rubric through the LLM as a participant at rubric-generation time, store on `assessments`, render delta on results page. Suggested labels: `feat`, `L3-interactions`, `kind:task`. Preview slice of v2 Epic 9.
- [ ] **"fix: HLD security sign-off on `github-auth-hld.md` + add `CLAUDE.md` rule for installation-ID entry points"** — ties drift C3 + drift Info to an actionable step. Suggested labels: `docs`, `security`.
- [ ] **"docs: merge `v2-requirements-proposed-additions.md` into `v2-requirements.md`"** — drift Info item, dangling draft. Suggested labels: `docs`.
- [ ] **"decision: deferred-post-mvp bulk triage"** — single decision doc: which of `#18 #27 #33 #35 #36 #37 #60 #63 #88 #89 #90 #91 #95` come back to Todo, which close. Suggested labels: `chore`.

## Proposed reprioritisation (NOT actioned)

- Move `#63` (organisation/repository config API routes) above the rest of the `deferred-post-mvp` set — it is the only deferred item directly needed to drive Epic 1 / Epic 2 of the v1 plan to 100%.
- Move `#170` (vitest isolation) into Todo ahead of any other infra item — it is the only one currently affecting CI reliability.
- Park `#22` (harness improvement roadmap) — scope has largely been absorbed by separate harness issues and shipped skills. Either close or rewrite as a small remaining-scope issue.
- Keep `#48` (multi-PR merge strategy) deferred. It's only needed once FCS is extended to multi-PR features, which is not in v1.

## Proposed issue edits (NOT actioned)

- `#66` — success criteria in the body no longer reflect remaining work (parallel spawn + OTLP largely shipped). Suggest rewriting to "remaining: feature.id resource attribute enforcement, per-teammate cost attribution (see `#203`)" or closing and opening a smaller follow-up.
- `#126` — body has `## Bug` / `## Fix` / `## Files` sections but no Given/When/Then acceptance block. Suggest adding:
  - Given: a user whose installation's `github_org_id` equals their GitHub user ID.
  - When: they sign in for the first time after install.
  - Then: their row in `user_organisations` has `github_role = 'admin'`, and the assessments page shows the "New Assessment" link.
- `#171` — thin body; add acceptance criteria ("status is `Accepted`, human approver named, ADR linked if any").
- `#22`, `#48`, `#66` — add `updatedAt` bump via a brief triage comment or close.

## Actions summary for the human

Nothing in this report has been actioned. Everything below is a one-line pointer so the human can invoke the right skill / script.

- Close epics: `gh issue close 214 215` after ticking checkboxes.
- Close / reattach orphans: `./scripts/gh-project-status.sh add <n> Todo` or `gh issue close <n>`.
- Create new issues above: `./scripts/gh-create-issue.sh ...`.
- Run the drift scan: `/drift-scan`.
- Run the dogfooding re-run: manual, record the session log in `docs/sessions/`.
