# Feature Comprehension Score Tool — V1 Design Document

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.5 |
| Status | Draft |
| Author | LS / Claude |
| Created | 2026-03-04 |
| Last updated | 2026-03-08 |

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-03-04 | Initial draft — Capabilities and Components |
| 0.2 | 2026-03-05 | Applied confirmed decisions: role simplification, Naur layer names, trivial commit detection, question count defaults, diagram fix |
| 0.3 | 2026-03-06 | L3 Interactions: assessment lifecycle, PRCC flow, FCS flow, auth/session flow, configuration flow |
| 0.4 | 2026-03-08 | L4 Contracts: database schema, RLS policies, API route contracts, LLM prompt/response schemas, webhook contract |
| 0.5 | 2026-03-08 | L4 review: drop trigger (app-layer updated_at), drop github_repo_full_name (derived via join), drop is_admin (use github_role), add pgsodium key management docs, RESTful API (answers/PUT assessment/GET pr-participants), expand Naur layers in LLM system prompt |

---

## Design Levels

This document walks through four design levels, each approved before moving to the next:

1. **Capabilities** — What the system does (mapped to requirements)
2. **Components** — What the system is made of
3. **Interactions** — How components communicate (data flows)
4. **Contracts** — API definitions, schemas, payloads

**Reference:** Requirements are defined in `docs/requirements/v1-requirements.md`. Story numbers (e.g., 2.1) refer to that document.

---

## Level 1: Capabilities

What the system does, grouped by domain. Each capability maps to stories in the requirements.

### C1: Organisation Management

| Capability | Stories |
|-----------|---------|
| Register organisation on GitHub App install | 1.1 |
| Register/deregister repositories | 1.1 |
| Configure org-level defaults (enforcement mode, threshold, question count) | 1.4 |
| Configure per-repository settings (PRCC on/off, FCS on/off, mode, threshold, min PR size, exempt patterns) | 1.3 |
| Enforce multi-tenant data isolation | 1.5 |

### C2: PR Comprehension Check (PRCC)

| Capability | Stories |
|-----------|---------|
| Detect PR events (opened, ready for review, reviewer changed) | 2.1 |
| Skip assessment for small PRs or exempt files | 2.1 |
| Extract PR artefacts (diff, description, linked issues, file contents, tests) | 2.2 |
| Create GitHub Check Run with assessment link | 2.3 |
| Update GitHub Check Run on completion (pass/fail/neutral) | 2.3, 2.6 |
| Allow Org Admin to skip assessment with reason | 2.7 |
| Invalidate and regenerate assessment on new commits (with debounce); skip invalidation for trivial commits | 2.8 |
| Export score/skip to PR metadata for external systems | 2.9 |

### C3: Feature Comprehension Score (FCS)

| Capability | Stories |
|-----------|---------|
| Create feature assessment from selected merged PRs | 3.1 |
| Notify participants via email | 3.2 |
| Send reminder after configurable timeout | 3.2 |
| Close assessment with partial participation | 3.5 |
| Trigger early scoring on partial data | 3.4, 3.5 |

### C4: Assessment Engine (shared by PRCC and FCS)

| Capability | Stories |
|-----------|---------|
| Generate 3-5 questions across Naur's three layers (world-to-program mapping, design justification, modification capacity) from artefacts | 4.1 |
| Generate fixed rubric (questions + weights + reference answers) in single LLM call | 4.1 |
| Flag artefact quality (code-only, code+requirements, etc.) | 4.1 |
| Score individual answers against reference (separate LLM call per answer) | 4.2 |
| Detect irrelevant/rubbish answers (binary relevant/not-relevant) | 4.4 |
| Calculate weighted aggregate score across all participants | 4.3 |
| Enforce Soft mode (all must answer relevantly) | 2.5 |
| Enforce Hard mode (aggregate must pass threshold) | 2.6 |
| Handle LLM failures with retry + graceful degradation | 4.5 |

### C5: Authentication & Access Control

| Capability | Stories |
|-----------|---------|
| Authenticate users via Supabase Auth + GitHub OAuth | 5.1 |
| Verify organisation membership | 5.2 |
| Enforce role-based access (Org Admin, User, Author, Reviewer) | 5.2 |
| Restrict assessment access to listed participants only | 5.2 |

### C6: Assessment Participation

| Capability | Stories |
|-----------|---------|
| Display questions without reference answers | 5.3 |
| Collect and store answers | 5.3 |
| Prevent resubmission | 2.4 |
| Re-answer flow for irrelevant answers (max 3 attempts) | 2.5 |
| Display UX notice about PR completion before review (PRCC only) | 2.8 |

**Notes:** Auto-save of draft answers is deferred to V2. Question count defaults differ by assessment type: PRCC defaults to 3, FCS defaults to 5 (both configurable 3-5).

### C7: Reporting & Results

| Capability | Stories |
|-----------|---------|
| Show PRCC assessment results (aggregate score, per-question aggregate, no individual attribution, no reference answers) | 6.1 |
| Show FCS assessment results (aggregate score, per-question aggregate, reference answers visible, artefact quality note) | 6.2 |
| Organisation overview (all assessments, filterable/sortable, summary stats) | 6.3 |
| Repository assessment history with trend chart | 6.4 |

**Key observation:** C4 (Assessment Engine) is the core — it serves both C2 and C3. Everything else is integration (GitHub), presentation (web app), or access control.

**Status:** Approved.

---

## Level 2: Components

The building blocks of the system.

### Component 1: Next.js Application

The single application serving all functionality. Hosted on GCP Cloud Run (ADR-0002).

| Responsibility | Detail |
|---------------|--------|
| **Webhook handler** | API route (`/api/webhooks/github`) receives GitHub App events |
| **Assessment API** | Internal API routes for creating assessments, submitting answers, fetching results |
| **Web UI** | Question answering interface, results pages, org dashboard, repo config |
| **Auth orchestration** | Manages Supabase Auth sessions, org selection, role checks |

This is NOT two apps. The GitHub App webhook handler and the web UI are routes within the same Next.js application.

### Component 2: GitHub Platform

External system. We integrate with it, we do not control it.

| Integration point | How we use it |
|-------------------|--------------|
| **GitHub App** | Installed on customer orgs. Receives webhook events, granted permissions to read PRs/code and write Checks. |
| **Webhooks** | GitHub sends PR events (opened, ready_for_review, synchronize, review_requested) to our webhook endpoint. |
| **REST API** | We call it to: fetch PR diffs, file contents, linked issues, org membership, user roles. |
| **Check Runs API** | We create and update Check Runs on PRs (pending → success/failure/neutral). Branch protection rules enforce the merge gate. |
| **OAuth** | GitHub is the identity provider (via Supabase Auth). Users sign in with their GitHub account. |

### Component 3: Supabase

Backend-as-a-service providing three sub-components:

| Sub-component | Responsibility |
|--------------|----------------|
| **PostgreSQL database** | All persistent state: organisations, repositories, assessments, questions, responses, scores, configuration. |
| **Row-Level Security (RLS)** | Multi-tenancy enforcement. Every table has `org_id`-scoped policies. Queries automatically filtered by authenticated user's org. |
| **Supabase Auth** | Session management, token refresh, GitHub OAuth flow. Stores user identity. Provides JWT for API route auth. |

We do NOT use Supabase Realtime or Storage in V1.

### Component 4: Anthropic Claude API

External LLM service. Three distinct call patterns:

| Call type | Input | Output | When |
|-----------|-------|--------|------|
| **Question generation** | Artefacts (diff, description, code, tests) + Naur layer prompts | Rubric: 3-5 questions + weights + reference answers (structured JSON) | Assessment created |
| **Answer scoring** | One question + reference answer + one participant answer | Score 0.0-1.0 + brief rationale (structured JSON) | After participant submits |
| **Relevance detection** | One question + one participant answer | Relevant/not-relevant + explanation (structured JSON) | After participant submits (Soft mode) |

Each call is independent. No conversation/context threading. Scoring calls are one-per-answer (never batched across participants).

### Component 5: Email Service

For FCS participant notifications only. PRCC uses GitHub Check (no email needed).

| Responsibility | Detail |
|---------------|--------|
| Send assessment invitation | When FCS is created, email nominated participants with link |
| Send reminder | Single reminder after configurable timeout (default 48h) |

V1 approach TBD — could be Supabase Edge Functions + Resend, or a simple transactional email service. Lightweight; not a core component.

### Component Boundary Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Next.js Application                   │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  Webhook     │  │  Assessment  │  │   Web UI       │  │
│  │  Handler     │  │  API Routes  │  │   (React)      │  │
│  │  /api/webhooks│  │  /api/...   │  │   Pages/       │  │
│  └──────┬───────┘  └──────┬───────┘  └───────┬────────┘  │
│         │                 │                   │           │
│         └────────┬────────┴───────────────────┘           │
│                  │                                        │
│         ┌────────▼────────┐                               │
│         │  Assessment     │                               │
│         │  Engine         │                               │
│         │  (shared lib)   │                               │
│         └────────┬────────┘                               │
│                  │                                        │
└──────────────────┼────────────────────────────────────────┘
                   │
       ┌───────────┼───────────────┬──────────────┐
       │           │               │              │
       ▼           ▼               ▼              ▼
┌──────────┐ ┌──────────┐  ┌─────────────┐ ┌───────────┐
│  GitHub  │ │ Supabase │  │  Anthropic  │ │  Email    │
│ Platform │ │ (DB+Auth)│  │  Claude API │ │  Service  │
└──────────┘ └──────────┘  └─────────────┘ └───────────┘
```

**Key point:** The Assessment Engine is a shared library *within* the Next.js app, not a separate service. It is called by both the webhook handler (PRCC) and the API routes (FCS). No microservices.

**Status:** Approved.

---

## Level 3: Interactions

Data flows between components for each major capability. Each flow identifies which component initiates, which responds, what data passes, and which authentication context is used.

**Authentication context key:** Interactions with the GitHub API use one of two token types. Every GitHub API call below is annotated with which context it uses.

| Context | Token type | Obtained by | Used for |
|---------|-----------|-------------|----------|
| **Installation** | Installation access token (1h TTL) | Webhook handler exchanges app JWT for token via `installation.id` | All GitHub API reads and writes (PR data, Check Runs) — server-to-server |
| **User OAuth** | Stored GitHub provider token | Captured once at `/auth/callback`, encrypted in DB | User-initiated GitHub calls (org membership, FCS PR data fetch) and user data in our DB |

### 3.0 Assessment Lifecycle

Both PRCC and FCS assessments share the same state machine. Understanding this lifecycle is prerequisite to the flow-specific sections below.

```
                           ┌──────────┐
                           │ created  │
                           └────┬─────┘
                                │ PR context fetched
                                ▼
                      ┌────────────────────┐
                      │ rubric_generation  │──── LLM failure (after retries)
                      └─────────┬──────────┘     ──► generation_failed
                                │ rubric stored
                                ▼
                      ┌──────────────────┐
                      │awaiting_responses│◄─── reviewer added
                      └───────┬──────────┘     (same questions)
                              │ all participants submitted
                              ▼
                         ┌─────────┐
                         │ scoring │──── LLM failure (partial)
                         └────┬────┘     ──► completed (with scoring_incomplete flag)
                              │ scores calculated
                              ▼
                        ┌───────────┐
                        │ completed │
                        └───────────┘
```

Additional transitions (PRCC only — FCS operates on merged PRs so has no new commits or merge gates):

| Trigger | From state | To state | Detail |
|---------|-----------|----------|--------|
| Non-trivial commit pushed | Any active state | `invalidated` | Current assessment archived, new one created (Story 2.8) |
| Trivial commit pushed | Any active state | No change | Heuristic: docs/comments only or < 5 lines changed (Story 2.8) |
| Org Admin skips gate | Any active state | `skipped` | Reason recorded, Check Run set to `neutral` (Story 2.7) |
| Auto-skip (size/exempt) | `created` | `skipped` | PR below threshold or all files exempt (Story 2.1) |

### 3.1 PRCC Flow

#### Phase 1: Trigger and assessment creation (Stories 2.1, 2.2, 2.3)

```
GitHub              Webhook Handler         Supabase           Claude API       GitHub API
  │                      │                     │                    │               │
  │ pull_request event   │                     │                    │               │
  │ (opened/ready/sync)  │                     │                    │               │
  │─────────────────────►│                     │                    │               │
  │                      │ fetch repo config   │                    │               │
  │                      │────────────────────►│                    │               │
  │                      │◄────────────────────│                    │               │
  │                      │                     │                    │               │
  │                      │ [skip check: size threshold,             │               │
  │                      │  exempt patterns, PRCC enabled]          │               │
  │                      │                     │                    │               │
  │                      │ fetch PR context ◄INSTALLATION TOKEN►     │               │
  │                      │─────────────────────────────────────────────────────────►│
  │                      │◄─────────────────────────────────────────────────────────│
  │                      │ (diff, files, description, linked issues, tests)         │
  │                      │                     │                    │               │
  │                      │ generate rubric     │                    │               │
  │                      │────────────────────────────────────────►│               │
  │                      │◄────────────────────────────────────────│               │
  │                      │ (questions + weights + reference answers)│               │
  │                      │                     │                    │               │
  │                      │ store assessment    │                    │               │
  │                      │────────────────────►│                    │               │
  │                      │                     │                    │               │
  │                      │ create Check Run ◄INSTALLATION TOKEN►   │               │
  │                      │─────────────────────────────────────────────────────────►│
  │                      │ (in_progress, name="Comprehension Check",               │
  │                      │  external_id=assessment_uuid,                           │
  │                      │  details_url=assessment_page_link)                      │
  │                      │◄─────────────────────────────────────────────────────────│
```

**Auto-skip path:** If the PR is below the configured minimum line count or all changed files match exempt patterns, the webhook handler skips PR context extraction and rubric generation. Instead, it creates a Check Run with conclusion `neutral` and summary explaining why the check was skipped. Assessment state → `skipped`.

**Debounce (Story 2.8):** When a `synchronize` event arrives (new commits pushed), the webhook handler sets a database flag with timestamp. If another `synchronize` event arrives within 60 seconds, it updates the flag with the new SHA. Processing begins only after the debounce window closes, using the latest SHA.

**Participants identified:** The PR author is always a participant. Required reviewers at the time of assessment creation are added as participants. Participant records stored in Supabase with contextual role (Author or Reviewer).

#### Phase 2: Participant answering (Stories 2.4, 2.5)

```
Participant          Web UI            Supabase Auth        Supabase DB        Claude API
  │                    │                    │                    │                  │
  │ click Check Run    │                    │                    │                  │
  │ "Details" link     │                    │                    │                  │
  │───────────────────►│                    │                    │                  │
  │                    │ verify session     │                    │                  │
  │                    │───────────────────►│                    │                  │
  │                    │◄───────────────────│                    │                  │
  │                    │                    │                    │                  │
  │                    │ [if unauthenticated: redirect to GitHub OAuth sign-in]    │
  │                    │                    │                    │                  │
  │                    │ check participant  │                    │                  │
  │                    │ access (RLS)       │                    │                  │
  │                    │────────────────────────────────────────►│                  │
  │                    │◄────────────────────────────────────────│                  │
  │                    │                    │                    │                  │
  │                    │ [if not listed: access denied]          │                  │
  │                    │ [if already submitted: show completion message]            │
  │                    │                    │                    │                  │
  │ display questions  │                    │                    │                  │
  │◄───────────────────│                    │                    │                  │
  │                    │                    │                    │                  │
  │ submit answers     │                    │                    │                  │
  │───────────────────►│                    │                    │                  │
  │                    │ store responses    │                    │                  │
  │                    │────────────────────────────────────────►│                  │
  │                    │                    │                    │                  │
  │                    │ relevance check (per answer)            │                  │
  │                    │──────────────────────────────────────────────────────────►│
  │                    │◄──────────────────────────────────────────────────────────│
  │                    │ (relevant / not_relevant + explanation) │                  │
  │                    │                    │                    │                  │
  │ [if irrelevant:    │                    │                    │                  │
  │  re-answer prompt  │                    │                    │                  │
  │  up to 3 attempts] │                    │                    │                  │
  │                    │                    │                    │                  │
  │                    │ update participant │                    │                  │
  │                    │ status             │                    │                  │
  │                    │────────────────────────────────────────►│                  │
  │                    │                    │                    │                  │
  │ confirmation       │                    │                    │                  │
  │ ("2 of 3 done")   │                    │                    │                  │
  │◄───────────────────│                    │                    │                  │
```

**Relevance re-answer loop (Story 2.5):** If the LLM classifies an answer as not relevant, the participant sees the explanation and can re-answer. After 3 failed attempts on the same question, the answer is accepted and the assessment is flagged for Org Admin review. The re-answer loop happens synchronously within the submission flow.

**Progress updates:** After each participant submits, and when reviewers are added or removed, the Check Run summary is updated with the current completion count (e.g., "2 of 3 participants have completed"). Uses **installation token**.

#### Phase 3: Scoring and gate resolution (Stories 2.6, 4.2, 4.3, 4.5)

Triggered when the last participant submits (all participants have status `submitted`).

```
Assessment API        Claude API          Supabase DB         GitHub API
  │                      │                    │                    │
  │ score answer 1       │                    │                    │
  │─────────────────────►│                    │                    │
  │◄─────────────────────│                    │                    │
  │ (score 0.0–1.0 +    │                    │                    │
  │  rationale)          │                    │                    │
  │                      │                    │                    │
  │ score answer 2       │                    │                    │
  │─────────────────────►│                    │                    │
  │◄─────────────────────│                    │                    │
  │ ... (one call per    │                    │                    │
  │  answer — isolated   │                    │                    │
  │  to prevent cross-   │                    │                    │
  │  contamination)      │                    │                    │
  │                      │                    │                    │
  │ store all scores     │                    │                    │
  │──────────────────────────────────────────►│                    │
  │                      │                    │                    │
  │ calculate aggregate  │                    │                    │
  │ sum(score×weight) /  │                    │                    │
  │ sum(max×weight)      │                    │                    │
  │──────────────────────────────────────────►│                    │
  │                      │                    │                    │
  │ evaluate gate (ADR-0006):                 │                    │
  │ ┌─────────────────────────────────────┐   │                    │
  │ │ Soft: conclusion = success          │   │                    │
  │ │ Hard: score ≥ threshold → success   │   │                    │
  │ │       score < threshold → failure   │   │                    │
  │ └─────────────────────────────────────┘   │                    │
  │                      │                    │                    │
  │ update Check Run ◄INSTALLATION TOKEN►     │                    │
  │────────────────────────────────────────────────────────────────►
  │ (status=completed, conclusion=success|failure|neutral)         │
  │◄────────────────────────────────────────────────────────────────
```

**One LLM call per answer** (Story 4.2): Each answer is scored in a separate LLM call to prevent scoring contamination — batching multiple participants' answers in one call risks the LLM being influenced by one answer when scoring another.

**Scoring runs in both modes** (ADR-0006): In Soft mode, scores are calculated and stored for reporting but the conclusion is always `success`. In Hard mode, the aggregate score determines the conclusion.

**LLM error handling (Story 4.5):** Each scoring call retries up to 3 times with exponential backoff. If a scoring call fails after retries, the individual answer is marked `scoring_failed` and the aggregate is calculated from available scores. The assessment completes with a `scoring_incomplete` flag.

**PR metadata export (Story 2.9):** After Check Run completion, the aggregate score and outcome are written to the PR as a commit status for external systems to consume.

#### PRCC sub-flows

**PR update — non-trivial commit (Story 2.8):**

1. `synchronize` webhook event received
2. Debounce check (60s window, database-backed)
3. Diff the new commit against previous HEAD
4. Apply trivial commit heuristic (docs/comments only, or < 5 lines changed)
5. If non-trivial: current assessment → `invalidated`, new assessment created (Phase 1 restarts)
6. If trivial: no action, existing assessment continues

**Reviewer change (Story 2.1):**

- `review_requested` event: new participant added to existing assessment with same questions. Assessment remains in `awaiting_responses`. Check Run completion count updated (e.g., "1 of 3" → "1 of 4").
- `review_request_removed` event: participant soft-deleted (responses retained for audit). Check Run completion count updated. If all remaining participants have submitted, scoring triggers immediately.

**Gate skip (Story 2.7):**

1. Org Admin opens assessment in Web UI, clicks "Skip"
2. Mandatory reason field submitted
3. Assessment → `skipped`, skip event recorded (user, timestamp, reason)
4. Check Run updated: conclusion `neutral`, annotation "Comprehension check skipped: [reason]"

### 3.2 FCS Flow

#### Phase 1: Assessment creation (Story 3.1)

```
Org Admin        Next.js App          GitHub API        Claude API       Supabase DB
  │                   │                    │                 │                │
  │ create FCS        │                    │                 │                │
  │ (feature name,    │                    │                 │                │
  │  merged PRs)      │                    │                 │                │
  │──────────────────►│                    │                 │                │
  │                   │                    │                 │                │
  │                   │ fetch PR context ◄USER OAUTH TOKEN►  │               │
  │                   │───────────────────►│                 │                │
  │                   │◄───────────────────│                 │                │
  │                   │ (diff, files, description, linked issues, tests)     │
  │                   │                    │                 │                │
  │                   │ [if insufficient PR context: warn Org Admin,         │
  │                   │  proceed with available data]        │                │
  │                   │                    │                 │                │
  │ auto-suggested    │                    │                 │                │
  │ participants      │                    │                 │                │
  │ (from PR authors  │                    │                 │                │
  │  + reviewers)     │                    │                 │                │
  │◄──────────────────│                    │                 │                │
  │                   │                    │                 │                │
  │ confirm/edit      │                    │                 │                │
  │ participant list  │                    │                 │                │
  │──────────────────►│                    │                 │                │
  │                   │                    │                 │                │
  │                   │ generate rubric    │                 │                │
  │                   │───────────────────────────────────►│                │
  │                   │◄───────────────────────────────────│                │
  │                   │                    │                 │                │
  │                   │ store assessment + rubric + participants             │
  │                   │────────────────────────────────────────────────────►│
  │                   │                    │                 │                │
  │                   │ send invitations ──────────────────────► Email Service
  │                   │                    │                 │                │
  │ confirmation      │                    │                 │                │
  │◄──────────────────│                    │                 │                │
```

**Key difference from PRCC:** FCS uses the **user OAuth token** (stored encrypted) to fetch PR context from GitHub, not the installation token. This is because FCS creation is a user-initiated action via the Web UI, not a webhook-triggered server process.

**Participants:** Auto-suggested from the authors and reviewers of the selected merged PRs. The Org Admin can add or remove participants before confirming. This avoids manual username entry while keeping the Org Admin in control.

**PR context extraction:** Reuses the same extraction logic as PRCC (diff, files, description, linked issues, tests) but applied across multiple merged PRs. If the PR context is insufficient (e.g., single empty file, no description), the system warns the Org Admin and proceeds — thin context produces thin questions, surfacing the quality gap by design (Story 3.1).

**Note:** Story 3.1 updated in requirements v0.3 to reflect auto-suggest participant selection from PR authors/reviewers.

#### Phase 2: Participant answering (Story 3.3)

Identical to PRCC Phase 2 (section 3.1). The shared assessment engine handles both PRCC and FCS answering. The only UI difference: FCS shows "Feature: [name]" instead of "PR: #[number]".

No Check Run is created for FCS — there is no GitHub gate to enforce.

#### Phase 3: Scoring and results (Stories 3.4, 3.5)

Same scoring mechanics as PRCC Phase 3: one LLM call per answer, aggregate calculation, scores stored.

Differences from PRCC:

| Aspect | PRCC | FCS |
|--------|------|-----|
| Trigger | All participants submitted | All submitted, OR Org Admin triggers early |
| Gate outcome | Check Run updated (success/failure) | No gate — score stored for display only |
| Partial participation | Not applicable (all must submit) | Org Admin can close and score partial data |
| Reference answers | Never shown to participants | Shown on results page after completion |
| Results access | Participants + Org Admin | Participants + Org Admin |

**Early scoring (Story 3.4):** Org Admin can trigger scoring before all participants answer. The result page shows "Score based on N of M participants".

**Close without full participation (Story 3.5):** After the configured timeout, Org Admin can close the assessment. Non-responders are recorded as "did not participate" (not scored as zero). Scoring proceeds with available responses.

#### Phase 4: Notification (Story 3.2)

```
Assessment API        Email Service         Participant
  │                       │                      │
  │ send invitation       │                      │
  │ (feature name, repo,  │                      │
  │  question count, link)│                      │
  │──────────────────────►│                      │
  │                       │ email                │
  │                       │─────────────────────►│
  │                       │                      │
  │ ... 48h timeout ...   │                      │
  │                       │                      │
  │ send reminder         │                      │
  │──────────────────────►│                      │
  │                       │ reminder email       │
  │                       │─────────────────────►│
```

Single reminder only. No further follow-up after the reminder. The Org Admin can close the assessment with partial participation if needed.

### 3.3 Authentication and Session Flow

#### User OAuth sign-in (Stories 5.1, 5.2)

```
Browser              Next.js App          Supabase Auth         GitHub OAuth        Supabase DB
  │                      │                     │                     │                  │
  │ click "Sign in       │                     │                     │                  │
  │  with GitHub"        │                     │                     │                  │
  │─────────────────────►│                     │                     │                  │
  │                      │ initiate PKCE flow  │                     │                  │
  │                      │────────────────────►│                     │                  │
  │                      │                     │ redirect to GitHub  │                  │
  │◄───────────────────────────────────────────│────────────────────►│                  │
  │                      │                     │                     │                  │
  │ user authorises      │                     │                     │                  │
  │─────────────────────────────────────────────────────────────────►│                  │
  │                      │                     │                     │                  │
  │                      │                     │ exchange auth code  │                  │
  │                      │                     │◄────────────────────│                  │
  │                      │                     │ (gets GitHub OAuth  │                  │
  │                      │                     │  token, user profile)│                  │
  │                      │                     │                     │                  │
  │ redirect to          │                     │                     │                  │
  │ /auth/callback       │                     │                     │                  │
  │ (with Supabase code) │                     │                     │                  │
  │─────────────────────►│                     │                     │                  │
  │                      │ exchange code for:  │                     │                  │
  │                      │ - access JWT (1h)   │                     │                  │
  │                      │ - refresh token     │                     │                  │
  │                      │ - provider token ◄──┤ ONE-TIME ONLY       │                  │
  │                      │◄────────────────────│                     │                  │
  │                      │                     │                     │                  │
  │                      │ store provider token (encrypted)          │                  │
  │                      │─────────────────────────────────────────────────────────────►│
  │                      │                     │                     │                  │
  │                      │ fetch org membership using provider token │                  │
  │                      │─────────────────────────────────────────►│                  │
  │                      │◄─────────────────────────────────────────│                  │
  │                      │ (GET /user/orgs — requires read:org)     │                  │
  │                      │                     │                     │                  │
  │                      │ cache org membership + role                │                  │
  │                      │─────────────────────────────────────────────────────────────►│
  │                      │ (user_organisations table: org_id, github_role)              │
  │                      │                     │                     │                  │
  │ set session cookies  │                     │                     │                  │
  │ redirect to dashboard│                     │                     │                  │
  │◄─────────────────────│                     │                     │                  │
```

**Provider token is one-time** (ADR-0003): The GitHub OAuth token is passed through by Supabase only at the callback. If not captured and stored, it is lost. Stored encrypted in our database for later use (FCS PR context fetching, org membership refresh).

**OAuth scopes:** `user:email` (identity) + `read:org` (organisation membership). NOT `repo` — repository access is via the installation token, not the user token.

#### Session management

- **Access JWT** stored in HTTP-only cookies, 1-hour expiry
- **Next.js middleware** runs before every page render and API route, refreshes the JWT via Supabase if expired
- **RLS enforcement:** Supabase JWT claims (user ID) are used directly in Row-Level Security policies. Every database query is automatically scoped to the user's organisations via `user_organisations` table
- **Org Admin detection:** Derived from `github_role` in `user_organisations` (`'admin'` or `'owner'`), cached at login from GitHub API (ADR-0004)

#### Installation token flow (reference)

Used by the webhook handler for server-to-server GitHub API calls. Detailed in `docs/design/spike-003-github-check-api.md`. Summary:

1. Webhook payload includes `installation.id`
2. App generates JWT from private key + app ID
3. JWT exchanged for installation access token (1-hour TTL)
4. Token used for: reading PR data, creating/updating Check Runs
5. Octokit SDK manages token lifecycle automatically

### 3.4 Configuration Flow

Settings are stored in Supabase and applied at assessment creation time (not retroactively). Two levels with cascading defaults.

#### Settings cascade

```
┌───────────────────────────────────────┐
│ Organisation defaults                 │
│ (set by Org Admin, apply to all repos │
│  without explicit overrides)          │
└──────────────────┬────────────────────┘
                   │ inherited unless overridden
                   ▼
┌───────────────────────────────────────┐
│ Repository configuration              │
│ (set by Org Admin per repo,           │
│  overrides org defaults)              │
└───────────────────────────────────────┘
```

#### Configurable settings (Story 1.3, 1.4)

| Setting | Default | Scope | Effect |
|---------|---------|-------|--------|
| PRCC enabled | Yes | Per-repo | Whether PR events trigger assessments |
| FCS enabled | Yes | Per-repo | Whether FCS creation is available |
| Enforcement mode | Soft | Per-repo (org default cascades) | Gate evaluation logic (ADR-0006) |
| Score threshold | 70% | Per-repo | Only meaningful in Hard mode |
| PRCC question count | 3 | Per-repo | Questions generated for PR assessments |
| FCS question count | 5 | Per-repo | Questions generated for feature assessments |
| Min PR size | 20 lines | Per-repo | PRs below this are auto-skipped |
| Exempt file patterns | (none) | Per-repo | Glob patterns for files that do not trigger PRCC |

#### Configuration interaction

1. Org Admin opens repo settings in Web UI
2. Web UI → Assessment API: update configuration
3. Assessment API → Supabase: store in repository config table (or organisation defaults table)
4. On next assessment creation (PRCC or FCS), the webhook handler/API reads the effective config (repo-specific if set, otherwise org default)

Changes take effect on the next assessment only. In-progress assessments use the configuration that was active when they were created.

### Interaction patterns summary

| Pattern | Where it applies | Detail |
|---------|-----------------|--------|
| **Two auth contexts** | All GitHub API calls | Installation token for webhooks; user OAuth for FCS and org membership |
| **Shared assessment engine** | PRCC Phase 2-3, FCS Phase 2-3 | Same answering, relevance, and scoring logic; differ only in trigger and gate resolution |
| **Async boundaries** | Webhook processing, LLM calls, email | Webhook handler processes events asynchronously; LLM calls have retry logic; email sending is fire-and-forget |
| **RLS enforcement** | All database access | Supabase RLS policies scope every query to the user's organisations; no application-level tenant filtering |
| **LLM error handling** | Question generation, scoring, relevance | Retry 3× with exponential backoff; graceful degradation on exhaustion (Story 4.5) |

**Status:** Approved.

---

## Level 4: Contracts

Precise definitions for all system interfaces: database schema, row-level security policies, API routes, webhook handling, and LLM prompts. These contracts are the implementation specification — code should be derivable from this section without ambiguity.

**Reference:** All tables, policies, and routes trace back to the components (L2), interactions (L3), and ADRs. Cross-references are noted inline.

### 4.1 Database Schema

All tables use UUIDs as primary keys (`gen_random_uuid()`). Timestamps are `timestamptz` defaulting to `now()`. Every table carries an `org_id` column for RLS enforcement (ADR-0008).

#### `updated_at` convention

Tables with an `updated_at` column rely on the **application layer** to set `updated_at = now()` in every UPDATE query. All writes go through our Next.js API routes or webhook handler, so this is reliably enforced without a database trigger.

> **Note:** `GENERATED ALWAYS AS (now()) STORED` is not viable — PostgreSQL requires generated column expressions to be immutable, and `now()` is classified as `STABLE`.

#### organisations

Tenant registry. One row per GitHub App installation (Story 1.1).

```sql
CREATE TABLE organisations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_org_id   bigint UNIQUE NOT NULL,
  github_org_name text NOT NULL,
  installation_id bigint UNIQUE NOT NULL,
  status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'inactive')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

#### org_config

Organisation-level default settings (Story 1.4). One row per organisation. Created alongside the organisation on app installation.

```sql
CREATE TABLE org_config (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL UNIQUE
                              REFERENCES organisations(id) ON DELETE CASCADE,
  prcc_enabled             boolean NOT NULL DEFAULT true,
  fcs_enabled              boolean NOT NULL DEFAULT true,
  enforcement_mode         text NOT NULL DEFAULT 'soft'
                              CHECK (enforcement_mode IN ('soft', 'hard')),
  score_threshold          integer NOT NULL DEFAULT 70
                              CHECK (score_threshold BETWEEN 0 AND 100),
  prcc_question_count      integer NOT NULL DEFAULT 3
                              CHECK (prcc_question_count BETWEEN 3 AND 5),
  fcs_question_count       integer NOT NULL DEFAULT 5
                              CHECK (fcs_question_count BETWEEN 3 AND 5),
  min_pr_size              integer NOT NULL DEFAULT 20
                              CHECK (min_pr_size > 0),
  trivial_commit_threshold integer NOT NULL DEFAULT 5
                              CHECK (trivial_commit_threshold > 0),
  exempt_file_patterns     text[] NOT NULL DEFAULT '{}',
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
```

#### repositories

Registered repositories (Story 1.1). Created when the GitHub App is installed on specific repos or when repos are added to an existing installation.

```sql
CREATE TABLE repositories (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL
                           REFERENCES organisations(id) ON DELETE CASCADE,
  github_repo_id        bigint NOT NULL,
  github_repo_name      text NOT NULL,
  status                text NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active', 'inactive')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, github_repo_id)
);

CREATE INDEX idx_repositories_org ON repositories (org_id);
```

#### repository_config

Per-repository settings (Story 1.3). All config columns nullable — `null` means inherit from `org_config`. The `get_effective_config()` function (section 4.2) resolves the cascade.

```sql
CREATE TABLE repository_config (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL
                              REFERENCES organisations(id) ON DELETE CASCADE,
  repository_id            uuid NOT NULL UNIQUE
                              REFERENCES repositories(id) ON DELETE CASCADE,
  prcc_enabled             boolean,
  fcs_enabled              boolean,
  enforcement_mode         text CHECK (enforcement_mode IN ('soft', 'hard')),
  score_threshold          integer CHECK (score_threshold BETWEEN 0 AND 100),
  prcc_question_count      integer CHECK (prcc_question_count BETWEEN 3 AND 5),
  fcs_question_count       integer CHECK (fcs_question_count BETWEEN 3 AND 5),
  min_pr_size              integer CHECK (min_pr_size > 0),
  trivial_commit_threshold integer CHECK (trivial_commit_threshold > 0),
  exempt_file_patterns     text[],
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
```

#### user_organisations

Junction table: user ↔ org membership (ADR-0004). Populated at login from GitHub API, refreshed on each sign-in. Org Admin status is derived from `github_role` (see `is_org_admin()` in section 4.2).

```sql
CREATE TABLE user_organisations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  github_user_id  bigint NOT NULL,
  github_username text NOT NULL,
  github_role     text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, org_id)
);

CREATE INDEX idx_user_orgs_user ON user_organisations (user_id);
CREATE INDEX idx_user_orgs_org ON user_organisations (org_id);
```

#### user_github_tokens

Encrypted GitHub OAuth provider tokens (ADR-0003). Captured once at `/auth/callback`. Encrypted via Supabase Vault (`pgsodium`). Used for FCS PR context fetching and org membership refresh.

```sql
CREATE TABLE user_github_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL UNIQUE
                     REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_token text NOT NULL,
  key_id          uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

`encrypted_token` is the pgsodium-encrypted GitHub provider token. `key_id` references the pgsodium key used for encryption. Decryption uses `pgsodium.crypto_aead_det_decrypt()`.

**Key management:** The encryption key is created once during project setup via migration:

```sql
SELECT id INTO github_token_key_id
FROM pgsodium.create_key(
  name := 'github_token_key',
  key_type := 'aead-det'
);
```

The returned `key_id` is stored as a database configuration parameter or referenced by name via `pgsodium.find_key('github_token_key')`. The actual key material never leaves the database — pgsodium manages it internally. Encryption and decryption wrappers:

```sql
-- Encrypt (called at /auth/callback when storing the token)
pgsodium.crypto_aead_det_encrypt(
  message    := convert_to(provider_token, 'utf8'),
  additional := convert_to(user_id::text, 'utf8'),
  key_id     := (SELECT id FROM pgsodium.find_key('github_token_key'))
)

-- Decrypt (called when FCS needs the token for GitHub API calls)
convert_from(
  pgsodium.crypto_aead_det_decrypt(
    ciphertext := encrypted_token::bytea,
    additional := convert_to(user_id::text, 'utf8'),
    key_id     := key_id
  ),
  'utf8'
)
```

The `additional` parameter binds the ciphertext to the user ID — a token encrypted for one user cannot be decrypted with a different user's context.

#### assessments

One row per PRCC or FCS assessment. Stores type, lifecycle state, results, and a snapshot of the effective configuration at creation time (Story 1.3 — config changes do not affect in-progress assessments).

```sql
CREATE TABLE assessments (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   uuid NOT NULL
                              REFERENCES organisations(id) ON DELETE CASCADE,
  repository_id            uuid NOT NULL
                              REFERENCES repositories(id) ON DELETE CASCADE,
  type                     text NOT NULL CHECK (type IN ('prcc', 'fcs')),
  status                   text NOT NULL DEFAULT 'created'
                              CHECK (status IN (
                                'created', 'rubric_generation',
                                'generation_failed', 'awaiting_responses',
                                'scoring', 'completed',
                                'invalidated', 'skipped'
                              )),

  -- PR context (PRCC only; null for FCS)
  pr_number                integer,
  pr_head_sha              text,

  -- Feature context (FCS only; null for PRCC)
  feature_name             text,
  feature_description      text,

  -- GitHub Check Run (PRCC only; null for FCS)
  check_run_id             bigint,

  -- Results
  aggregate_score          numeric(5,4),
  scoring_incomplete       boolean NOT NULL DEFAULT false,
  artefact_quality         text,
  conclusion               text CHECK (conclusion IN (
                              'success', 'failure', 'neutral'
                           )),

  -- Config snapshot (captured at creation)
  config_enforcement_mode  text NOT NULL,
  config_score_threshold   integer NOT NULL,
  config_question_count    integer NOT NULL,
  config_min_pr_size       integer NOT NULL,

  -- Skip tracking (Story 2.7)
  skip_reason              text,
  skipped_by               uuid REFERENCES auth.users(id),
  skipped_at               timestamptz,

  -- Invalidation chain (Story 2.8)
  superseded_by            uuid REFERENCES assessments(id),

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_assessments_org_repo
  ON assessments (org_id, repository_id);
CREATE INDEX idx_assessments_repo_pr
  ON assessments (repository_id, pr_number)
  WHERE pr_number IS NOT NULL;
CREATE INDEX idx_assessments_org_status
  ON assessments (org_id, status);
```

#### assessment_questions

Rubric: questions generated for an assessment. Immutable after creation. `aggregate_score` is populated during scoring (per-question aggregate across all participants).

```sql
CREATE TABLE assessment_questions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL
                      REFERENCES organisations(id) ON DELETE CASCADE,
  assessment_id    uuid NOT NULL
                      REFERENCES assessments(id) ON DELETE CASCADE,
  question_number  integer NOT NULL,
  naur_layer       text NOT NULL CHECK (naur_layer IN (
                      'world_to_program', 'design_justification',
                      'modification_capacity'
                   )),
  question_text    text NOT NULL,
  weight           integer NOT NULL CHECK (weight BETWEEN 1 AND 3),
  reference_answer text NOT NULL,
  aggregate_score  numeric(5,4),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, question_number)
);

CREATE INDEX idx_questions_org ON assessment_questions (org_id);
```

#### assessment_participants

Participant list with contextual role and completion status. Created by the webhook handler (PRCC) or FCS creation flow.

```sql
CREATE TABLE assessment_participants (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL
                      REFERENCES organisations(id) ON DELETE CASCADE,
  assessment_id    uuid NOT NULL
                      REFERENCES assessments(id) ON DELETE CASCADE,
  user_id          uuid REFERENCES auth.users(id),
  github_user_id   bigint NOT NULL,
  github_username  text NOT NULL,
  contextual_role  text NOT NULL CHECK (contextual_role IN (
                      'author', 'reviewer', 'participant'
                   )),
  status           text NOT NULL DEFAULT 'pending' CHECK (status IN (
                      'pending', 'submitted', 'removed',
                      'did_not_participate'
                   )),
  submitted_at     timestamptz,
  removed_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, github_user_id)
);

CREATE INDEX idx_participants_user
  ON assessment_participants (user_id)
  WHERE user_id IS NOT NULL;
CREATE INDEX idx_participants_org
  ON assessment_participants (org_id);
```

`user_id` is nullable because participants are identified from PR metadata (by `github_user_id`) before they sign in to the app. Linked to their Supabase user when they authenticate (see `link_participant()` in section 4.2).

#### participant_answers

Submitted answers. **No score column** — individual scores are calculated transiently during aggregate computation and discarded (ADR-0005).

```sql
CREATE TABLE participant_answers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                uuid NOT NULL
                           REFERENCES organisations(id) ON DELETE CASCADE,
  assessment_id         uuid NOT NULL
                           REFERENCES assessments(id) ON DELETE CASCADE,
  participant_id        uuid NOT NULL
                           REFERENCES assessment_participants(id)
                           ON DELETE CASCADE,
  question_id           uuid NOT NULL
                           REFERENCES assessment_questions(id)
                           ON DELETE CASCADE,
  answer_text           text NOT NULL,
  is_relevant           boolean,
  relevance_explanation text,
  attempt_number        integer NOT NULL DEFAULT 1
                           CHECK (attempt_number BETWEEN 1 AND 3),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, question_id, attempt_number)
);

CREATE INDEX idx_answers_assessment ON participant_answers (assessment_id);
CREATE INDEX idx_answers_org ON participant_answers (org_id);
```

Multiple attempts per question are stored (re-answer flow, Story 2.5). Only the latest relevant attempt is used for scoring. Maximum 3 attempts per question.

#### fcs_merged_prs

Links FCS assessments to the merged PRs they were created from (Story 3.1).

```sql
CREATE TABLE fcs_merged_prs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL
                   REFERENCES organisations(id) ON DELETE CASCADE,
  assessment_id uuid NOT NULL
                   REFERENCES assessments(id) ON DELETE CASCADE,
  pr_number     integer NOT NULL,
  pr_title      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_fcs_prs_assessment ON fcs_merged_prs (assessment_id);
```

#### sync_debounce

Tracks pending `synchronize` webhook events during the 60-second debounce window (Story 2.8, section 3.1).

```sql
CREATE TABLE sync_debounce (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL
                   REFERENCES organisations(id) ON DELETE CASCADE,
  repository_id uuid NOT NULL
                   REFERENCES repositories(id) ON DELETE CASCADE,
  pr_number     integer NOT NULL,
  latest_sha    text NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  process_after timestamptz NOT NULL,
  processed     boolean NOT NULL DEFAULT false
);

CREATE UNIQUE INDEX idx_debounce_active
  ON sync_debounce (repository_id, pr_number)
  WHERE NOT processed;
```

The partial unique index ensures only one active (unprocessed) debounce record exists per PR. When a new `synchronize` event arrives, the existing active record is updated with the new SHA and extended `process_after` timestamp.

### 4.2 Database Functions

#### RLS helper functions

Used by RLS policies to check user membership and admin status. Defined as `SECURITY DEFINER` to avoid circular RLS dependencies on `user_organisations`.

```sql
CREATE FUNCTION get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id
  FROM user_organisations
  WHERE user_id = auth.uid()
$$;

CREATE FUNCTION is_org_admin(check_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_organisations
    WHERE user_id = auth.uid()
      AND org_id = check_org_id
      AND github_role IN ('admin', 'owner')
  )
$$;

CREATE FUNCTION is_assessment_participant(check_assessment_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM assessment_participants
    WHERE assessment_id = check_assessment_id
      AND user_id = auth.uid()
      AND status != 'removed'
  )
$$;
```

#### Participant linking function

Links a Supabase user to their `assessment_participants` record when they first access an assessment. `SECURITY DEFINER` to bypass RLS (the participant record has no `user_id` yet).

```sql
CREATE FUNCTION link_participant(
  p_assessment_id uuid,
  p_github_user_id bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_id uuid;
BEGIN
  UPDATE assessment_participants
  SET user_id = auth.uid(), updated_at = now()
  WHERE assessment_id = p_assessment_id
    AND github_user_id = p_github_user_id
    AND user_id IS NULL
  RETURNING id INTO p_id;

  RETURN p_id;
END;
$$;
```

Safe because it only links the authenticated user (`auth.uid()`) to a participant record matching their GitHub user ID — cannot be used to impersonate another user.

#### Config cascade function

Resolves effective configuration for a repository by coalescing per-repo overrides with org defaults (section 3.4).

```sql
CREATE FUNCTION get_effective_config(repo_id uuid)
RETURNS TABLE (
  prcc_enabled             boolean,
  fcs_enabled              boolean,
  enforcement_mode         text,
  score_threshold          integer,
  prcc_question_count      integer,
  fcs_question_count       integer,
  min_pr_size              integer,
  trivial_commit_threshold integer,
  exempt_file_patterns     text[]
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(rc.prcc_enabled, oc.prcc_enabled),
    COALESCE(rc.fcs_enabled, oc.fcs_enabled),
    COALESCE(rc.enforcement_mode, oc.enforcement_mode),
    COALESCE(rc.score_threshold, oc.score_threshold),
    COALESCE(rc.prcc_question_count, oc.prcc_question_count),
    COALESCE(rc.fcs_question_count, oc.fcs_question_count),
    COALESCE(rc.min_pr_size, oc.min_pr_size),
    COALESCE(rc.trivial_commit_threshold, oc.trivial_commit_threshold),
    COALESCE(rc.exempt_file_patterns, oc.exempt_file_patterns)
  FROM repositories r
  JOIN org_config oc ON oc.org_id = r.org_id
  LEFT JOIN repository_config rc ON rc.repository_id = r.id
  WHERE r.id = repo_id
$$;
```

### 4.3 Row-Level Security Policies

All tables have RLS enabled. The webhook handler uses the Supabase service role (bypasses RLS). User-initiated operations use the Supabase client with the user's JWT (RLS enforced).

Policy naming convention: `{table}_{operation}_{who}`.

#### organisations

```sql
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY organisations_select_member ON organisations
  FOR SELECT USING (id IN (SELECT get_user_org_ids()));
```

No user-initiated INSERT/UPDATE/DELETE — organisations are managed by the webhook handler (service role) on GitHub App installation/removal.

#### org_config

```sql
ALTER TABLE org_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_config_select_member ON org_config
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY org_config_update_admin ON org_config
  FOR UPDATE USING (is_org_admin(org_id));
```

#### repositories

```sql
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;

CREATE POLICY repositories_select_member ON repositories
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));
```

#### repository_config

```sql
ALTER TABLE repository_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY repo_config_select_member ON repository_config
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY repo_config_insert_admin ON repository_config
  FOR INSERT WITH CHECK (is_org_admin(org_id));

CREATE POLICY repo_config_update_admin ON repository_config
  FOR UPDATE USING (is_org_admin(org_id));
```

#### user_organisations

```sql
ALTER TABLE user_organisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_orgs_select_own ON user_organisations
  FOR SELECT USING (user_id = auth.uid());
```

Users can only see their own org memberships. INSERT/UPDATE managed by the auth callback (service role).

#### user_github_tokens

```sql
ALTER TABLE user_github_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY tokens_select_own ON user_github_tokens
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY tokens_insert_own ON user_github_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY tokens_update_own ON user_github_tokens
  FOR UPDATE USING (user_id = auth.uid());
```

#### assessments

```sql
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY assessments_select_admin ON assessments
  FOR SELECT USING (is_org_admin(org_id));

CREATE POLICY assessments_select_participant ON assessments
  FOR SELECT USING (is_assessment_participant(id));

CREATE POLICY assessments_update_admin ON assessments
  FOR UPDATE USING (is_org_admin(org_id));
```

Org Admins see all assessments for their orgs. Participants see only assessments they are listed on. UPDATE restricted to Org Admins (for skip and close operations).

#### assessment_questions

```sql
ALTER TABLE assessment_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY questions_select_admin ON assessment_questions
  FOR SELECT USING (is_org_admin(org_id));

CREATE POLICY questions_select_participant ON assessment_questions
  FOR SELECT USING (is_assessment_participant(assessment_id));
```

**Note on reference answers:** Reference answers are stored in the database but filtered by the application layer. PRCC results never show reference answers; FCS results show them only after completion. RLS controls row access (who can see questions), not column access (which fields are returned).

#### assessment_participants

```sql
ALTER TABLE assessment_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY participants_select_admin ON assessment_participants
  FOR SELECT USING (is_org_admin(org_id));

CREATE POLICY participants_select_own ON assessment_participants
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY participants_update_own ON assessment_participants
  FOR UPDATE USING (user_id = auth.uid());
```

Org Admins see all participants (for FCS completion dashboard, Story 3.3). Users see only their own participant records. Initial `user_id` linking handled by `link_participant()` function (section 4.2).

#### participant_answers

```sql
ALTER TABLE participant_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY answers_insert_own ON participant_answers
  FOR INSERT WITH CHECK (
    participant_id IN (
      SELECT id FROM assessment_participants
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY answers_select_own ON participant_answers
  FOR SELECT USING (
    participant_id IN (
      SELECT id FROM assessment_participants
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY answers_select_admin ON participant_answers
  FOR SELECT USING (is_org_admin(org_id));
```

Participants can only insert and view their own answers. Org Admins can view all answers (for flagged assessment review, Story 2.5).

#### fcs_merged_prs

```sql
ALTER TABLE fcs_merged_prs ENABLE ROW LEVEL SECURITY;

CREATE POLICY fcs_prs_select_member ON fcs_merged_prs
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));
```

#### sync_debounce

```sql
ALTER TABLE sync_debounce ENABLE ROW LEVEL SECURITY;
```

No user-facing policies. Accessed exclusively via the webhook handler (service role).

### 4.4 API Route Contracts

All API routes use Next.js App Router route handlers (`app/api/.../route.ts`). Authentication is via Supabase Auth JWT (cookie-based, validated by `@supabase/ssr` middleware) unless otherwise noted.

**Common error responses:**

| Status | Body | When |
|--------|------|------|
| 401 | `{ error: "Unauthenticated" }` | No valid session |
| 403 | `{ error: "Forbidden" }` | Valid session, insufficient permissions |
| 404 | `{ error: "Not found" }` | Resource does not exist or not accessible via RLS |
| 422 | `{ error: string, details?: object }` | Validation failure |
| 500 | `{ error: "Internal server error" }` | Unhandled server error |

**Type aliases used below:**

```typescript
type AssessmentStatus =
  | 'created' | 'rubric_generation' | 'generation_failed'
  | 'awaiting_responses' | 'scoring' | 'completed'
  | 'invalidated' | 'skipped'

type NaurLayer =
  | 'world_to_program' | 'design_justification'
  | 'modification_capacity'

type Conclusion = 'success' | 'failure' | 'neutral'
type EnforcementMode = 'soft' | 'hard'
```

#### Webhook

##### `POST /api/webhooks/github`

Receives GitHub App webhook events. No JWT auth — verified via `X-Hub-Signature-256` header (HMAC-SHA256 of request body using the webhook secret).

**Headers:**

| Header | Purpose |
|--------|---------|
| `X-Hub-Signature-256` | HMAC signature for payload verification |
| `X-GitHub-Event` | Event type (`pull_request`, `installation`, etc.) |
| `X-GitHub-Delivery` | Unique delivery ID (for idempotency/logging) |

**Events handled:**

| Event | Action | Processing |
|-------|--------|------------|
| `installation` | `created` | Create `organisations` + `org_config` records; create `repositories` rows for selected repos |
| `installation` | `deleted` | Set org status to `inactive` |
| `installation_repositories` | `added` | Create `repositories` records |
| `installation_repositories` | `removed` | Set repository status to `inactive` |
| `pull_request` | `opened` | Initiate PRCC (skip check → fetch context → generate rubric → create Check Run) |
| `pull_request` | `ready_for_review` | Initiate PRCC if PR was draft |
| `pull_request` | `synchronize` | Insert/update `sync_debounce` record; process after 60s window |
| `pull_request` | `review_requested` | Add participant to existing assessment |
| `pull_request` | `review_request_removed` | Soft-remove participant; re-evaluate completion |

**Response:** `200 OK` with `{ received: true }`. Processing is asynchronous — the handler acknowledges receipt immediately.

#### Assessments

##### `GET /api/assessments`

List assessments for the current user. Returns assessments where the user is a participant, plus all org assessments if Org Admin.

**Query parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `org_id` | uuid | yes | — | Organisation to scope by |
| `type` | string | no | all | `prcc` or `fcs` |
| `status` | string | no | all | Assessment status filter |
| `page` | integer | no | 1 | Page number |
| `per_page` | integer | no | 20 | Items per page (max 100) |

**Response `200 OK`:**

```typescript
{
  assessments: {
    id: string
    type: 'prcc' | 'fcs'
    status: AssessmentStatus
    repository_name: string
    pr_number: number | null
    feature_name: string | null
    aggregate_score: number | null
    conclusion: Conclusion | null
    participant_count: number
    completed_count: number
    created_at: string
  }[]
  total: number
  page: number
  per_page: number
}
```

##### `GET /api/assessments/[id]`

Get assessment details. Includes questions. Reference answers filtered by application logic: never returned for PRCC; returned for FCS only when status is `completed`.

**Response `200 OK`:**

```typescript
{
  id: string
  type: 'prcc' | 'fcs'
  status: AssessmentStatus
  repository_name: string
  repository_full_name: string   // derived: org_name + '/' + repo_name
  pr_number: number | null
  pr_head_sha: string | null
  feature_name: string | null
  feature_description: string | null
  aggregate_score: number | null
  scoring_incomplete: boolean
  artefact_quality: string | null
  conclusion: Conclusion | null
  config: {
    enforcement_mode: EnforcementMode
    score_threshold: number
    question_count: number
  }
  questions: {
    id: string
    question_number: number
    naur_layer: NaurLayer
    question_text: string
    weight: number
    aggregate_score: number | null
    reference_answer: string | null
  }[]
  participants: {
    total: number
    completed: number
  }
  my_participation: {
    participant_id: string
    status: 'pending' | 'submitted'
    submitted_at: string | null
  } | null
  skip_info: {
    reason: string
    skipped_at: string
  } | null
  created_at: string
}
```

##### `POST /api/assessments/[id]/answers`

Submit answers for an assessment. Caller must be a participant. Handles both first submission and re-attempts for questions flagged as irrelevant — the server determines the attempt number from existing data.

**Request:**

```typescript
{
  answers: {
    question_id: string
    answer_text: string
  }[]
}
```

**Validation:** First submission must include answers for all questions. Re-attempts include only the questions that were flagged irrelevant. Returns `422` if participant has no remaining attempts for a question, or if participant status is already `submitted`.

**Response `200 OK`:**

```typescript
{
  status: 'accepted' | 'relevance_failed'
  results: {
    question_id: string
    is_relevant: boolean
    explanation: string | null
    attempts_remaining: number
  }[]
  participation: {
    completed: number
    total: number
  }
}
```

When `status` is `relevance_failed`, the client prompts re-answers for failed questions and calls this same endpoint again with only the failed questions.

##### `PUT /api/assessments/[id]`

Update assessment status. Requires Org Admin. Used for skip (PRCC) and close (FCS) operations.

**Request — skip (Story 2.7):**

```typescript
{
  action: 'skip'
  reason: string           // non-empty, mandatory
}
```

Only valid for PRCC assessments in an active state (not already completed/skipped/invalidated).

**Request — close (Story 3.5):**

```typescript
{
  action: 'close'
  trigger_scoring: boolean
}
```

Only valid for FCS assessments in `awaiting_responses` status.

**Response `200 OK` (skip):**

```typescript
{
  status: 'skipped'
  check_run_conclusion: 'neutral'
}
```

**Response `200 OK` (close):**

```typescript
{
  status: 'scoring' | 'completed'
  participants_scored: number
  participants_total: number
}
```

#### FCS Creation

##### `POST /api/fcs`

Create a new FCS assessment (Story 3.1). Requires Org Admin for the target repository's organisation.

**Request:**

```typescript
{
  org_id: string
  repository_id: string
  feature_name: string
  feature_description?: string
  merged_pr_numbers: number[]
  participants: {
    github_username: string
  }[]
}
```

**Validation:** At least one merged PR required. At least one participant required. All PR numbers must refer to merged PRs in the target repository.

**Response `201 Created`:**

```typescript
{
  assessment_id: string
  status: 'rubric_generation'
  participant_count: number
}
```

##### `GET /api/repos/[repoId]/pr-participants`

Get auto-suggested participants from merged PR authors and reviewers (Story 3.1). Requires Org Admin. This is a read operation — no state is created.

**Query parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `pr_numbers` | string | yes | Comma-separated PR numbers (e.g., `42,43,44`) |

**Response `200 OK`:**

```typescript
{
  participants: {
    github_username: string
    github_user_id: number
    role_summary: string
  }[]
}
```

`role_summary` describes the participant's relationship to the selected PRs (e.g., "Author of #42, Reviewer of #43").

#### Configuration

##### `GET /api/orgs/[orgId]/config`

Get organisation-level default configuration (Story 1.4). Requires Org Admin.

**Response `200 OK`:**

```typescript
{
  org_id: string
  prcc_enabled: boolean
  fcs_enabled: boolean
  enforcement_mode: EnforcementMode
  score_threshold: number
  prcc_question_count: number
  fcs_question_count: number
  min_pr_size: number
  trivial_commit_threshold: number
  exempt_file_patterns: string[]
}
```

##### `PUT /api/orgs/[orgId]/config`

Update organisation-level defaults. Requires Org Admin. Partial update — only include fields to change.

**Request:** Partial of the config object (all fields optional).

**Response `200 OK`:** Full updated config (same shape as GET).

##### `GET /api/repos/[repoId]/config`

Get effective repository configuration — repo overrides merged with org defaults (Story 1.3). Requires Org Admin.

**Response `200 OK`:**

```typescript
{
  repository_id: string
  effective: {
    prcc_enabled: boolean
    fcs_enabled: boolean
    enforcement_mode: EnforcementMode
    score_threshold: number
    prcc_question_count: number
    fcs_question_count: number
    min_pr_size: number
    trivial_commit_threshold: number
    exempt_file_patterns: string[]
  }
  overrides: {
    prcc_enabled: boolean | null
    fcs_enabled: boolean | null
    enforcement_mode: EnforcementMode | null
    score_threshold: number | null
    prcc_question_count: number | null
    fcs_question_count: number | null
    min_pr_size: number | null
    trivial_commit_threshold: number | null
    exempt_file_patterns: string[] | null
  }
}
```

`effective` shows the resolved config (repo + org fallback). `overrides` shows only repo-level values (`null` = inherited from org).

##### `PUT /api/repos/[repoId]/config`

Update repository-specific configuration. Requires Org Admin. Set a field to `null` to remove the override and inherit from org defaults.

**Request:** Partial of the overrides object.

**Response `200 OK`:** Full config (same shape as GET).

#### Reporting

##### `GET /api/orgs/[orgId]/assessments`

Organisation assessment overview (Story 6.3). Requires Org Admin.

**Query parameters:**

| Param | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `type` | string | no | all | `prcc` or `fcs` |
| `repository_id` | uuid | no | all | Filter by repository |
| `date_from` | ISO date | no | — | Start of date range |
| `date_to` | ISO date | no | — | End of date range |
| `conclusion` | string | no | all | `success`, `failure`, `neutral` |
| `sort_by` | string | no | `created_at` | Column to sort by |
| `sort_order` | string | no | `desc` | `asc` or `desc` |
| `page` | integer | no | 1 | Page number |
| `per_page` | integer | no | 20 | Items per page (max 100) |

**Response `200 OK`:**

```typescript
{
  assessments: {
    id: string
    type: 'prcc' | 'fcs'
    repository_name: string
    created_at: string
    aggregate_score: number | null
    conclusion: Conclusion | null
    participant_count: number
    completed_count: number
  }[]
  summary: {
    total_assessments: number
    average_score: number | null
    pass_rate: number
    skip_rate: number
  }
  total: number
  page: number
  per_page: number
}
```

##### `GET /api/repos/[repoId]/assessments`

Repository assessment history with trend data (Story 6.4). Requires org membership.

**Query parameters:** Same as org overview minus `repository_id`.

**Response `200 OK`:** Same shape as org overview, plus:

```typescript
{
  // ... same fields as org overview
  trend: {
    date: string
    aggregate_score: number
  }[] | null
}
```

`trend` is `null` if fewer than 3 completed assessments exist for the repository.

### 4.5 GitHub Webhook Payloads

Relevant fields extracted from incoming GitHub webhook payloads. Only fields used by our webhook handler are listed. Full payload documentation at [GitHub Docs](https://docs.github.com/en/webhooks/webhook-events-and-payloads).

#### `pull_request` event

```typescript
{
  action: 'opened' | 'ready_for_review' | 'synchronize'
           | 'review_requested' | 'review_request_removed'
  number: number
  pull_request: {
    number: number
    title: string
    body: string | null
    head: { sha: string, ref: string }
    base: { sha: string, ref: string }
    draft: boolean
    user: { id: number, login: string }
    requested_reviewers: { id: number, login: string }[]
    changed_files: number
    additions: number
    deletions: number
  }
  requested_reviewer?: { id: number, login: string }
  repository: {
    id: number
    name: string
    full_name: string
    owner: { id: number, login: string }
  }
  installation: { id: number }
}
```

#### `installation` event

```typescript
{
  action: 'created' | 'deleted'
  installation: {
    id: number
    account: { id: number, login: string, type: 'Organization' }
    app_id: number
  }
  repositories?: { id: number, name: string, full_name: string }[]
}
```

#### `installation_repositories` event

```typescript
{
  action: 'added' | 'removed'
  installation: { id: number }
  repositories_added: { id: number, name: string, full_name: string }[]
  repositories_removed: { id: number, name: string, full_name: string }[]
}
```

### 4.6 LLM Prompt and Response Contracts

All LLM calls use the Anthropic Messages API (`/v1/messages`) with structured JSON output (`response_format: { type: "json_object" }`). Each call type specifies: purpose, input variables, response schema, and validation rules.

**Shared configuration:**

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Model | `claude-sonnet-4-20250514` (or current Sonnet) | Balance of quality, cost, and latency |
| Temperature | 0.3 | Low variance for consistent output |
| Max tokens | 4096 | Sufficient for rubric and scoring responses |
| Retry policy | 3 attempts, exponential backoff (1s, 2s, 4s) | Story 4.5 |

#### Question generation (rubric)

Generates the complete rubric (questions, weights, reference answers) from PR/feature artefacts. Single LLM call per assessment (Story 4.1).

**System prompt purpose:** Act as a software comprehension assessor using Peter Naur's Theory Building framework. Generate questions across three Naur layers, weighted by importance, with reference answers derived strictly from provided artefacts. Flag artefact quality. The three layers:

1. **World-to-program mapping** — Does the developer understand which real-world behaviours this code handles and which it deliberately excludes? Questions test domain intent.
2. **Design justification** — Does the developer understand why key structural decisions were made, not just what they are? Questions test reasoning about trade-offs.
3. **Modification capacity** — Could the developer safely change or extend this code without breaking existing behaviour? Questions test awareness of dependencies and constraints.

**User prompt variables:**

| Variable | Source |
|----------|--------|
| `artefact_type` | `'pull_request'` or `'feature'` |
| `question_count` | From effective config (3–5) |
| `pr_diff` | Unified diff of changed files |
| `file_contents` | Full content of changed files (up to token budget) |
| `pr_description` | PR body text or feature description |
| `linked_issues` | Linked issue titles and bodies |
| `test_files` | Test file contents included in the PR |

**Response schema:**

```json
{
  "questions": [
    {
      "question_number": 1,
      "naur_layer": "world_to_program",
      "question_text": "string",
      "weight": 1,
      "reference_answer": "string"
    }
  ],
  "artefact_quality": "code_only",
  "artefact_quality_note": "string"
}
```

| Field | Constraints |
|-------|-------------|
| `questions` | Array of exactly `question_count` items |
| `naur_layer` | One of: `world_to_program`, `design_justification`, `modification_capacity` |
| `weight` | Integer 1–3 |
| `question_text` | Non-empty, short-answer format |
| `reference_answer` | Non-empty, derived from artefacts |
| `artefact_quality` | One of: `code_only`, `code_and_tests`, `code_and_requirements`, `code_requirements_and_design` |

**Validation:** Malformed or non-conforming responses trigger retry (Story 4.5). After 3 failures, assessment status → `generation_failed`, Check Run → `neutral`.

#### Answer scoring

Scores one participant answer against one reference answer. **One LLM call per answer** — never batched across participants to prevent scoring contamination (Story 4.2).

**System prompt purpose:** Evaluate a participant's answer against a reference answer. Score for factual correctness, completeness, and demonstrated understanding. Semantically equivalent answers with different wording must receive similar scores. Do not penalise for different terminology if the reasoning is sound.

**User prompt variables:**

| Variable | Source |
|----------|--------|
| `question_text` | From `assessment_questions` |
| `reference_answer` | From `assessment_questions` |
| `participant_answer` | Submitted answer text |

**Response schema:**

```json
{
  "score": 0.85,
  "rationale": "string"
}
```

| Field | Constraints |
|-------|-------------|
| `score` | Float 0.0–1.0 (two decimal places) |
| `rationale` | Non-empty, 1–2 sentences. Used for debugging only, never shown to participants |

**Validation:** `score` must be a number in [0.0, 1.0]. Malformed responses trigger retry. After 3 failures, answer marked `scoring_failed`; assessment completes with `scoring_incomplete` flag.

#### Relevance detection

Binary classification: genuine attempt vs. rubbish (Story 4.4). Called per answer at submission time.

**System prompt purpose:** Determine if the answer is a genuine attempt to address the question, regardless of factual correctness. Not relevant if: empty/whitespace, random characters, copy of question text, filler text ("I don't know", "n/a", "test"), or completely off-topic. Relevant if: factually incorrect but demonstrates a genuine attempt.

**User prompt variables:**

| Variable | Source |
|----------|--------|
| `question_text` | From `assessment_questions` |
| `participant_answer` | Submitted answer text |

**Response schema:**

```json
{
  "is_relevant": true,
  "explanation": "string"
}
```

| Field | Constraints |
|-------|-------------|
| `is_relevant` | Boolean |
| `explanation` | Non-empty when `is_relevant` is false (shown to participant as re-answer prompt). May be empty when `is_relevant` is true |

**Validation:** `is_relevant` must be boolean. Malformed responses trigger retry. After 3 failures, answer is accepted as relevant and flagged for Org Admin review.

### 4.7 Email Notification Contract

FCS participant notifications (Story 3.2). Email service implementation TBD (Supabase Edge Functions + Resend, or equivalent transactional email provider).

#### Invitation

| Field | Value |
|-------|-------|
| To | Participant's GitHub email (from `auth.users` profile) |
| Subject | `[FCS] Comprehension assessment: {feature_name}` |
| Body | Feature name, repository name, question count, assessment link |

Sent immediately when FCS assessment is created and rubric generation completes.

#### Reminder

| Field | Value |
|-------|-------|
| To | Participant's GitHub email |
| Subject | `[FCS] Reminder: {feature_name} assessment pending` |
| Body | Same variables as invitation, plus days elapsed |

Sent once after configurable timeout (default 48 hours). No further follow-up after the reminder.

**Status:** Under review.

---

*This document is an artefact that will be used in our own Feature Comprehension Score assessment.*
