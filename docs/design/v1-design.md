# Feature Comprehension Score Tool — V1 Design Document

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.2 |
| Status | Draft |
| Author | LS / Claude |
| Created | 2026-03-04 |
| Last updated | 2026-03-05 |

## Change Log

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-03-04 | Initial draft — Capabilities and Components |
| 0.2 | 2026-03-05 | Applied confirmed decisions: role simplification, Naur layer names, trivial commit detection, question count defaults, diagram fix |

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

*To be completed after Level 2 is approved.*

Data flows between components for each major capability:
- PRCC: PR opened → assessment created → questions answered → scored → Check updated
- FCS: Assessment created → participants notified → questions answered → scored → results displayed
- Auth: User signs in → org selected → role resolved → access enforced
- Config: Admin configures repo → settings stored → applied to next assessment

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
