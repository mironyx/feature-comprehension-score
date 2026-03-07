# Feature Comprehension Score Tool — V1 Design Document

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.3 |
| Status | Draft |
| Author | LS / Claude |
| Created | 2026-03-04 |
| Last updated | 2026-03-06 |

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-03-04 | Initial draft — Capabilities and Components |
| 0.2 | 2026-03-05 | Applied confirmed decisions: role simplification, Naur layer names, trivial commit detection, question count defaults, diagram fix |
| 0.3 | 2026-03-06 | L3 Interactions: assessment lifecycle, PRCC flow, FCS flow, auth/session flow, configuration flow |

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

The single application serving all functionality. Hosted on Vercel or GCP (ADR-0002 pending).

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

**Status:** Under review.

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
  │                      │ cache org membership + admin status       │                  │
  │                      │─────────────────────────────────────────────────────────────►│
  │                      │ (user_organisations table: org_id, is_admin)                │
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
- **Org Admin detection:** `is_admin` flag cached in `user_organisations` at login, derived from GitHub organisation role (ADR-0004)

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

*To be completed after Level 3 is approved.*

API definitions:
- GitHub webhook payloads (incoming)
- Next.js API routes (internal)
- Anthropic Claude API prompts and response schemas
- Supabase table schemas and RLS policies

---

*This document is an artefact that will be used in our own Feature Comprehension Score assessment.*
