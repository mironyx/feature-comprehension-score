# MVP Scope Review — FCS-Only Minimal Deliverable

Ship the smallest product that validates the core hypothesis: LLM-generated comprehension questions surface understanding gaps in teams. FCS flow only, hardcoded defaults, no PRCC, no email, no relevance validation.

**Decisions confirmed:** 2026-03-25

---

## Current State

| Phase | Status |
|-------|--------|
| Phase 0 (Foundation) | ✅ Complete — requirements, design, 8 ADRs |
| Phase 0.5 (Scaffolding) | ✅ 4/5 done — open: #18 architecture fitness |
| Phase 1 (Core Engine) | ✅ 6/8 done — open: #23 Anthropic client, #25 artefact types, #27 quality detector |
| Phase 2 (Web + Auth + DB) | ~10/16 done — auth, org sync, assessment list/detail API working |

---

## MVP Scope: FCS-Only

### What's in

| # | Feature | Story | Status |
|---|---------|-------|--------|
| 1 | GitHub OAuth sign-in | 5.1 | ✅ Done (#53) |
| 2 | Org membership sync | 5.2 | ✅ Done (#55) |
| 3 | Org selection page | 1.2 | ✅ Done (#54) |
| 4 | Anthropic client wrapper with retry/error handling | 4.5 | Open (#23) |
| 5 | Artefact input types and prompt builders | 4.1 | Open (#25) |
| 6 | Create FCS assessment (select merged PRs, name feature, pick participants) | 3.1 | Open (#121) |
| 7 | POST /api/assessments/[id]/answers — submit answers | 5.3 | Open (#59) |
| 8 | Scoring integration (wire engine scoring → API on last submission) | 4.2, 4.3 | New |
| 9 | Assessment answering page UI | 5.3 | Open (#61) |
| 10 | Basic FCS results page (aggregate score, per-question scores, reference answers) | 6.2 simplified | New |
| 11 | Navigation layout (My Assessments + Org, role-based) | 5.4 simplified | Open (#62) |

### Hardcoded defaults (no config UI)

- Question count: 5
- No per-repo or per-org settings UI
- No enforcement mode selection (FCS has no gate — scores only)

---

## MVP Task List (implementation order)

| Order | Task | Issue | Effort | Depends on |
|-------|------|-------|--------|------------|
| 1 | Anthropic client wrapper with retry and error handling | #23 | M | — |
| 2 | Artefact input types and prompt builders | #25 | M | — |
| 3 | Navigation layout with role-based route protection (simplified) | #62 | M | — |
| 4 | POST /api/assessments — create FCS assessment endpoint | New | L | #23, #25 |
| 5 | POST /api/assessments/[id]/answers — answer submission endpoint | #59 | M | — |
| 6 | Scoring integration — trigger scoring after last participant submits | New | M | #23 |
| 7 | Assessment answering page (question display + submission UI) | #61 | L | #59 |
| 8 | Basic FCS results page | New | M | scoring integration |

**Estimated effort:** ~6–8 focused sessions.

Tasks 1–3 have no dependencies on each other and can be parallelised.

---

## Smoke Test Findings (2026-03-29)

Four bugs discovered during first E2E smoke test. Grouped as #122; must be fixed before a full cycle is possible.

| Bug | File | Fix |
|-----|------|-----|
| Sign out sends GET; route only handles POST | `src/components/nav-bar.tsx` | Wrap in `<form method="POST">` |
| `link_participant()` never called — all participants get Access Denied | `src/app/assessments/[id]/page.tsx` | Call `rpc('link_participant')` before `fetchParticipant` |
| Personal account installation defaults to role `'member'` — owner blocked from creating assessments | `src/lib/supabase/org-sync.ts` | Set role to `'admin'` for personal accounts |
| `/repos` linked from nav but no route exists (404) | `src/components/nav-bar.tsx` | Remove link (repos config is post-MVP) |

Issue: #122

---

## MVP Deferrals Registry

Everything below is explicitly deferred from MVP. Each item includes enough context to pick up later without re-discovery.

### Deferred: Entire PRCC Flow (Epic 2)

| Story | Title | Context for later |
|-------|-------|-------------------|
| 2.1 | PR event detection | Webhook handler at `/api/webhooks/github` for `pull_request` events (opened, ready_for_review, synchronize, review_requested). Skip logic for small PRs and exempt files. Design: L3 §3.1 Phase 1 |
| 2.2 | PR artefact extraction | Reuse `ArtefactSource` port (#46 done). Fetch diff, description, linked issues, file contents, tests via installation token. Token budget/truncation already built |
| 2.3 | GitHub Check Run creation | Create Check Run via GitHub API (in_progress → success/failure/neutral). Spike-003 covers API details. `external_id` = assessment UUID |
| 2.4 | Assessment answering (PRCC) | Same answering UI as FCS but accessed via Check Run link. Reuse MVP answering page |
| 2.5 | Relevance validation (Soft mode) | LLM-based binary relevant/not-relevant check. Re-answer loop (max 3 attempts). Engine function exists (#29) but not wired to API |
| 2.6 | Score-based evaluation (Hard mode) | Aggregate score vs configurable threshold. Engine aggregate function exists (#30). Needs gate resolution logic |
| 2.7 | Gate skip | Org Admin skips assessment with mandatory reason. Check Run → neutral. Skip event audit trail |
| 2.8 | PR update handling | Debounce (60s, DB-backed), trivial commit heuristic (< 5 lines or docs-only), invalidate + regenerate assessment |
| 2.9 | PR metadata export | Machine-readable Check Run summary for external systems. Pipe-delimited format in `output.summary` |

### Deferred: FCS Features

| Story | Title | Context for later |
|-------|-------|-------------------|
| 3.2 | Participant email notification | Send email on FCS creation + single reminder after 48h. Design says Supabase Edge Functions + Resend (TBD). MVP: share links manually |
| 3.4 (partial) | Self-directed private view | Participant sees own per-question scores + Naur layer + submitted answers. No reference answers shown. Issue #95. ADR-0005 Option 4 |
| 3.5 | Close with partial participation | Org Admin closes assessment after timeout, scoring runs on available responses. "Score based on N of M participants" |
| 3.6 | Self-reassessment | Re-answer same rubric, new scores for self-view only. Aggregate unchanged. `is_reassessment` column already in DB (#50) |

### Deferred: Relevance Validation

| Item | Context for later |
|------|-------------------|
| Story 2.5 relevance check | Engine function `detectRelevance()` exists (#29). Binary relevant/not-relevant. Needs API wiring: on answer submit, call relevance check before accepting. Re-answer loop UI (max 3 retries, then accept + flag). For MVP all answers are accepted and scored directly |

### Deferred: Configuration

| Story | Title | Context for later |
|-------|-------|-------------------|
| 1.1 | GitHub App installation | Webhook for `installation` and `installation_repositories` events. Org/repo registration. Soft-delete on uninstall |
| 1.3 | Per-repo config | PRCC on/off, FCS on/off, enforcement mode, threshold, question count, min PR size, exempt patterns. DB columns exist in `repository_config` |
| 1.4 | Org-level defaults | Org-level config inherited by repos without explicit config. `get_effective_config` DB function exists (#45) |
| Config UI | Org + repo settings pages | Needs #63 API routes + UI pages. MVP uses hardcoded defaults |

### Deferred: Reporting & Results

| Story | Title | Context for later |
|-------|-------|-------------------|
| 6.1 | PRCC results page | Similar to FCS results but: no reference answers shown, no self-view. Accessible to participants + Org Admin |
| 6.3 | Org assessment overview | Table of all assessments, filterable/sortable. Summary stats (total, avg score, pass rate, skip rate) |
| 6.4 | Repository assessment history | Per-repo history + line chart of aggregate score over time. "Trend data available after 3+ assessments" |

### Deferred: Open Issues (tech debt & polish)

| Issue | Title | Context |
|-------|-------|---------|
| #18 | Architecture fitness functions | Dependency boundary enforcement tests. Nice guardrail, not blocking |
| #22 | Harness improvement roadmap | Meta-issue tracking quality gate additions |
| #27 | Artefact quality detector | Classifies artefact completeness (code-only, code+requirements, etc.). Metadata flag stored with assessment. Not user-facing in MVP |
| #33 | Security and data trust docs | Documentation page for security posture. Marketing/trust, not functionality |
| #35 | Refactor truncateArtefacts | Decompose function, extract constants, guard negative budget |
| #36 | Improve quality classification | Better artefact quality heuristics + truncation notice in prompt |
| #37 | Track PR-centric field naming debt | DB/type naming uses PR-centric terms that should be generalised |
| #48 | Multi-PR merge strategy design | Design doc for how to merge artefacts from multiple PRs in FCS. MVP: concatenate all PR artefacts |
| #60 | PUT skip/close + POST reassess | Skip (PRCC), close with partial (FCS 3.5), reassess (FCS 3.6). All deferred |
| #84 | Migrate store_github_token to Vault | Security improvement for GitHub provider token storage |
| #88 | Recover Vault migration | Lost migration from #84 needs recovery |
| #89 | OrgCard + repo count | UI polish for org-select page |
| #90 | Loading skeleton for org-select | UI polish |
| #91 | E2E tests: org selection flow | Test coverage, not functionality |
| #95 | FCS self-view scores API | `GET /api/assessments/[id]/scores` for participant private view |

### Deferred: V2 Features (from requirements)

| Feature | Reference |
|---------|-----------|
| PR Decorator (Epic 7) | Requirements §V2 — exploratory questions posted as PR comment |
| OSS/alternative LLM models | Requirements §V2 — model abstraction via `LLMClient` port exists |
| Agentic artefact retrieval | Requirements §V2 — auto-fetch `additional_context_suggestions` |
| Expanded assessment areas (test strategy, operational, security) | Requirements §V2 |
| Comprehension decay tracking | Requirements §V2 — periodic re-assessment at 30/60/90 days |
| Comprehension-to-outcome correlation | Requirements §V2 — cross-ref with incidents |
| AI vs Human comprehension delta | Requirements §V2 — AI baseline scoring |
| Bus factor map | Requirements §V2 — feature × participant matrix |
| Artefact quality scoring (numerical) | Requirements §V2 — LLM-based quality score |
| Benchmark mode | Requirements §V2 — anonymised cross-org comparison |
