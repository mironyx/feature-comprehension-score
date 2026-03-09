# V1 Implementation Plan — TDD/BDD Development

## Overview

This plan covers the full implementation of the Feature Comprehension Score Tool from first line of code to deployable product. It builds on the completed Phase 0 foundation (requirements v0.6, design v0.7, 8 ADRs) and adds a dedicated scaffolding phase for test infrastructure and architecture guardrails before any feature code is written.

All development follows a **TDD/BDD-first** discipline: tests are written before implementation, using BDD-style naming (`Given/When/Then` in `describe`/`it` blocks). The test pyramid — unit → integration → E2E — governs where coverage effort is spent.

## Current State

- **Requirements:** Complete (v0.6) — 6 epics, 24 stories, all acceptance criteria defined
- **Design:** Complete through L4 Contracts (v0.7) — database schema, RLS policies, API routes, LLM prompts, webhook contracts
- **ADRs:** 8 accepted — hosting (GCP Cloud Run), auth (Supabase + GitHub OAuth), data model (Supabase + RLS), GitHub App, aggregate scoring, enforcement modes, PR size threshold, roles
- **Tech stack decided:** Next.js (App Router), Supabase (PostgreSQL + Auth + RLS), Anthropic Claude API, GCP Cloud Run
- **Code written:** None. This is the first implementation plan.
- **Project board:** All 13 Phase 0 issues closed. Board is empty — Phase 1+ issues to be created.

## Desired End State

A deployed, functional SaaS product where:

1. A GitHub App installation triggers PRCC assessments on PRs (comprehension gate)
2. Org Admins create FCS assessments from merged PRs (retrospective diagnostic)
3. Both flows generate LLM-based comprehension questions, collect answers, and produce aggregate scores
4. All features have comprehensive test coverage across unit, integration, and E2E layers
5. CI pipeline enforces quality gates on every PR

**How to verify:** Full E2E test suite passes; manual smoke test of PRCC flow on a real GitHub repository; FCS flow completes end-to-end through the web UI.

## Out of Scope

- Jira/GitLab/Bitbucket integration
- Custom LLM prompt templates
- Individual score tracking across assessments
- Slack/Teams notifications
- Self-hosted deployment
- Auto-save draft answers
- Naur layer breakdown in FCS results
- LLM cost controls / rate limiting
- Data retention policies

(Full list in requirements v0.6, "Out of Scope for V1" section.)

## Approach

### Development Workflow

All code changes follow a **PR-based workflow** on feature branches, simulating real team development:

1. Each issue gets a feature branch (`feat/short-description` or `fix/short-description`)
2. Work is done on the branch following TDD (tests first, then implementation)
3. PR raised targeting `main`, targeting < 200 lines changed
4. Two-stage review: Claude agent does first-pass review (architecture, tests, quality), then human does final approval
5. Merge to main after approval

### Multi-Agent Workflow

Development uses **specialised role agents** simulating team roles. This is defined in a separate companion document (`docs/plans/2026-03-09-multi-agent-workflow.md`) but summarised here:

| Role | Responsibility |
|------|---------------|
| **Tester** | Writes BDD test specifications first (Red phase). Defines what the code must do before it exists. |
| **Developer** | Implements code to make tests pass (Green phase). Refactors. Raises PR. |
| **Reviewer** | First-pass automated review: architecture fitness, test coverage, code quality. Human does final approval. |

The TDD cycle maps to agent handoffs: Tester → Developer → Reviewer → Human approval → Merge.

### Database Migrations

Supabase CLI's built-in migration system — no third-party tools (Atlas, Prisma, etc.):

- Migration files: `supabase/migrations/YYYYMMDDHHMMSS_name.sql` (plain SQL)
- Local dev: `supabase db reset` applies all migrations + seed data
- Type generation: `supabase gen types typescript` produces types matching schema
- Remote push: `supabase db push` applies pending migrations to remote project
- CI: migrations validated in the integration test stage

### TDD/BDD Methodology

Every task follows the Red-Green-Refactor cycle:

1. **Red:** Write failing tests first (BDD-style: `describe('Given X, when Y')` / `it('then Z')`)
2. **Green:** Write the minimum code to make tests pass
3. **Refactor:** Clean up while keeping tests green

### Test Pyramid

| Layer | Tool | What it covers | Rough ratio |
|-------|------|----------------|-------------|
| **Unit** | Vitest | Pure functions, business logic, utilities, LLM prompt builders, score calculations | ~70% |
| **Integration** | Vitest + Supabase test client | API routes against test database, RLS policy enforcement, webhook handlers | ~20% |
| **E2E** | Playwright | Critical user journeys: auth flow, answer submission, results viewing, config changes | ~10% |

### Test Data Strategy

| Concern | Approach |
|---------|----------|
| **LLM responses** | Fixtures — recorded real responses, replayed in tests. No live LLM calls in CI. |
| **Database** | Per-test transaction rollback (integration tests). Seed data factories for common entities. |
| **GitHub API** | MSW (Mock Service Worker) for HTTP-level mocking of GitHub REST API responses. |
| **Supabase Auth** | Test helpers that create authenticated Supabase clients with known user JWTs. |

### Architecture Guardrails

Enforced in CI from day one:

- **Dependency boundaries** — Assessment engine must not import from Next.js, GitHub, or Supabase modules (pure business logic)
- **Import restrictions** — No circular dependencies; enforced via ESLint rules
- **Bundle size limits** — Tracked per route (prevent accidental bloat)
- **PR size** — Target < 200 lines changed (dogfooding our own quality gate)
- **TypeScript strict mode** — No `any`, no implicit returns, strict null checks

---

## Phase 0.5: Scaffolding & Infrastructure

**Goal:** Project skeleton with CI, test infrastructure, and architecture guardrails — before any feature code.

**Exit criteria:**
- Next.js app builds and deploys to GCP Cloud Run (empty shell)
- `vitest run` executes a trivial test and passes
- `npx playwright test` executes a trivial E2E test and passes
- CI pipeline runs lint, type-check, unit tests, integration tests, and E2E tests
- Supabase local dev environment runs with migration tooling
- Architecture fitness tests enforce dependency boundaries

### 0.5.1 Next.js Project Initialisation

**What:** Scaffold the Next.js application with TypeScript, App Router, and project structure.

**Stories:** None directly — infrastructure prerequisite.

**Issues to create:**
1. **Initialise Next.js project with TypeScript strict mode** — `create-next-app` with App Router, TypeScript, ESLint. Configure `tsconfig.json` with strict settings (`strict: true`, `noUncheckedIndexedAccess: true`). Set up path aliases (`@/` for `src/`). Establish folder structure:
   ```
   src/
     app/              # Next.js App Router pages and API routes
     lib/              # Shared libraries
       engine/         # Assessment engine (pure business logic)
       github/         # GitHub API client
       supabase/       # Supabase client and helpers
     types/            # Shared TypeScript types
   ```

**Tests first:** A single smoke test that verifies the dev server starts:
```
describe('Next.js application')
  it('builds without errors')
```

**Success criteria:**
- [ ] `npm run build` succeeds
- [ ] `npm run dev` starts the dev server
- [ ] TypeScript strict mode enforced — `any` types fail compilation
- [ ] Path aliases resolve correctly

---

### 0.5.2 Test Infrastructure

**What:** Set up Vitest for unit/integration tests and Playwright for E2E tests. Configure test utilities and conventions.

**Issues to create:**
1. **Configure Vitest with BDD conventions and coverage** — Install Vitest, configure for TypeScript + JSX. Set up coverage thresholds (statements: 80%, branches: 80%). Create test utility files: factory helpers, mock builders. Establish naming convention: `*.test.ts` for unit, `*.integration.test.ts` for integration.
2. **Configure Playwright for E2E testing** — Install Playwright, configure for Chromium. Set up base URL, auth state persistence, test fixtures. Create a smoke E2E test that loads the home page. Establish naming convention: `*.e2e.ts`.
3. **Set up MSW for API mocking** — Install MSW (Mock Service Worker). Create handler factories for GitHub API responses (PR data, Check Runs, org membership). Create handler factories for Anthropic Claude API responses (question generation, scoring, relevance).

**Tests first:**
```
describe('Test infrastructure')
  it('Vitest runs and reports coverage')
  it('Playwright launches browser and navigates')
  it('MSW intercepts HTTP requests')
```

**Success criteria:**
- [ ] `npx vitest run` passes with coverage report
- [ ] `npx playwright test` passes smoke test
- [ ] MSW handlers intercept and mock external API calls
- [ ] Coverage thresholds enforced in CI

---

### 0.5.3 CI/CD Pipeline

**What:** GitHub Actions workflow that runs on every PR and push to main.

**Issues to create:**
1. **Create GitHub Actions CI workflow** — Workflow with jobs: lint (ESLint + markdownlint), type-check (`tsc --noEmit`), unit tests (Vitest), integration tests (Vitest with Supabase), E2E tests (Playwright), build. Cache node_modules and Playwright browsers. Fail fast on lint/type errors.
2. **Configure GCP Cloud Run deployment** — Dockerfile for Next.js production build. Deploy-on-merge to main. Staging environment for PR previews (stretch goal — defer if complex).

**Tests first:** The CI pipeline itself is the test — its first run should execute the smoke tests from 0.5.1 and 0.5.2.

**Success criteria:**
- [ ] PR triggers CI workflow that passes
- [ ] Merge to main triggers deployment to Cloud Run
- [ ] CI fails on lint errors, type errors, or test failures
- [ ] Pipeline completes in < 5 minutes (target)

---

### 0.5.4 Supabase Local Development

**What:** Local Supabase instance with migration tooling for schema-as-code development.

**Issues to create:**
1. **Set up Supabase CLI and local development** — Install Supabase CLI, `supabase init`. Configure local project with auth, database, and storage. Create initial migration from L4 schema (all tables, indexes, functions, RLS policies from design doc v0.7). Verify migration applies cleanly. Set up `supabase/seed.sql` with test data.
2. **Create Supabase test helpers** — Helper functions for integration tests: create authenticated Supabase client with test user JWT, transaction wrapper for test isolation, factory functions for creating test organisations/repos/assessments. Type generation with `supabase gen types`.

**Tests first:**
```
describe('Supabase local environment')
  it('migrations apply without errors')
  it('RLS policies enforce org isolation')
  it('test helpers create and clean up data')
```

**Success criteria:**
- [ ] `supabase start` launches local instance
- [ ] `supabase db reset` applies all migrations cleanly
- [ ] Generated TypeScript types match schema
- [ ] Integration test template connects and queries successfully
- [ ] RLS smoke test verifies org isolation

---

### 0.5.5 Architecture Fitness Functions

**What:** Automated checks that enforce architectural boundaries from the design.

**Issues to create:**
1. **Create architecture boundary tests** — Tests that verify:
   - Assessment engine (`src/lib/engine/`) imports nothing from `src/app/`, `src/lib/github/`, or `src/lib/supabase/` (pure business logic boundary)
   - No circular dependencies between modules
   - All database access goes through Supabase client (no raw `pg` connections)
   - API routes follow RESTful naming convention from L4 contracts

**Tests first:**
```
describe('Architecture fitness')
  describe('Given the assessment engine module')
    it('then it has no dependencies on framework or infrastructure modules')
  describe('Given the module dependency graph')
    it('then there are no circular dependencies')
```

**Success criteria:**
- [ ] Architecture tests run in CI
- [ ] Tests fail if engine imports framework modules
- [ ] Tests fail on circular dependency introduction

---

### 0.5.6 Linting and Code Quality

**What:** ESLint, Prettier, and quality gate configuration.

**Issues to create:**
1. **Configure ESLint and Prettier** — ESLint with TypeScript rules, import ordering, no-unused-vars. Prettier for consistent formatting. Integrate with CI. Add pre-commit hook (lint-staged + husky) for local enforcement. Configure CodeScene integration if available in CI.

**Tests first:** Not applicable — tooling configuration. Verified by CI execution.

**Success criteria:**
- [ ] `npm run lint` passes on clean codebase
- [ ] `npm run format:check` passes
- [ ] Pre-commit hook runs lint on staged files

**Pause here for manual verification before proceeding to Phase 1.**

---

## Phase 1: Assessment Engine

**Goal:** Core business logic — question generation, answer scoring, relevance detection, aggregate calculation. Fully testable in isolation with no database, no GitHub, no UI dependencies.

**Priority: Highest.** If this doesn't work, nothing else matters.

**Exit criteria:**
- Feed sample artefacts → get generated questions with rubric
- Feed sample answers → get scores
- Detect rubbish answers reliably
- Calculate correct aggregate from multiple participants
- All core logic has > 90% unit test coverage
- Assessment engine has zero imports from framework/infrastructure modules

### 1.1 LLM Client Wrapper

**What:** Typed Anthropic Claude API client with retry logic, error handling, and structured response parsing.

**Stories:** 4.5

**Issues to create:**
1. **Create Anthropic client wrapper with retry and error handling** — Typed client that wraps `@anthropic-ai/sdk`. Retry up to 3 times with exponential backoff (1s, 2s, 4s). Parse structured JSON responses with Zod validation. Handle malformed responses (unparseable JSON, missing fields) as retryable failures. Log errors with request context (minus answer text for privacy). Return typed result or typed error (no thrown exceptions in business logic).
2. **Create LLM response fixtures and mock factory** — Record real Claude API responses for each call type (generation, scoring, relevance). Create mock factory that returns fixtures for unit tests. Ensure fixtures cover: valid response, malformed JSON, partial response, rate limit error, server error.

**Tests first:**
```
describe('LLM client wrapper')
  describe('Given a successful API call')
    it('then it returns parsed, validated response')
  describe('Given a malformed JSON response')
    it('then it retries up to 3 times')
  describe('Given a rate limit error (429)')
    it('then it retries with exponential backoff')
  describe('Given all retries exhausted')
    it('then it returns a typed error, not an exception')
  describe('Given a valid response with missing required fields')
    it('then it treats it as malformed and retries')
```

**Success criteria:**
- [ ] `npx vitest run src/lib/engine/llm` — all tests pass
- [ ] Client handles all error scenarios without throwing
- [ ] Retry timing follows exponential backoff
- [ ] Response validation catches malformed LLM output

---

### 1.2 Question Generation

**What:** Generate comprehension questions from development artefacts using three Naur layer prompts.

**Stories:** 4.1

**Issues to create:**
1. **Create artefact input types and prompt builders** — Define TypeScript types for assessment artefacts (diff, description, file contents, linked issues, tests). Build three system prompts (one per Naur layer) following the exact prompt text from requirements Story 4.1. Each prompt builder takes artefacts and returns the formatted system + user message. Token-aware: truncate artefacts to fit context window, prioritising by relevance (description > diff > full files > tests).
2. **Create question generation function** — Takes artefacts + question count (3–5) → calls LLM client → parses rubric (questions + weights + reference answers). Single LLM call produces the full rubric. Validates output: correct number of questions, weights 1–3, non-empty reference answers, valid Naur layer assignment. Detects artefact quality (code-only, code+requirements, full) and returns as metadata flag.
3. **Create artefact quality detector** — Analyses artefact inputs to determine quality level: `code_only` (no description, no linked issues), `code_and_requirements` (has description or linked issues), `full` (has description, linked issues, and design docs/tests). Returns quality flag as metadata.

**Tests first:**
```
describe('Prompt builders')
  describe('Given a full set of artefacts (diff, description, issues, code, tests)')
    it('then it builds prompts for all three Naur layers')
  describe('Given code-only artefacts')
    it('then it builds code-focused prompts and flags artefact quality')
  describe('Given artefacts exceeding token limit')
    it('then it truncates by priority (description > diff > files > tests)')

describe('Question generation')
  describe('Given valid artefacts and question count of 3')
    it('then it returns 3 questions with weights and reference answers')
  describe('Given valid artefacts and question count of 5')
    it('then it returns 5 questions across all three Naur layers')
  describe('Given the LLM returns malformed output')
    it('then it retries and returns error if all retries fail')
  describe('Given code-only artefacts')
    it('then it returns questions with artefact_quality flag set to code_only')

describe('Artefact quality detection')
  describe('Given artefacts with no description and no linked issues')
    it('then it returns code_only')
  describe('Given artefacts with description but no design docs')
    it('then it returns code_and_requirements')
```

**Success criteria:**
- [ ] `npx vitest run src/lib/engine/generation` — all tests pass
- [ ] Prompt text matches requirements Story 4.1 exactly
- [ ] Question count respects configuration (3–5)
- [ ] Artefact quality detection works for all three levels

---

### 1.3 Answer Scoring

**What:** Score a participant's answer against the reference answer on a 0.0–1.0 scale.

**Stories:** 4.2

**Issues to create:**
1. **Create answer scoring function** — Takes one question + reference answer + one participant answer → calls LLM client → returns score (0.0–1.0) + rationale. Each answer scored in a separate LLM call (no batching — prevents scoring contamination). Scoring prompt evaluates: factual correctness, completeness, demonstration of understanding (not keyword matching). Semantically equivalent answers with different wording should receive similar scores.

**Tests first:**
```
describe('Answer scoring')
  describe('Given a correct, complete answer')
    it('then it returns a score >= 0.8')
  describe('Given a partially correct answer')
    it('then it returns a score between 0.3 and 0.7')
  describe('Given a completely wrong answer')
    it('then it returns a score <= 0.2')
  describe('Given a semantically equivalent answer with different wording')
    it('then it returns a similar score to the reference-matching answer')
  describe('Given an LLM failure during scoring')
    it('then it returns a scoring_failed result after retries')
```

**Success criteria:**
- [ ] `npx vitest run src/lib/engine/scoring` — all tests pass
- [ ] Each answer scored in isolation (separate LLM call)
- [ ] Score range validated: 0.0–1.0
- [ ] Failure case returns typed error, not exception

---

### 1.4 Relevance Detection

**What:** Binary classification of whether an answer is a genuine attempt or rubbish.

**Stories:** 4.4

**Issues to create:**
1. **Create relevance detection function** — Takes one question + one participant answer → calls LLM → returns `{ relevant: boolean, explanation: string }`. Detects: empty/whitespace, random characters, copy of question text, filler text ("I don't know", "n/a", "test"), completely off-topic. A factually incorrect but genuine attempt is "relevant".

**Tests first:**
```
describe('Relevance detection')
  describe('Given a genuine but incorrect answer')
    it('then it returns relevant: true')
  describe('Given random characters ("asdfgh")')
    it('then it returns relevant: false with explanation')
  describe('Given filler text ("I dont know")')
    it('then it returns relevant: false with explanation')
  describe('Given a copy of the question text')
    it('then it returns relevant: false with explanation')
  describe('Given an empty string')
    it('then it returns relevant: false with explanation')
  describe('Given a completely off-topic answer')
    it('then it returns relevant: false with explanation')
```

**Success criteria:**
- [ ] `npx vitest run src/lib/engine/relevance` — all tests pass
- [ ] Binary result + explanation returned
- [ ] Genuine attempts classified as relevant even if wrong

---

### 1.5 Aggregate Score Calculation

**What:** Calculate weighted aggregate score across all participants and questions.

**Stories:** 4.3

**Issues to create:**
1. **Create aggregate calculation function** — Pure function (no LLM, no DB). Takes array of `{ score, weight }` entries across all participants and questions. Calculates: `sum(score × weight) / sum(max_score × weight)`. Returns percentage. Handles edge cases: zero participants, partial scoring (some answers have `scoring_failed`), single participant. Also calculates per-question aggregate (same formula scoped to one question across all participants).

**Tests first:**
```
describe('Aggregate score calculation')
  describe('Given 2 participants, 3 questions, all scored')
    it('then it returns the correct weighted aggregate percentage')
  describe('Given all perfect scores')
    it('then it returns 100%')
  describe('Given all zero scores')
    it('then it returns 0%')
  describe('Given mixed weights (1, 2, 3)')
    it('then higher-weighted questions have proportionally more impact')
  describe('Given some answers with scoring_failed')
    it('then it calculates aggregate from available scores only')
  describe('Given a single participant')
    it('then it returns that participants weighted score')

describe('Per-question aggregate')
  describe('Given 3 participants scored on question 1')
    it('then it returns the mean score for that question')
```

**Success criteria:**
- [ ] `npx vitest run src/lib/engine/aggregate` — all tests pass
- [ ] Formula matches specification: `sum(score × weight) / sum(max_score × weight)`
- [ ] Edge cases handled without division-by-zero or NaN
- [ ] Per-question aggregate calculated correctly

---

### 1.6 Assessment Pipeline Integration

**What:** Wire the individual engine components into a complete pipeline: artefacts → generation → (answers) → scoring → aggregation.

**Stories:** 4.1–4.5 (integration)

**Issues to create:**
1. **Create assessment pipeline orchestrator** — Orchestrates the full flow: accepts artefacts, generates rubric, accepts answers, scores them, detects relevance, calculates aggregate. Returns structured result with all metadata. Handles partial failures gracefully (e.g., some scoring fails → aggregate from available). This is the main entry point that PRCC and FCS flows will call.

**Tests first:**
```
describe('Assessment pipeline')
  describe('Given valid artefacts')
    it('then it generates a rubric with questions, weights, and reference answers')
  describe('Given a generated rubric and submitted answers from 2 participants')
    it('then it scores all answers and returns correct aggregate')
  describe('Given one scoring call fails after retries')
    it('then it completes with scoring_incomplete flag and partial aggregate')
  describe('Given generation fails after retries')
    it('then it returns generation_failed status')
```

**Success criteria:**
- [ ] `npx vitest run src/lib/engine` — all tests pass, coverage > 90%
- [ ] Full pipeline testable with fixtures (no live LLM or DB)
- [ ] Engine module has zero imports from `src/app/`, `src/lib/github/`, `src/lib/supabase/`
- [ ] Architecture fitness test still passes

**Pause here for manual verification before proceeding to Phase 2.**

---

## Phase 2: Web App + Auth + Database

**Goal:** Authentication, database schema deployed, basic UI for answering assessments. No GitHub App integration yet — assessments created manually or via API for testing.

**Exit criteria:**
- Auth flow works end-to-end (GitHub OAuth → session → org selection)
- Database schema deployed with RLS enforcing org isolation
- Can display questions and collect answers via the web UI
- Role-based visibility works (Org Admin sees all, User sees own)
- All API routes have integration tests
- Critical auth + answering flows have E2E tests

### 2.1 Database Schema and Migrations

**What:** Deploy the L4 schema to Supabase with all tables, indexes, functions, and RLS policies.

**Stories:** 1.5, ADR-0008

**Issues to create:**
1. **Create database migration: core tables** — Migration for: `organisations`, `org_config`, `repositories`, `repository_config`, `user_organisations`, `user_github_tokens`. Include all indexes, constraints, and CHECK constraints from L4 schema. Include RLS policies for all tables.
2. **Create database migration: assessment tables** — Migration for: `assessments`, `assessment_questions`, `assessment_participants`, `participant_answers`, `fcs_merged_prs`, `sync_debounce`. Include all indexes and RLS policies.
3. **Create database migration: functions** — Migration for: `get_user_org_ids()`, `is_org_admin()`, `is_assessment_participant()`, `link_participant()`, `get_effective_config()`. Include pgsodium key creation for token encryption.
4. **Create database seed data and factory functions** — Seed data for testing: 2 organisations, 3 repositories, users with different roles. TypeScript factory functions for creating test data programmatically in integration tests.

**Tests first:**
```
describe('Database schema')
  describe('Given a fresh database')
    it('then all migrations apply without errors')
  describe('Given the organisations table')
    it('then it enforces the status CHECK constraint')
  describe('Given the org_config table')
    it('then score_threshold is constrained between 0 and 100')

describe('RLS policies')
  describe('Given user A belongs to org 1 only')
    it('then user A cannot see org 2 data')
  describe('Given user A is an org admin')
    it('then user A can update org_config')
  describe('Given user B is a regular user')
    it('then user B cannot update org_config')
  describe('Given user A is a participant on assessment X')
    it('then user A can see assessment X')
  describe('Given user A is not a participant on assessment Y')
    it('then user A cannot see assessment Y unless they are org admin')

describe('Database functions')
  describe('Given get_effective_config with repo-specific override')
    it('then repo override takes precedence over org default')
  describe('Given get_effective_config with no repo override')
    it('then org default is used')
```

**Success criteria:**
- [ ] `supabase db reset` applies all migrations cleanly
- [ ] RLS integration tests pass — org isolation verified
- [ ] Config cascade function returns correct values
- [ ] Generated types match schema (`supabase gen types`)

---

### 2.2 GitHub OAuth Authentication

**What:** Sign-in flow using Supabase Auth with GitHub as OAuth provider.

**Stories:** 5.1

**Issues to create:**
1. **Implement GitHub OAuth sign-in flow** — "Sign in with GitHub" button → Supabase PKCE flow → GitHub authorisation → callback → session. Capture and encrypt provider token at callback (one-time capture per ADR-0003). Store in `user_github_tokens`. Configure OAuth scopes: `user:email`, `read:org`.
2. **Implement session management middleware** — Next.js middleware that refreshes Supabase JWT on every request. Redirect unauthenticated users to sign-in page. Sign-out endpoint that invalidates Supabase session.

**Tests first:**
```
describe('Auth callback API route')
  describe('Given a valid OAuth callback with auth code')
    it('then it exchanges for session and captures provider token')
  describe('Given a provider token')
    it('then it encrypts and stores the token in user_github_tokens')

describe('Session middleware')
  describe('Given an expired JWT')
    it('then it refreshes the token automatically')
  describe('Given no session cookie')
    it('then it redirects to sign-in page')
  describe('Given a valid session')
    it('then it allows the request to proceed')

describe('E2E: Sign-in flow')
  it('Given I visit the app unauthenticated, then I see the sign-in page')
  it('Given I click sign in with GitHub, then I am redirected to GitHub OAuth')
```

**Success criteria:**
- [ ] Sign-in → callback → session works end-to-end
- [ ] Provider token captured and encrypted
- [ ] Session refresh works transparently
- [ ] Unauthenticated access redirected

---

### 2.3 Organisation Membership and Selection

**What:** Fetch user's GitHub org membership, cache it, and provide org selection.

**Stories:** 1.2, 5.2

**Issues to create:**
1. **Implement org membership fetch and caching** — On auth callback: use provider token to call GitHub API `GET /user/orgs`. Match returned orgs against `organisations` table (only orgs with app installed). Populate `user_organisations` with org membership and `github_role`. Refresh on each sign-in.
2. **Implement org selection UI** — After sign-in: if user belongs to multiple orgs, show org switcher. If single org, auto-select. Store selected org in session/cookie. All subsequent data scoped to selected org.

**Tests first:**
```
describe('Org membership sync')
  describe('Given a user who belongs to 2 orgs with the app installed')
    it('then both orgs appear in user_organisations')
  describe('Given a user whose org membership changed since last login')
    it('then user_organisations is updated on sign-in')
  describe('Given a user who belongs to an org without the app installed')
    it('then that org does not appear in user_organisations')

describe('Org selection')
  describe('Given a user with one org')
    it('then the org is auto-selected')
  describe('Given a user with multiple orgs')
    it('then the org switcher is displayed')

describe('E2E: Org selection')
  it('Given I sign in with multiple orgs, then I see the org switcher')
  it('Given I select an org, then all data is scoped to that org')
```

**Success criteria:**
- [ ] Org membership synced from GitHub on each login
- [ ] Org switcher displayed for multi-org users
- [ ] Data scoping enforced after org selection

---

### 2.4 API Routes — Assessments

**What:** RESTful API routes for assessments per L4 contract (section 4.4).

**Stories:** 2.4, 3.3, 5.3

**Issues to create:**
1. **Implement GET /api/assessments** — List assessments for current user. Org Admins see all org assessments; Users see only their own. Pagination, filtering by type/status. Response matches L4 contract.
2. **Implement GET /api/assessments/[id]** — Assessment details with questions. Reference answers filtered: never for PRCC, only after completion for FCS. Includes participant completion count.
3. **Implement POST /api/assessments** — Create assessment (used by webhook handler for PRCC, by web UI for FCS). Validates input, creates assessment + questions + participants. Returns assessment ID.
4. **Implement POST /api/assessments/[id]/answers** — Submit participant answers. Validates participant access, prevents resubmission, triggers relevance check. If all participants complete, triggers scoring.
5. **Implement PUT /api/assessments/[id]** — Update assessment (skip, close early). Org Admin only. Records skip reason/user/timestamp.

**Tests first (integration tests for each route):**
```
describe('GET /api/assessments')
  describe('Given an org admin requesting assessments')
    it('then it returns all assessments for the org')
  describe('Given a regular user')
    it('then it returns only assessments where they are a participant')
  describe('Given pagination parameters')
    it('then it returns the correct page with correct total')

describe('GET /api/assessments/[id]')
  describe('Given a PRCC assessment')
    it('then reference answers are never included')
  describe('Given a completed FCS assessment')
    it('then reference answers are included')
  describe('Given a user who is not a participant or admin')
    it('then it returns 404')

describe('POST /api/assessments/[id]/answers')
  describe('Given a valid participant submitting answers')
    it('then answers are stored and participant status set to submitted')
  describe('Given a participant who already submitted')
    it('then it returns 422 with resubmission error')
  describe('Given answers with irrelevant content')
    it('then relevance check flags them and returns re-answer prompt')
  describe('Given the last participant submits')
    it('then scoring is triggered automatically')

describe('PUT /api/assessments/[id]')
  describe('Given an org admin skipping an assessment')
    it('then assessment status is set to skipped with reason')
  describe('Given a non-admin attempting to skip')
    it('then it returns 403')
```

**Success criteria:**
- [ ] All API routes have integration tests against test DB
- [ ] RLS enforcement verified (no cross-org access)
- [ ] Response shapes match L4 contract TypeScript types
- [ ] Error responses match common error format (401, 403, 404, 422, 500)

---

### 2.5 Assessment Answering UI

**What:** Web interface for participants to view questions and submit answers.

**Stories:** 5.3, 2.4

**Issues to create:**
1. **Create assessment answering page** — Route: `/assessments/[id]`. Displays: repository name, PR number (PRCC) or feature name (FCS), all questions. Each question has text area for answer. Submit button. No reference answers visible. No scores visible. UX notice for PRCC: "Finish your PR before requesting review."
2. **Create submission confirmation page** — After submission: confirmation showing completion status ("You are participant 2 of 3"). Link back to assessments list. Already-submitted state: message that assessment is complete (no resubmission).
3. **Create access denied and loading states** — Access denied page for non-participants. Loading skeleton while assessment data loads. Error state for failed API calls.

**Tests first:**
```
describe('E2E: Assessment answering')
  it('Given I am a participant, when I visit the assessment page, then I see the questions')
  it('Given I submit all answers, then I see the confirmation page')
  it('Given I have already submitted, when I revisit, then I see the completion message')
  it('Given I am not a participant, when I visit, then I see access denied')
```

**Success criteria:**
- [ ] Answering flow works end-to-end (E2E test passes)
- [ ] Responsive on mobile (manual check)
- [ ] No reference answers or scores visible to participants
- [ ] Resubmission prevented

---

### 2.6 Role-Based Access and Navigation

**What:** Navigation structure and role-based visibility.

**Stories:** 5.2, 5.4

**Issues to create:**
1. **Implement navigation layout** — Top-level navigation: My Assessments (all users), Organisation (Org Admins), Repository Settings (Org Admins). Landing page after sign-in shows pending assessments. Org Admin sees full navigation; User sees restricted set.
2. **Implement role-based route protection** — Server-side checks: Org Admin routes return 403 for non-admins. Client-side: navigation items hidden for non-admins. Admin-first approach: build full interface, restrict views.

**Tests first:**
```
describe('E2E: Navigation and access')
  it('Given I am an org admin, then I see Organisation and Repository Settings in navigation')
  it('Given I am a regular user, then I do not see admin-only navigation items')
  it('Given I am a regular user trying to access /organisation, then I see 403')
```

**Success criteria:**
- [ ] Navigation renders correctly for both roles
- [ ] Admin routes protected server-side
- [ ] Landing page shows pending assessments

---

### 2.7 API Route: Organisations and Configuration

**What:** Organisation listing and configuration endpoints.

**Stories:** 1.2, 1.3, 1.4

**Issues to create:**
1. **Implement GET /api/organisations** — List orgs the user belongs to. Include repository count and config summary.
2. **Implement GET/PUT /api/organisations/[id]/config** — Read and update org-level default configuration. Org Admin only.
3. **Implement GET/PUT /api/repos/[id]/config** — Read and update per-repo configuration. Org Admin only. Returns effective config (cascade resolved).

**Tests first:**
```
describe('GET /api/organisations')
  describe('Given an authenticated user with 2 orgs')
    it('then it returns both organisations')

describe('PUT /api/organisations/[id]/config')
  describe('Given an org admin updating enforcement mode to hard')
    it('then the config is updated')
  describe('Given a non-admin')
    it('then it returns 403')

describe('GET /api/repos/[id]/config')
  describe('Given a repo with no explicit config')
    it('then it returns org defaults via cascade')
  describe('Given a repo with explicit overrides')
    it('then overrides take precedence')
```

**Success criteria:**
- [ ] Config CRUD works with proper authorisation
- [ ] Config cascade verified via integration tests
- [ ] Non-admin access blocked

**Pause here for manual verification before proceeding to Phase 3.**

---

## Phase 3: PRCC Flow — GitHub Integration

**Goal:** The primary use case. PR opened → questions generated → participants answer → merge gated via GitHub Check Run.

**Exit criteria:**
- GitHub App installed on test repository
- PR opened → webhook fires → rubric generated → Check Run posted
- Author + reviewers answer → scored → Check Run updated (success/failure)
- Soft and Hard mode enforcement works
- PR update handling (invalidation, trivial commit detection, debounce)
- Skip flow works
- All webhook handlers have integration tests
- PRCC E2E test passes against test GitHub repo

### 3.1 GitHub App and Webhook Endpoint

**What:** Register the GitHub App and implement the webhook receiver.

**Stories:** 1.1, ADR-0001

**Issues to create:**
1. **Create GitHub App configuration** — Register GitHub App on GitHub. Permissions: read PR, read code, read metadata, write checks, read org membership. Webhook URL: `/api/webhooks/github`. Subscribe to events: `pull_request`, `installation`, `installation_repositories`. Generate and securely store: App ID, private key, webhook secret.
2. **Implement webhook endpoint with signature verification** — `POST /api/webhooks/github`. Verify `X-Hub-Signature-256` using webhook secret. Parse event type from `X-GitHub-Event` header. Route to appropriate handler. Return `200 OK` immediately (async processing). Log delivery ID for idempotency tracking.

**Tests first:**
```
describe('Webhook endpoint')
  describe('Given a request with valid signature')
    it('then it accepts the request and returns 200')
  describe('Given a request with invalid signature')
    it('then it returns 401')
  describe('Given a pull_request event with action opened')
    it('then it routes to the PRCC handler')
  describe('Given an installation event with action created')
    it('then it routes to the installation handler')
```

**Success criteria:**
- [ ] Webhook signature verification works
- [ ] Events routed to correct handlers
- [ ] Invalid signatures rejected with 401

---

### 3.2 Installation Event Handling

**What:** Handle GitHub App install/uninstall and repository add/remove events.

**Stories:** 1.1

**Issues to create:**
1. **Implement installation event handlers** — `installation.created`: create org + org_config + repos. `installation.deleted`: set org to inactive. `installation_repositories.added`: create repo records. `installation_repositories.removed`: set repos to inactive. Reinstallation (org already exists): reactivate.

**Tests first:**
```
describe('Installation handlers')
  describe('Given an installation.created event')
    it('then it creates org, org_config, and repository records')
  describe('Given an installation.deleted event')
    it('then it sets the org status to inactive')
  describe('Given installation_repositories.added event')
    it('then it creates new repository records')
  describe('Given a reinstallation on an existing inactive org')
    it('then it reactivates the org')
```

**Success criteria:**
- [ ] Install/uninstall lifecycle works correctly
- [ ] Soft-delete (inactive status) used, not hard delete
- [ ] Reinstallation reactivates rather than duplicates

---

### 3.3 PR Event Detection and Artefact Extraction

**What:** Handle PR webhook events and extract artefacts for question generation.

**Stories:** 2.1, 2.2

**Issues to create:**
1. **Implement PR event handler with skip checks** — On `pull_request.opened` or `ready_for_review`: fetch repo config, check PRCC enabled, check PR size against threshold, check exempt file patterns. If skipped: create Check Run with `neutral` conclusion. If eligible: proceed to artefact extraction.
2. **Implement PR artefact extraction** — Fetch via GitHub API (installation token): diff, description, title, linked issues, full file contents for changed files, test files. Handle large PRs (> 50 files): focus on most substantive by lines changed. Return structured artefact object for assessment engine.

**Tests first:**
```
describe('PR event handler')
  describe('Given a PR with 10 lines changed and min_pr_size of 20')
    it('then it skips PRCC and creates neutral Check Run')
  describe('Given a PR where all files match exempt patterns')
    it('then it skips PRCC')
  describe('Given a valid PR above threshold')
    it('then it proceeds to artefact extraction')
  describe('Given a draft PR')
    it('then it does not initiate PRCC')

describe('Artefact extraction')
  describe('Given a PR with description, diff, and linked issues')
    it('then it extracts all artefact types into structured format')
  describe('Given a PR with 60 changed files')
    it('then it focuses on the most substantive files by lines changed')
  describe('Given a PR with empty description')
    it('then it proceeds with code-only artefacts')
```

**Success criteria:**
- [ ] Skip checks work correctly (size, exempt patterns, draft)
- [ ] Artefact extraction returns structured data
- [ ] Large PR handling respects token limits

---

### 3.4 PRCC Assessment Creation Pipeline

**What:** Full pipeline from PR event → rubric generation → assessment stored → Check Run created.

**Stories:** 2.1, 2.3, 4.1

**Issues to create:**
1. **Implement PRCC assessment creation** — After artefact extraction: call assessment engine to generate rubric. Store assessment, questions, and participants in database. Create GitHub Check Run (in_progress, name="Comprehension Check", external_id=assessment UUID, details_url=assessment page). Identify participants: PR author + required reviewers. Snapshot effective config at creation time.

**Tests first:**
```
describe('PRCC assessment creation')
  describe('Given extracted artefacts from a valid PR')
    it('then it generates rubric and stores assessment with questions')
  describe('Given a PR with author and 2 reviewers')
    it('then it creates 3 participant records with correct contextual roles')
  describe('Given successful assessment creation')
    it('then it creates a Check Run with in_progress status')
  describe('Given rubric generation fails after retries')
    it('then it creates Check Run with neutral conclusion and generation_failed status')
```

**Success criteria:**
- [ ] Full creation pipeline works: PR → artefacts → rubric → DB → Check Run
- [ ] Participants correctly identified from PR metadata
- [ ] Config snapshot captured at creation time
- [ ] Generation failure handled gracefully

---

### 3.5 Check Run Lifecycle

**What:** Create, update, and complete GitHub Check Runs throughout the assessment lifecycle.

**Stories:** 2.3, 2.9

**Issues to create:**
1. **Implement Check Run management** — Create Check Run on assessment creation (in_progress). Update summary on participant completion ("2 of 3 participants completed"). Complete Check Run on scoring: success/failure/neutral based on enforcement mode. Include machine-readable metadata in `output.summary` (pipe-delimited format per Story 2.9). Set `external_id` to assessment UUID for cross-referencing.

**Tests first:**
```
describe('Check Run management')
  describe('Given assessment creation')
    it('then it creates Check Run with in_progress status and correct details_url')
  describe('Given a participant completes')
    it('then it updates Check Run summary with completion count')
  describe('Given soft mode and all participants complete')
    it('then Check Run conclusion is success regardless of score')
  describe('Given hard mode and aggregate below threshold')
    it('then Check Run conclusion is failure with score in summary')
  describe('Given assessment is skipped')
    it('then Check Run conclusion is neutral with skip reason')
  describe('Given completed assessment')
    it('then output.summary contains pipe-delimited metadata')
```

**Success criteria:**
- [ ] Check Run lifecycle managed correctly
- [ ] Summary updates on each participant completion
- [ ] Conclusion matches enforcement mode logic
- [ ] Metadata export format matches L4 contract

---

### 3.6 Enforcement Modes

**What:** Implement Soft and Hard mode evaluation logic.

**Stories:** 2.5, 2.6, ADR-0006

**Issues to create:**
1. **Implement enforcement mode evaluation** — Soft mode: all participants must answer relevantly → success. Score calculated and stored but does not affect outcome. Hard mode: all must answer + aggregate must meet threshold. Below threshold → failure. Relevance check always runs in both modes.

**Tests first:**
```
describe('Enforcement mode evaluation')
  describe('Given soft mode')
    describe('and all answers are relevant')
      it('then outcome is success')
    describe('and an answer is irrelevant after 3 attempts')
      it('then assessment is flagged for admin review but still succeeds')
  describe('Given hard mode')
    describe('and aggregate score is 75% with threshold 70%')
      it('then outcome is success')
    describe('and aggregate score is 58% with threshold 70%')
      it('then outcome is failure')
```

**Success criteria:**
- [ ] Soft mode never fails on score (only on relevance)
- [ ] Hard mode correctly evaluates against threshold
- [ ] Both modes store aggregate score for reporting

---

### 3.7 PR Update Handling

**What:** Handle new commits, debounce, trivial commit detection, and reviewer changes.

**Stories:** 2.8, 2.1

**Issues to create:**
1. **Implement synchronize event debouncing** — On `synchronize` event: insert/update `sync_debounce` record with 60-second window. After window closes: process latest SHA. Multiple rapid commits → single assessment regeneration.
2. **Implement trivial commit detection** — Apply heuristic from L4 contract: trivial if both (a) net line delta ≤ threshold AND (b) all changed files are docs/comments. Trivial → no invalidation. Non-trivial → invalidate and regenerate.
3. **Implement reviewer change handling** — `review_requested`: add participant to existing assessment (same questions). `review_request_removed`: soft-remove participant. Re-evaluate completion status.

**Tests first:**
```
describe('Synchronize debounce')
  describe('Given 3 commits pushed within 30 seconds')
    it('then only one assessment regeneration is triggered using the latest SHA')
  describe('Given a commit pushed 90 seconds after the last')
    it('then two separate regenerations occur')

describe('Trivial commit detection')
  describe('Given a commit changing only .md files with 3 lines')
    it('then it is classified as trivial — assessment not invalidated')
  describe('Given a commit changing a .ts file with 3 lines')
    it('then it is classified as non-trivial — assessment invalidated')
  describe('Given a commit changing only .md files with 20 lines')
    it('then it is classified as non-trivial (exceeds threshold)')

describe('Reviewer changes')
  describe('Given a reviewer is added to a PR with an active assessment')
    it('then a new participant record is created with same questions')
  describe('Given a reviewer is removed and was the last pending participant')
    it('then scoring triggers immediately')
```

**Success criteria:**
- [ ] Debounce prevents duplicate regenerations
- [ ] Trivial commit heuristic matches L4 specification
- [ ] Reviewer changes update participant list correctly

---

### 3.8 Gate Skip Flow

**What:** Allow Org Admins to skip the PRCC gate with a reason.

**Stories:** 2.7

**Issues to create:**
1. **Implement gate skip** — Org Admin action from web UI. Mandatory reason field. Assessment → `skipped`. Check Run → `neutral` with annotation. Skip event recorded (user, timestamp, reason). Non-admins blocked (403). PR authors who are also admins can skip (role check only).

**Tests first:**
```
describe('Gate skip')
  describe('Given an org admin skips an assessment with reason')
    it('then assessment status is skipped and Check Run is neutral')
  describe('Given a non-admin attempts to skip')
    it('then it returns 403')
  describe('Given skip event')
    it('then it records user, timestamp, and reason')
```

**Success criteria:**
- [ ] Skip flow works end-to-end
- [ ] Skip event recorded for reporting
- [ ] Non-admin access blocked

---

### 3.9 Repository Configuration UI

**What:** Web UI for Org Admins to configure PRCC settings per repository.

**Stories:** 1.3, 1.4

**Issues to create:**
1. **Implement repository settings page** — Settings form: PRCC enabled/disabled, enforcement mode, score threshold, question count, min PR size, exempt file patterns. Shows effective config (cascade resolved). Save updates to `repository_config`. Clear override (revert to org default).

**Tests first:**
```
describe('E2E: Repository configuration')
  it('Given I am an org admin, when I change enforcement mode, then the change is saved')
  it('Given I clear a repo override, then org default is shown')
```

**Success criteria:**
- [ ] All configurable settings editable via UI
- [ ] Config cascade displayed correctly
- [ ] Changes take effect on next assessment (not retroactive)

**Pause here for manual verification before proceeding to Phase 4.**

---

## Phase 4: FCS Flow

**Goal:** Feature-level comprehension assessments. Reuses assessment engine, answering UI, and scoring from PRCC. Adds FCS-specific creation, participant nomination, and partial participation.

**Exit criteria:**
- Can create FCS assessment by selecting merged PRs
- Participants auto-suggested and notification sent
- Answering UI works for FCS
- Score calculated and displayed with reference answers
- Partial participation handling works
- All FCS-specific routes have integration tests

### 4.1 FCS Assessment Creation

**What:** Org Admin creates FCS by selecting merged PRs and confirming participants.

**Stories:** 3.1

**Issues to create:**
1. **Implement PR selection and participant auto-suggestion API** — `GET /api/repos/[repoId]/pr-participants?pr_numbers=1,2,3`. Fetches merged PR metadata, extracts unique authors/reviewers, returns as suggested participants. Warning if selected PR has active PRCC assessment.
2. **Implement FCS creation UI** — Form: feature name, description, merged PR selection (search/browse), participant list (auto-suggested, editable). Submit creates assessment via `POST /api/assessments`.
3. **Implement FCS artefact aggregation** — Fetch artefacts from multiple merged PRs. Combine into single artefact set for question generation. Use user OAuth token (not installation token) for GitHub API calls.

**Tests first:**
```
describe('FCS creation')
  describe('Given 3 merged PRs selected')
    it('then it fetches artefacts from all 3 and generates a single rubric')
  describe('Given merged PRs with 2 unique authors and 3 unique reviewers')
    it('then it auto-suggests 5 participants')
  describe('Given a selected PR has an active PRCC assessment')
    it('then it returns a warning')

describe('E2E: FCS creation')
  it('Given I am an org admin, when I create an FCS, then I see auto-suggested participants')
  it('Given I submit the FCS form, then an assessment is created')
```

**Success criteria:**
- [ ] FCS creation flow works end-to-end
- [ ] Participant auto-suggestion from PR metadata
- [ ] Multi-PR artefact aggregation works

---

### 4.2 FCS Participant Notification

**What:** Email notifications for FCS participants.

**Stories:** 3.2

**Issues to create:**
1. **Implement email notification service** — Send assessment invitation email with: feature name, repository, question count, link to web app. Single reminder after configurable timeout (default 48h). Use transactional email service (Resend or similar). Template with clear call-to-action.

**Tests first:**
```
describe('FCS notifications')
  describe('Given an FCS assessment is created with 3 participants')
    it('then it sends invitation emails to all 3')
  describe('Given 48 hours have passed and a participant has not responded')
    it('then it sends a single reminder')
  describe('Given a participant has already submitted')
    it('then no reminder is sent')
```

**Success criteria:**
- [ ] Invitation emails sent on FCS creation
- [ ] Single reminder sent after timeout
- [ ] No duplicate reminders

---

### 4.3 FCS Scoring and Results

**What:** FCS scoring with reference answers visible on results page.

**Stories:** 3.4, 6.2

**Issues to create:**
1. **Implement FCS results page** — Shows: feature name, aggregate score, per-question aggregate, reference answers (visible after completion), artefact quality signal. No individual attribution. Accessible to Org Admin and participants.
2. **Implement early scoring trigger** — Org Admin can trigger scoring before all participants answer. Result shows "Score based on N of M participants".

**Tests first:**
```
describe('FCS results')
  describe('Given a completed FCS assessment')
    it('then it shows aggregate score and reference answers')
  describe('Given an FCS assessment with artefact_quality code_only')
    it('then it shows artefact quality signal')
  describe('Given an org admin triggers early scoring with 2 of 3 participants')
    it('then it shows partial score with participation note')
```

**Success criteria:**
- [ ] Results page shows reference answers for FCS
- [ ] Artefact quality signal displayed
- [ ] Partial scoring works correctly

---

### 4.4 FCS Partial Participation

**What:** Close FCS assessment without full participation.

**Stories:** 3.5

**Issues to create:**
1. **Implement FCS close and partial scoring** — Org Admin can close assessment after timeout. Non-responders marked "did not participate" (not scored as zero). Scoring proceeds with available responses. Result clearly states participation rate.

**Tests first:**
```
describe('FCS partial participation')
  describe('Given an FCS closed with 2 of 3 participants having responded')
    it('then it scores only the 2 responses and shows participation rate')
  describe('Given a non-responder')
    it('then they are marked did_not_participate, not scored as zero')
```

**Success criteria:**
- [ ] Close-early flow works
- [ ] Non-responders handled correctly
- [ ] Participation rate displayed in results

**Pause here for manual verification before proceeding to Phase 5.**

---

## Phase 5: Reporting & Polish

**Goal:** Results pages, organisation overview, repository trends. Polish and production readiness.

**Exit criteria:**
- PRCC and FCS results pages complete
- Organisation overview with filtering and summary stats
- Repository trend chart renders
- Org-level default configuration UI complete
- All pages have E2E coverage for critical paths
- Production deployment checklist complete

### 5.1 PRCC Results Page

**What:** Assessment results page for completed PRCC assessments.

**Stories:** 6.1

**Issues to create:**
1. **Implement PRCC results page** — Shows: repo + PR number (linked to GitHub), date, enforcement mode + threshold, outcome (Passed/Failed/Skipped), aggregate score, participant count, per-question aggregate. No individual attribution. No reference answers (PRCC). Accessible to participants and Org Admins.

**Tests first:**
```
describe('E2E: PRCC results')
  it('Given a completed PRCC assessment, then I see aggregate score and per-question scores')
  it('Given a PRCC result, then reference answers are NOT shown')
  it('Given a skipped PRCC, then I see the skip reason')
```

**Success criteria:**
- [ ] All required data displayed
- [ ] No reference answers shown (PRCC rule)
- [ ] No individual scores shown

---

### 5.2 Organisation Overview

**What:** Table of all assessments across the organisation with filtering and summary stats.

**Stories:** 6.3

**Issues to create:**
1. **Implement organisation overview page** — Table: repo name, type (PRCC/FCS), date, aggregate score, outcome, completion rate. Filterable by: repo, type, date range, outcome. Sortable by any column. Summary stats: total assessments, average score, pass rate, skip rate. Org Admin only.

**Tests first:**
```
describe('E2E: Organisation overview')
  it('Given 5 assessments across 2 repos, then the table shows all 5')
  it('Given I filter by PRCC type, then only PRCC assessments are shown')
  it('Given assessments exist, then summary stats are calculated correctly')
```

**Success criteria:**
- [ ] All assessments visible in table
- [ ] Filtering and sorting work
- [ ] Summary stats calculated correctly

---

### 5.3 Repository Assessment History

**What:** Per-repository assessment list with trend chart.

**Stories:** 6.4

**Issues to create:**
1. **Implement repository history page** — Assessment list for a single repo (same columns as org overview). Line chart of aggregate score over time (one point per assessment). Fewer than 3 assessments: chart replaced with message. Shows repository's current configuration.

**Tests first:**
```
describe('E2E: Repository history')
  it('Given a repo with 5 assessments, then the trend chart renders')
  it('Given a repo with 2 assessments, then the chart is replaced with a message')
```

**Success criteria:**
- [ ] Assessment list displays correctly
- [ ] Trend chart renders with correct data points
- [ ] Fewer-than-3 edge case handled

---

### 5.4 Organisation Default Configuration UI

**What:** Web UI for org-level default settings.

**Stories:** 1.4

**Issues to create:**
1. **Implement org-level configuration page** — Settings form for organisation defaults: all same settings as repo config (PRCC/FCS enabled, enforcement mode, threshold, question counts, min PR size, exempt patterns). Org Admin only. Clear indication that these are defaults inherited by repos without explicit overrides.

**Tests first:**
```
describe('E2E: Org configuration')
  it('Given I am an org admin, when I set org defaults, then new repos inherit them')
```

**Success criteria:**
- [ ] Org defaults editable
- [ ] Changes reflected in repo config cascade

---

### 5.5 Production Readiness

**What:** Final polish, security review, and deployment checklist.

**Issues to create:**
1. **Security audit** — Review all API routes for auth checks. Verify RLS policies cover all tables. Check for injection vulnerabilities in LLM prompt construction. Verify webhook signature validation. Review CORS and CSP headers. Check secret management (no secrets in code).
2. **Error handling and UX polish** — All user-facing errors have clear messages and suggested actions. Loading states on all async operations. 404 page. Error boundary for React components. British English in all user-facing text.
3. **Performance validation** — Question generation < 30s (target). Answer scoring < 10s per answer (target). Page load < 3s. Database query performance with representative data volume.
4. **Accessibility audit** — WCAG 2.1 AA for the answering interface. Keyboard navigation. Screen reader compatibility. Colour contrast.

**Tests first:**
```
describe('Security')
  describe('Given an unauthenticated request to any API route')
    it('then it returns 401')
  describe('Given a webhook with tampered signature')
    it('then it returns 401')

describe('Accessibility')
  it('Given the answering page, then all form inputs have labels')
  it('Given the answering page, then it is navigable by keyboard')
```

**Success criteria:**
- [ ] Security audit checklist complete
- [ ] No critical accessibility issues
- [ ] Performance targets met
- [ ] British English verified across all UI text

**Pause here for final manual verification and production deployment.**

---

## Cross-Cutting: Test Strategy Summary

### Naming Convention

All tests use BDD-style naming:

```typescript
describe('Given [precondition]', () => {
  describe('when [action]', () => {
    it('then [expected outcome]', () => {
      // Arrange, Act, Assert
    });
  });
});
```

### File Naming

| Type | Pattern | Location |
|------|---------|----------|
| Unit test | `*.test.ts` | Co-located with source |
| Integration test | `*.integration.test.ts` | Co-located with source |
| E2E test | `*.e2e.ts` | `tests/e2e/` |

### Test Data Management

| Concern | Tool | Pattern |
|---------|------|---------|
| Entity creation | Factory functions | `createTestOrg()`, `createTestAssessment()`, etc. |
| LLM responses | Fixture files | `tests/fixtures/llm/*.json` |
| GitHub API responses | MSW handlers | `tests/mocks/github/*.ts` |
| Database isolation | Transaction rollback | Each integration test runs in a rolled-back transaction |
| Auth simulation | Test helpers | `createAuthenticatedClient(userId, orgId)` |

### Coverage Targets

| Module | Statement | Branch |
|--------|-----------|--------|
| Assessment engine (`src/lib/engine/`) | 90% | 85% |
| API routes (`src/app/api/`) | 85% | 80% |
| Overall | 80% | 75% |

### CI Pipeline Stages

```
lint → type-check → unit tests → integration tests → build → E2E tests
```

Each stage fails fast — no point running E2E if unit tests fail.

---

## Risks and Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **LLM response quality varies** | Generated questions may be low quality or inconsistent | Medium | Fixture-based tests with known-good responses; manual review of first real assessments; prompt iteration |
| **Supabase RLS complexity** | Incorrect policies could leak data cross-tenant | High severity | Dedicated RLS integration tests for every table; test with multi-tenant data |
| **GitHub API rate limits** | Artefact extraction may hit rate limits for orgs with many PRs | Medium | Cache PR data; use conditional requests (ETags); monitor rate limit headers |
| **LLM API costs in development** | Real API calls during development are expensive | Medium | MSW mocking for all tests; fixture-based testing; real LLM calls only in manual smoke tests |
| **Check Run timing** | Assessment scoring may take too long (multiple sequential LLM calls) | Medium | Async scoring with status updates; consider parallel scoring calls for different questions |
| **Provider token expiry** | GitHub OAuth tokens captured at callback may expire | Medium | Refresh flow or re-auth prompt when token fails; ADR-0003 documents approach |
| **Schema migration conflicts** | Multiple developers modifying schema simultaneously | Low | Sequential migration numbering; CI validates migration chain |

---

## References

| Document | Path |
|----------|------|
| V1 Requirements (v0.6) | [docs/requirements/v1-requirements.md](docs/requirements/v1-requirements.md) |
| V1 Design Document (v0.7) | [docs/design/v1-design.md](docs/design/v1-design.md) |
| Original Implementation Plan | [docs/plans/2026-03-04-implementation-plan.md](docs/plans/2026-03-04-implementation-plan.md) |
| ADR-0001: GitHub App | [docs/adr/0001-github-app-integration.md](docs/adr/0001-github-app-integration.md) |
| ADR-0002: GCP Cloud Run | [docs/adr/0002-hosting-gcp-cloud-run.md](docs/adr/0002-hosting-gcp-cloud-run.md) |
| ADR-0003: Supabase Auth | [docs/adr/0003-auth-supabase-github-oauth.md](docs/adr/0003-auth-supabase-github-oauth.md) |
| ADR-0004: Roles | [docs/adr/0004-roles-access-control.md](docs/adr/0004-roles-access-control.md) |
| ADR-0005: Aggregate Score | [docs/adr/0005-single-aggregate-score.md](docs/adr/0005-single-aggregate-score.md) |
| ADR-0006: Enforcement Modes | [docs/adr/0006-soft-hard-enforcement-modes.md](docs/adr/0006-soft-hard-enforcement-modes.md) |
| ADR-0007: PR Size Threshold | [docs/adr/0007-pr-size-threshold.md](docs/adr/0007-pr-size-threshold.md) |
| ADR-0008: Data Model | [docs/adr/0008-data-model-multi-tenancy.md](docs/adr/0008-data-model-multi-tenancy.md) |

---

*Created: 2026-03-09*
