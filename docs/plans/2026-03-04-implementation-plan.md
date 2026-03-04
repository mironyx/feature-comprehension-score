# Implementation Plan — Feature Comprehension Score Tool

## Summary of Decisions from Requirements Review

All LS comments have been reviewed. Here is what changes or gets added:

### Confirmed Decisions

| Decision | Resolution |
|----------|-----------|
| **Roles** | Simplify. No super admin in V1. Org Admin (app-level, highest role), User, Author (contextual in PRCC), Reviewer (contextual in PRCC). GH roles used for permission checks but are NOT app roles. |
| **Auth** | Supabase Auth with GitHub as OAuth provider. Supabase manages sessions/tokens, GitHub provides identity. |
| **Hosting** | ADR needed — Vercel vs GCP (Cloud Run). |
| **FCS creation** | Simplified: select merged PRs as artefact source. Reuses PRCC artefact extraction. |
| **PR metadata** | V1 story: store comprehension score and skip status in PR metadata (labels or commit status) for external systems. |
| **PR size threshold** | ADR needed — lines changed vs files changed vs combination. |
| **Same app** | Yes, single app for both FCS and PRCC. |
| **Naur layers** | Corrected to proper names: (1) World-to-program mapping, (2) Design justification, (3) Modification capacity. Use prompts from article. |
| **Question count default** | PR: 3. Feature: 5. Both configurable 3-5. |
| **Auto-save drafts** | Deferred from V1. |
| **Naur layer breakdown in FCS results** | Deferred from V1. Just aggregate score. |
| **Trivial commits** | Should NOT invalidate assessment. Need heuristic (e.g., only docs/comments changed, < 5 lines). |
| **Warning banner** | Add UX guidance: "Finish your PR before requesting review" to avoid assessment invalidation. |
| **Admin-first UI** | Build admin interface first (full visibility), then restrict views for non-admin users. |
| **Check API** | Research spike needed — confirm Check Run blocks merge via branch protection rules. |

### New/Modified Stories Needed

| Story | Change |
|-------|--------|
| **Roles section** | Rewrite: Org Admin, User, Author (contextual), Reviewer (contextual). Remove Repo Admin, FCS Initiator, FCS Participant as separate roles — they are capabilities of Org Admin and User. |
| **Story 1.2** | Clarify: user selects org after login (org switcher). |
| **Story 1.5** | Add acceptance criteria: org selection flow, multi-org user experience. |
| **Story 2.2** | Add: artefact extraction output is passed to assessment engine (Story 4.1). Testable via unit test with sample PR data. |
| **Story 2.8** | Add: trivial commit detection (heuristic). Add: UX warning about finishing PR. |
| **NEW Story 2.9** | PR Metadata Export: store comprehension score and skip status in PR labels/commit status for external metrics systems. |
| **Story 3.1** | Rewrite: FCS created by selecting merged PRs (not file paths/branches/dates). |
| **Story 3.3** | Add: warning if selected PRs have active/in-progress PRCC assessments. |
| **Story 3.4** | Remove Naur layer breakdown from V1. Just aggregate + per-question aggregate. |
| **Story 4.1** | Update Naur layer names and prompts to match article text. |
| **Story 5.1** | Update: Supabase Auth with GitHub OAuth provider. |
| **Story 5.3** | Remove auto-save from V1. Simplify confirmation to just completion info. |
| **Story 5.4** | Update: admin-first approach. Build full interface, restrict views by role. |

### New ADRs Needed

| ADR | Question |
|-----|----------|
| **ADR-0001** | GitHub App as integration mechanism (vs GitHub Action) |
| **ADR-0002** | Hosting: Vercel vs GCP Cloud Run |
| **ADR-0003** | Auth: Supabase Auth + GitHub OAuth (documenting the approach) |
| **ADR-0004** | Roles & access control model |
| **ADR-0005** | Single aggregate score (no author/reviewer split) |
| **ADR-0006** | Soft/Hard enforcement modes |
| **ADR-0007** | PR size threshold criteria (lines vs files vs combination) |
| **ADR-0008** | Data model & multi-tenancy approach |

---

## Implementation Phases — Priority Order

### Phase 0: Foundation (this repo)

**Goal:** Resolve all design decisions, produce design documents, set up new repo.

**No code.** Only documents, ADRs, and research.

#### 0.1 Research Spikes

| Spike | Purpose | Output |
|-------|---------|--------|
| GitHub Check API | Confirm: Check Run + branch protection rules = merge blocked. Understand lifecycle (create, update, complete). | Findings doc or ADR section |
| Supabase Auth + GitHub OAuth | Confirm: session management, org membership verification, token refresh. Can we get user's GH org list from Supabase session? | Findings doc or ADR section |
| GitHub App permissions | Minimum scopes needed for: read PR, read code, write checks, read org membership. | Permission manifest |
| Vercel vs GCP Cloud Run | Cost, deployment complexity, cold starts, environment variables, preview deployments. | ADR-0002 |

#### 0.2 ADRs (priority order)

1. **ADR-0004: Roles & access control** — Blocks all UI stories. Define Org Admin, User, Author, Reviewer. How GH permissions map to app roles.
2. **ADR-0002: Hosting** — Blocks deployment architecture. Vercel vs GCP.
3. **ADR-0003: Auth** — Blocks web app. Supabase Auth + GitHub OAuth mechanics.
4. **ADR-0008: Data model** — Blocks all backend work. Multi-tenancy, org/repo/assessment/user tables, RLS approach.
5. **ADR-0001: GitHub App** — Blocks PRCC. Webhook setup, permissions, installation flow.
6. **ADR-0005: Aggregate score** — Documents the "no individual scores" decision.
7. **ADR-0006: Soft/Hard modes** — Documents enforcement modes.
8. **ADR-0007: PR size threshold** — Can be decided during implementation, but document before.

#### 0.3 Design Document

Continue the design walkthrough we started (Capabilities → Components → Interactions → Contracts):

1. **Capabilities** — Done (approved in conversation).
2. **Components** — Next. Define: Next.js app, GitHub App (webhook handler), Supabase (DB + Auth + RLS), Anthropic Claude API.
3. **Interactions** — Data flow between components for each capability.
4. **Contracts** — API definitions: webhook payloads, internal API routes, LLM prompt/response schemas, Supabase table schemas.

Write to: `docs/design/v1-design.md`

#### 0.4 Updated Requirements

Incorporate all LS comments into the requirements doc. Apply changes from the "New/Modified Stories" table above.

Write to: `docs/requirements/v1-requirements.md`

#### 0.5 New Repo Setup

- Create public GitHub repo
- Initial structure: `docs/`, `src/`, `tests/`, CLAUDE.md, README
- Copy finalised requirements, design doc, and ADRs
- Set up CI (linting, tests)

**Phase 0 exit criteria:**
- All ADRs written and approved
- Design document complete through Contracts level
- Requirements updated with all LS feedback
- New repo created and structured

---

### Phase 1: Assessment Engine (new repo)

**Goal:** The core value. Generate questions, score answers, detect relevance, calculate aggregates. Testable independently.

**Priority: Highest.** If this doesn't work, nothing else matters.

| Step | What | Stories |
|------|------|---------|
| 1.1 | LLM integration — Anthropic Claude API client with retry + error handling | 4.5 |
| 1.2 | Question generation — 3 Naur layer prompts, rubric output (questions + weights + reference answers) | 4.1 |
| 1.3 | Answer scoring — Score individual answer against reference, 0.0-1.0 | 4.2 |
| 1.4 | Relevance detection — Binary relevant/not-relevant classification | 4.4 |
| 1.5 | Aggregate calculation — Weighted score across all participants | 4.3 |
| 1.6 | Artefact quality flagging — Detect what artefact types are present | 4.1 |

**Test approach:** Unit tests with sample artefacts (PR diffs, descriptions, code files). Can run the full generate → score → aggregate pipeline without any UI or GitHub integration.

**Phase 1 exit criteria:**
- Can feed sample artefacts → get generated questions with rubric
- Can feed sample answers → get scores
- Can detect rubbish answers
- Can calculate aggregate from multiple participants
- All core logic has test coverage

---

### Phase 2: Web App + Auth + Database (new repo)

**Goal:** The shell. Authentication, database schema, basic UI. No GitHub integration yet.

| Step | What | Stories |
|------|------|---------|
| 2.1 | Supabase project setup — Tables, RLS policies, auth config | 1.5, ADR-0008 |
| 2.2 | Next.js app scaffold — Project setup, deployment pipeline | — |
| 2.3 | GitHub OAuth via Supabase Auth — Sign in, session, org membership | 5.1 |
| 2.4 | Org selection flow — User with multiple orgs selects which to view | 1.2, 1.5 |
| 2.5 | Role-based access — Org Admin vs User, permission checks | 5.2, ADR-0004 |
| 2.6 | Assessment answering UI — Question display, answer submission, confirmation | 5.3, 2.4, 3.3 |
| 2.7 | Basic navigation — Admin-first: My Assessments, Organisation, Repo Settings | 5.4 |

**Test approach:** Can sign in, see org selection, submit answers to a manually-created assessment.

**Phase 2 exit criteria:**
- Auth flow works end-to-end
- Database schema deployed with RLS
- Can display questions and collect answers
- Role-based visibility works

---

### Phase 3: PRCC Flow — GitHub Integration (new repo)

**Goal:** The primary use case. PR opened → questions generated → participants answer → merge gated.

| Step | What | Stories |
|------|------|---------|
| 3.1 | GitHub App registration + webhook endpoint | 1.1, ADR-0001 |
| 3.2 | PR event detection — Webhook handler for opened/ready_for_review/reviewer_changed | 2.1 |
| 3.3 | PR artefact extraction — Diff, description, linked issues, file contents, tests | 2.2 |
| 3.4 | Assessment creation — Generate rubric via engine, store in DB, identify participants | 2.1, 4.1 |
| 3.5 | GitHub Check Run — Create check, post link, update on completion | 2.3 |
| 3.6 | Soft mode enforcement — Relevance validation on answer submission | 2.5 |
| 3.7 | Hard mode enforcement — Scoring + threshold check + Check Run update | 2.6 |
| 3.8 | PR update handling — Invalidation on new commits, debounce, trivial commit detection | 2.8 |
| 3.9 | Gate skip — Admin skip with reason, Check Run neutral | 2.7 |
| 3.10 | PR metadata export — Write score/skip to PR labels or commit status | 2.9 (new) |
| 3.11 | Repo configuration — Enable/disable PRCC, enforcement mode, threshold, question count | 1.3, 1.4 |

**Phase 3 exit criteria:**
- GitHub App installed on test repo
- PR opened → webhook fires → questions generated → Check posted
- Author + reviewers answer → scored → Check updated
- Merge blocked on failure, allowed on success
- Skip flow works
- Score visible in PR metadata

---

### Phase 4: FCS Flow (new repo)

**Goal:** Feature-level comprehension. Reuses assessment engine + web app from PRCC.

| Step | What | Stories |
|------|------|---------|
| 4.1 | FCS assessment creation — Select merged PRs, aggregate artefacts | 3.1 |
| 4.2 | Participant nomination — Select GitHub users, send email notification | 3.2 |
| 4.3 | FCS answering — Same UI as PRCC, no Check Run integration | 3.3 |
| 4.4 | FCS scoring + results — Aggregate score, per-question aggregate, reference answers shown | 3.4 |
| 4.5 | Partial participation — Close early, score on available responses | 3.5 |
| 4.6 | FCS repo configuration — Enable/disable, question count | 1.3 |

**Phase 4 exit criteria:**
- Can create FCS from selected PRs
- Participants notified and can answer
- Score calculated and displayed
- Partial participation handled

---

### Phase 5: Reporting & Polish (new repo)

**Goal:** Results visibility, org overview, trends.

| Step | What | Stories |
|------|------|---------|
| 5.1 | PRCC results page — Aggregate score, per-question, no individual attribution, no reference answers | 6.1 |
| 5.2 | FCS results page — Aggregate, per-question, reference answers shown, artefact quality note | 6.2 |
| 5.3 | Organisation overview — Table of all assessments, filters, summary stats | 6.3 |
| 5.4 | Repository history — Assessment list + trend chart | 6.4 |
| 5.5 | Org-level default configuration UI | 1.4 |

**Phase 5 exit criteria:**
- All results pages working
- Org overview shows assessments across repos
- Trend chart renders
- Dogfooding: run FCS against our own artefacts

---

## Immediate Next Steps

In this repo, in order:

1. **Continue design walkthrough** — Components level (we approved Capabilities, Components is next)
2. **Write ADR-0004: Roles & access control** — Unblocks everything
3. **Research spike: GitHub Check API** — Unblocks PRCC design
4. **Research spike: Supabase Auth + GitHub OAuth** — Unblocks auth design
5. **Write ADR-0002: Hosting** — Unblocks deployment
6. **Continue design: Interactions, then Contracts**
7. **Write remaining ADRs** (0001, 0003, 0005-0008)
8. **Update requirements doc** with all LS comment resolutions
9. **Create new repo** and move finalised artefacts

---

## Key Principles

- **No code until Contracts are agreed.** Design document must be complete through all 4 levels.
- **ADRs before implementation.** Every significant decision documented with rationale.
- **Assessment engine first.** Core value before integrations.
- **PRCC before FCS.** FCS reuses PRCC infrastructure.
- **Reporting last.** Needs data from completed assessments to be useful.
- **Small PRs.** Target < 200 lines. Dogfooding our own quality gate.

---

*Created: 2026-03-04*
