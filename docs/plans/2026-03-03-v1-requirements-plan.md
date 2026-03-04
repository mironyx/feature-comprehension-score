# Plan: Create V1 Requirements Document & Update Implementation Plan

## Context

The implementation plan (`feature-comprehension-tool-plan.md`) has been reviewed and annotated with LS comments. The next step is spec-driven: write a proper requirements document with user stories and acceptance criteria before implementation. The implementation plan also needs updating to reflect confirmed decisions.

## Deliverables

1. **Create** `docs/requirements/v1-requirements.md` — content below
2. **Update** `feature-comprehension-tool-plan.md` — changes described after the requirements content

## Files to Create/Modify

| File | Action |
|------|--------|
| `docs/requirements/v1-requirements.md` | **Create** |
| `feature-comprehension-tool-plan.md` | **Update** |

---

# FILE 1: docs/requirements/v1-requirements.md

---

# Feature Comprehension Score Tool — V1 Requirements

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.1 |
| Status | Draft |
| Author | LS |
| Created | 2026-03-03 |
| Last updated | 2026-03-03 |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-03-03 | LS | Initial draft |

---

## Glossary

| Term | Definition |
|------|-----------|
| **Organisation** | A GitHub organisation. The top-level tenant boundary. |
| **Repository** | A GitHub repository within an organisation. Equivalent to "project" in V1. |
| **Assessment** | A generated set of comprehension questions with reference answers and weights, created from development artefacts. |
| **Rubric** | The fixed set of questions, weights, and reference answers generated before any participant sees the assessment. |
| **Participant** | A GitHub user who must answer an assessment (PR author or required reviewer for PRCC; nominated team members for FCS). |
| **Soft mode** | Enforcement level where all participants must answer relevantly, but no score threshold blocks the outcome. |
| **Hard mode** | Enforcement level where all participants must answer AND the aggregate score must meet a configurable threshold. |
| **PRCC** | PR Comprehension Check — preventative quality gate before PR merge. |
| **FCS** | Feature Comprehension Score — retrospective diagnostic at sprint retrospective. |
| **Aggregate score** | The combined weighted score across all participants for an assessment. Individual scores are never surfaced separately. |
| **Naur layer** | One of three layers of developer understanding from Peter Naur's Theory Building: design justification, modification capacity, integration understanding. |

---

## Roles

| Role | Description |
|------|-----------|
| **Org Admin** | Person who installs the GitHub App and configures organisation-level settings. Typically a tech lead or engineering manager. |
| **Repo Admin** | Person who configures repository-level settings (enforcement mode, thresholds, exemptions). May be the same person as Org Admin. |
| **PR Author** | Developer who opens or owns a pull request. Mandatory participant in PRCC assessments. |
| **PR Reviewer** | Developer assigned as a required reviewer on a pull request. Mandatory participant in PRCC assessments. |
| **FCS Initiator** | Person who creates a feature-level comprehension assessment (typically a tech lead at sprint retro). |
| **FCS Participant** | Team member nominated to answer an FCS assessment. |

---

## Epic 1: Organisation Setup & Configuration

Enable organisations to install the GitHub App, onboard repositories, and configure comprehension assessment settings. Multi-tenant from the start — each GitHub organisation is an isolated tenant.

### Story 1.1: GitHub App Installation

**As an** Org Admin,
**I want to** install the FCS Tool GitHub App on my GitHub organisation,
**so that** my repositories can use comprehension assessments.


**Acceptance Criteria:**

- Given the Org Admin visits the GitHub Marketplace listing or installation URL, when they authorise the app for their organisation, then the app is installed and the organisation is registered in the database.
- Given the app is installed, then an organisation record is created with the GitHub org ID, org name, and default configuration values.
- Given the app is installed on an organisation that already exists (reinstallation), then the existing organisation record is reactivated rather than duplicated.
- Given the Org Admin selects specific repositories during installation (not "all repositories"), then only those repositories are registered.
- Given the Org Admin later adds or removes repositories from the app installation via GitHub settings, then the database reflects the change.

**Notes:** The GitHub App must request the minimum permissions needed: read access to pull requests, code, and metadata; write access to checks and statuses.

---

### Story 1.2: Organisation Dashboard Access

**As an** Org Admin,
**I want to** access a web dashboard for my organisation after installing the app,
**so that** I can view and manage my organisation's settings and assessments.

**Acceptance Criteria:**

- Given the Org Admin authenticates via GitHub OAuth, when they log in, then they see a list of organisations they have admin access to that have the app installed.

- Given an authenticated user who is not an admin of any organisation with the app installed, then they see an appropriate message and installation instructions.
- Given the Org Admin selects an organisation, then they see a dashboard showing all registered repositories and their configuration status.

---

### Story 1.3: Repository Configuration

**As a** Repo Admin,
**I want to** configure comprehension assessment settings for a specific repository,
**so that** the tool behaves appropriately for my team's context.

**Acceptance Criteria:**

- Given a registered repository, the Repo Admin can configure:
  - **PRCC enabled/disabled** (default: enabled)
  - **FCS enabled/disabled** (default: enabled)
  - **Enforcement mode for PRCC:** Soft or Hard (default: Soft)
  - **Score threshold for Hard mode:** Configurable percentage (default: 70%)
  - **Question count:** 3 to 5 (default: 3)
  - **Minimum PR size for PRCC:** Line count below which PRCC is skipped (default: 20 lines changed)
  - **Exempt file patterns:** Glob patterns for files that should not trigger PRCC (e.g., `*.md`, `*.json`, `package-lock.json`)
- Given a configuration change is saved, then it takes effect for the next assessment (not retroactively).
- Given no configuration has been set for a repository, then organisation-level defaults are used.

---

### Story 1.4: Organisation-Level Default Configuration

**As an** Org Admin,
**I want to** set default configuration values at the organisation level,
**so that** new repositories inherit sensible defaults without per-repo configuration.

**Acceptance Criteria:**

- Given the Org Admin sets organisation-level defaults, then any newly registered repository inherits those defaults.
- Given a repository has explicit per-repo configuration, then per-repo values override organisation defaults.
- Given the Org Admin changes an organisation default, then repositories without explicit configuration pick up the new default on their next assessment.

---

### Story 1.5: Multi-Tenancy Isolation

**As an** Org Admin,
**I want** my organisation's data to be completely isolated from other organisations,
**so that** assessments, scores, and configuration are private.

**Acceptance Criteria:**

- Given Organisation A and Organisation B both use the tool, then no API call, database query, or UI view from Organisation A can access Organisation B's data.
- Given a user who belongs to multiple organisations, then they see data for each organisation independently and cannot cross-reference between them.
- All database queries include organisation-scoped filtering (row-level security or equivalent).


---

## Epic 2: PR Comprehension Check (PRCC) Flow

The preventative quality gate. When a PR is opened or updated on a PRCC-enabled repository, the tool generates comprehension questions from the PR artefacts, participants answer via the web app, and the GitHub Check is updated to pass or fail based on the configured enforcement mode.

### Story 2.1: PR Event Detection

**As the** system,
**I want to** detect when a relevant PR event occurs on a PRCC-enabled repository,
**so that** I can initiate the comprehension assessment flow.

**Acceptance Criteria:**

- Given PRCC is enabled for a repository, when a PR is opened (or moved from draft to ready for review), then a new PRCC assessment is initiated.
- Given PRCC is enabled, when a required reviewer is added to an existing PR that already has an assessment, then the assessment is updated to include the new participant (same questions).
- Given PRCC is enabled, when a required reviewer is removed from a PR, then they are removed from the participant list (existing responses soft-deleted).
- Given a PR is below the configured minimum line count, then PRCC is automatically skipped and the GitHub Check is set to "neutral" with an explanation.
- Given all changed files in a PR match exempt file patterns, then PRCC is automatically skipped.
- Given a PR is a draft, then PRCC is not initiated until the PR is marked ready for review.

---

### Story 2.2: PR Artefact Extraction

**As the** system,
**I want to** extract relevant artefacts from a PR,
**so that** I can generate meaningful comprehension questions.

**Acceptance Criteria:**

- The system extracts from the PR via the GitHub API:
  - PR diff (changed files, lines added/removed)
  - PR description/body
  - PR title
  - Linked issue descriptions (if issues are linked via closing keywords or references)
  - File contents for changed files (full file for context, not just diff)
  - Test files included in the PR
- Given a PR with an empty description and no linked issues, the system proceeds with code-only artefacts and generates code-focused questions (thin artefacts produce thin questions — this is by design, surfacing artefact quality).
- Given a PR that changes more than 50 files, the system focuses on the most substantive files (by lines changed) up to a reasonable token limit for the LLM context window.


---

### Story 2.3: GitHub Check Creation

**As a** PR Author,
**I want to** see a clear GitHub Check on my PR indicating that a comprehension assessment is required,
**so that** I know I need to answer questions before the PR can be merged.

**Acceptance Criteria:**

- Given a PRCC assessment is initiated, then a GitHub Check Run is created on the PR with status "in_progress" and title "Comprehension Check".
- The Check Run summary displays:
  - Number of participants identified (author + N reviewers)
  - Completion status: e.g., "2 of 3 participants have completed the assessment" (no individual scores)
  - A link to the web app where participants can answer questions
- Given all participants have completed and the assessment passes (per enforcement mode), then the Check Run conclusion is "success".
- Given the assessment fails in Hard mode (aggregate below threshold), then the Check Run conclusion is "failure" with aggregate score shown (no individual breakdown).
- Given the assessment passes in Soft mode (all answered relevantly), then the Check Run conclusion is "success" regardless of score.
- The Check Run never displays individual participant scores.


---

### Story 2.4: Assessment Question Answering (PRCC)

**As a** PR Author or PR Reviewer,
**I want to** click a link from the GitHub Check and answer comprehension questions about the PR,
**so that** I demonstrate my understanding of the change.

**Acceptance Criteria:**

- Given I click the "Answer comprehension questions" link on the GitHub Check, then I am taken to the web app.
- Given I am not authenticated, then I am prompted to sign in via GitHub OAuth.
- Given I am authenticated but not a participant for this assessment, then I see an access denied message.
- Given I am a valid participant, then I see the questions (3-5) without reference answers.
- Given I submit my answers, they are stored and I see a confirmation.
- Given I have already submitted answers for this assessment, I see a message that I have already completed it (no resubmission).
- Given I submit answers, the system checks whether all participants have completed and triggers scoring if so.

---

### Story 2.5: Relevance Validation (Soft Mode)

**As the** system,
**I want to** validate that answers are relevant (not rubbish) in Soft mode,
**so that** the gate has meaning even without a score threshold.

**Acceptance Criteria:**

- Given the repository is in Soft mode, when a participant submits answers, the system evaluates each answer for relevance using the LLM.
- "Relevant" means the answer: (a) addresses the question asked, (b) is written in human language (not random characters or gibberish), and (c) makes a genuine attempt to answer even if incorrect.
- Given an answer is deemed irrelevant (e.g., "asdf", "I don't know", "test", copy-paste of the question), the participant is notified and must re-answer that question.
- Given a participant has been flagged for irrelevant answers 3 times on the same question, the system accepts the answer but flags the assessment for Repo Admin review.
- The relevance check is binary (relevant / not relevant), not scored.

---

### Story 2.6: Score-Based Evaluation (Hard Mode)

**As the** system,
**I want to** score participant answers against the fixed rubric in Hard mode and determine pass/fail,
**so that** merge is blocked when aggregate comprehension is insufficient.

**Acceptance Criteria:**

- Given Hard mode, when all participants have submitted, each answer is scored against its reference answer using the LLM.
- Each answer receives a score from 0.0 to 1.0.
- The aggregate assessment score is: sum of (score × weight) across all questions and all participants, divided by sum of (max_score × weight) across all questions and all participants. Single percentage.
- Given the aggregate score meets or exceeds the threshold, the assessment passes.
- Given the aggregate score is below the threshold, the assessment fails and the GitHub Check is "failure".
- Individual participant scores are calculated internally but never displayed separately — only the aggregate is shown.
- Failed assessment Check Run summary: "Aggregate comprehension: 58% (threshold: 70%)" — no per-participant breakdown.

---

### Story 2.7: PRCC Gate Skip

**As a** Repo Admin,
**I want to** skip the PRCC gate for a specific PR when justified,
**so that** emergency hotfixes or time-critical changes are not blocked.

**Acceptance Criteria:**

- Given a PR has a PRCC assessment pending, a Repo Admin can mark the assessment as "skipped" from the web app with a mandatory reason.
- Given an assessment is skipped, the GitHub Check is set to "neutral" with annotation "Comprehension check skipped: [reason]".
- The skip event is recorded (user, timestamp, reason).
- Skips are visible in organisation-level reporting (skip rate is a tracked metric).
- PR Authors cannot skip their own assessments unless they are also Repo Admins.

---

### Story 2.8: PR Update Handling

**As the** system,
**I want to** handle PR updates (new commits pushed) gracefully,
**so that** the assessment reflects the current state of the PR.

**Acceptance Criteria:**

- Given a PR has an in-progress assessment (not all answered) and new commits are pushed, the existing assessment is invalidated and a new assessment is generated. Participants who already answered must answer again.
- Given a PR has a completed assessment and new commits are pushed, a new assessment is generated. The previous assessment is retained for history.
- Given a PR has a completed and passed assessment and no new commits, the Check remains "success".
- The system debounces: if multiple commits are pushed within 60 seconds, only one assessment regeneration is triggered.

**Notes:** Regeneration on push prevents gaming (answer easy questions on trivial commit, then push real code). If this proves too painful, a V2 option could be "regenerate only if diff changes by more than X%".


---

## Epic 3: Feature Comprehension Score (FCS) Flow

The retrospective diagnostic. An FCS Initiator creates an assessment for a feature (artefacts from a repository), nominates participants, they answer via the web app, and a feature-level comprehension score is produced.

### Story 3.1: Create Feature Assessment

**As an** FCS Initiator,
**I want to** create a feature comprehension assessment by selecting artefacts from a repository,
**so that** I can assess my team's understanding at sprint retro.

**Acceptance Criteria:**

- Given I am authenticated and have access to a repository with FCS enabled, I can create a new FCS assessment from the web app.
- I provide:
  - Feature name/title (free text)
  - Description (optional)
  - Artefact selection: (a) list of file paths, (b) a branch name (tool extracts changed files vs main), or (c) a date range of commits
  - Participant list: GitHub usernames of team members
- Given I submit, the system fetches artefacts from the repository via GitHub API and initiates question generation.
- Given the artefacts are insufficient (e.g., single empty file), the system warns the initiator and proceeds (thin artefacts produce thin questions — by design).

---

### Story 3.2: FCS Participant Notification

**As an** FCS Participant,
**I want to** receive a notification that I have been asked to complete a comprehension assessment,
**so that** I can complete it before the sprint retro.

**Acceptance Criteria:**

- Given an FCS assessment is created with my GitHub username as a participant, I receive a notification via email (using the email associated with my GitHub account).
- The notification includes: feature name, repository, number of questions, and a link to the web app.
- Given a participant has not completed the assessment within a configurable timeframe (default: 48 hours), a single reminder is sent.

---

### Story 3.3: Assessment Question Answering (FCS)

**As an** FCS Participant,
**I want to** answer comprehension questions about a feature via the web app,
**so that** my team gets a comprehension score.

**Acceptance Criteria:**

- All acceptance criteria from Story 2.4 apply (authentication, access control, question display, submission, no resubmission).
- FCS assessments do not block any GitHub process (no Check Run).
- Given not all participants have completed, the FCS Initiator can see a completion dashboard showing who has and has not answered (by name — visible to initiator only for follow-up).

---

### Story 3.4: FCS Scoring and Results

**As an** FCS Initiator,
**I want to** see the feature comprehension score once all participants have answered,
**so that** I can use it in our sprint retrospective discussion.

**Acceptance Criteria:**

- Given all participants have submitted, the system scores all answers and calculates the aggregate Feature Comprehension Score.
- The FCS result page shows:
  - Overall aggregate score (percentage)
  - Score breakdown by Naur layer (if questions span multiple layers)
  - Per-question aggregate score (how the group did on each question, no individual attribution)
  - The questions with reference answers (now visible, since assessment is complete)
  - Artefact quality signal: a note if artefacts were thin (e.g., "Questions generated from code only — no requirements or design documents available")
- Individual participant scores are not displayed.
- The FCS Initiator can trigger scoring before all participants answer (with warning that score is based on partial data).

---

### Story 3.5: FCS Without Full Participation

**As an** FCS Initiator,
**I want to** close an FCS assessment even if not all participants have responded,
**so that** a missing team member does not block the retrospective.

**Acceptance Criteria:**

- Given an FCS assessment has been open for more than the configured timeframe, the Initiator can "close" the assessment and trigger scoring on responses received.
- The result clearly indicates: "Score based on N of M participants".
- Participants who did not respond are recorded as "did not participate" (not scored as zero).

---

## Epic 4: Shared Assessment Engine

The core engine used by both PRCC and FCS. Handles question generation, rubric creation, answer scoring, and aggregate calculation.

### Story 4.1: Question Generation from Artefacts

**As the** system,
**I want to** generate comprehension questions from development artefacts,
**so that** both PRCC and FCS use the same generation logic.

**Acceptance Criteria:**

- Given a set of artefacts (code diffs, full files, PR descriptions, linked issues, design documents), the system generates 3-5 questions (configurable) targeting Naur's three layers:
  - **Design justification:** "Why was this approach chosen over alternatives?"
  - **Modification capacity:** "What would break if we changed X?"
  - **Integration understanding:** "How does this change affect calling code / the broader system?"

World-to-program mapping (domain intent): “Given the following requirements and test cases, generate five short-answer questions that test whether a developer understands which real-world domain behaviours this feature handles and which it deliberately excludes. Questions should require reasoning about intent, not code recall. For each question, output: the question text, a weight from 1–3 reflecting its importance to domain correctness, and a reference answer that a developer with full understanding of the artefacts should be able to give.”

Design justification (structural decisions): “Given the following design notes, ADRs, and pull request descriptions, generate five short-answer questions that test whether a developer understands why key structural decisions were made — module boundaries, data model choices, integration approach — not just what they are. For each question, output: the question text, a weight from 1–3 reflecting how central this decision is to the overall design, and a reference answer derived from the artefacts. Where the artefacts do not record a justification, note that explicitly in the reference answer rather than inferring one.”

Modification capacity (safe change paths): “Given the following codebase and requirements, generate five scenario-based questions that test whether a developer could safely make a specific type of change — adding a new rule, extending an integration, handling a new edge case — without breaking existing behaviour. For each question, output: the question text, a weight from 1–3 reflecting the risk level of the change scenario, and a reference answer describing the correct reasoning path and any dependencies or constraints the developer would need to account for.”

- For each question, the system generates:
  - Question text (short-answer format)
  - Weight (1-3) reflecting importance/risk
  - Reference answer derived from artefacts
- The rubric is generated in a single LLM call and stored before any participant sees questions.
- Reference answers are never shown to participants until assessment completion (FCS) or not at all (PRCC).
- Given code-only artefacts (no requirements, no design docs), the system generates code-focused questions and includes metadata flag: `artefact_quality: code_only`.
- The system uses the Anthropic Claude API for generation.

---

### Story 4.2: Answer Scoring Against Rubric

**As the** system,
**I want to** score each participant's answer against the fixed reference answer,
**so that** scores are consistent across participants.

**Acceptance Criteria:**

- Given a participant answer and the corresponding reference answer and weight, the system evaluates using the LLM and produces a score from 0.0 to 1.0.
- The scoring prompt evaluates: (a) factual correctness relative to reference answer, (b) completeness, (c) demonstration of understanding (not keyword matching).
- Semantically equivalent answers with different wording receive similar scores.
- Each answer is scored in a separate LLM call (no batching with other participants' answers — prevents scoring contamination).

---

### Story 4.3: Aggregate Score Calculation

**As the** system,
**I want to** calculate aggregate scores from individual question scores,
**so that** assessments produce a single comprehension number.

**Acceptance Criteria:**

- Aggregate score = sum(score × weight) across all questions and all participants / sum(max_score × weight) across all questions and all participants. Single percentage.
- The aggregate does not distinguish between author and reviewer — all participants weighted equally.
- For PRCC Soft mode: aggregate is calculated and stored (for reporting) but does not affect pass/fail.
- For PRCC Hard mode: aggregate compared against threshold.
- For FCS: aggregate is the Feature Comprehension Score.

---

### Story 4.4: Relevance Detection

**As the** system,
**I want to** detect whether an answer is a genuine attempt or rubbish,
**so that** Soft mode has meaning.

**Acceptance Criteria:**

- The system classifies each answer as "relevant" or "not relevant" using the LLM.
- "Not relevant" if: empty/whitespace, random characters/gibberish, copy of question text, filler text ("I don't know", "n/a", "test", "lorem ipsum"), or completely off-topic.
- "Relevant" if: factually incorrect but demonstrates genuine attempt to answer.
- Returns binary result plus brief explanation (for re-answer prompt).

---

### Story 4.5: LLM Error Handling

**As the** system,
**I want to** handle LLM API failures gracefully,
**so that** assessments are not lost or corrupted.

**Acceptance Criteria:**

- LLM API errors during question generation: retry up to 3 times with exponential backoff. If exhausted, assessment marked "generation_failed" and GitHub Check set to "neutral".
- LLM API errors during scoring: retry up to 3 times. If exhausted, individual score marked "scoring_failed" and assessment proceeds with available scores.
- Malformed LLM responses (unparseable JSON, missing fields): treated as failure and retried.
- All LLM errors logged with request context (minus participant answers for privacy).

---

## Epic 5: Web Application & Authentication

The Next.js web application hosted on Vercel. Handles authentication, question answering, results, and configuration.

### Story 5.1: GitHub OAuth Authentication

**As a** user,
**I want to** sign in using my GitHub account,
**so that** I do not need a separate account.

**Acceptance Criteria:**

- Unauthenticated users see a "Sign in with GitHub" button.
- OAuth flow redirects to GitHub, then back to the app on authorisation.
- Minimum OAuth scopes: `read:user`, `read:org`.
- Expired sessions prompt re-authentication.
- Sign-out invalidates the session.


---

### Story 5.2: Access Control

**As the** system,
**I want to** enforce access control based on GitHub roles and organisation membership,
**so that** users only see authorised data.

**Acceptance Criteria:**

- Users can only see assessments for organisations they belong to (verified via GitHub API).
- Assessment URLs for non-participants show access denied.
- Org Admin access: GitHub organisation admin role.
- Repo Admin access: GitHub repository admin/maintain permission.
- Assessment participation: listed as participant on the specific assessment.


---

### Story 5.3: Assessment Answering Interface

**As a** participant,
**I want** the answering interface to be clear, fast, and mobile-friendly,
**so that** I can complete the assessment quickly.

**Acceptance Criteria:**

- Displays: repository name, PR number (PRCC) or feature name (FCS), and all questions.
- Each question: text and text area for answer (minimum 2 sentences encouraged, no hard maximum).
- Responsive and usable on mobile.
- Partially completed assessments auto-saved.
- After submission: confirmation page showing overall completion status ("You are participant 2 of 3").
- Does not show: reference answers, other participants' answers, scores, or individual breakdowns.

---

### Story 5.4: Navigation and Layout

**As a** user,
**I want** clear navigation,
**so that** I can find pending assessments, completed assessments, and settings.

**Acceptance Criteria:**

- Top-level navigation:
  - **My Assessments:** List of assessments where I am a participant (pending / completed).
  - **Organisation:** (Org Admins) Organisation dashboard and settings.
  - **Repository Settings:** (Repo Admins) Per-repository configuration.
- Landing page after sign-in shows pending assessments prominently.
- Completed assessments link to results page.


---

## Epic 6: Reporting & Results

Result pages for individual assessments and organisation-level overview. Focus on aggregate data — no individual score tracking.

### Story 6.1: PRCC Assessment Results Page

**As a** participant or Repo Admin,
**I want to** see the results of a PRCC assessment,
**so that** I understand the comprehension outcome for that PR.

**Acceptance Criteria:**

- Available once assessment is complete (all participants answered and scored).
- Shows:
  - Repository and PR number (linked to GitHub)
  - Assessment date
  - Enforcement mode (Soft / Hard) and threshold (if Hard)
  - Outcome: Passed / Failed / Skipped
  - Aggregate comprehension score (percentage)
  - Number of participants and completion rate
  - Per-question aggregate score (no individual attribution)
  - The questions (reference answers NOT shown for PRCC — prevents answer sharing on future PRs)
- Does NOT show: individual participant scores, which participant answered which way, or reference answers.
- Accessible to: all participants, Repo Admins, Org Admins.

---

### Story 6.2: FCS Assessment Results Page

**As an** FCS Initiator or FCS Participant,
**I want to** see feature comprehension results,
**so that** we can discuss comprehension gaps at our retrospective.

**Acceptance Criteria:**

- All criteria from Story 6.1, with these differences:
  - Feature name and description shown instead of PR number.
  - **Reference answers ARE shown** (FCS is retrospective and educational — seeing reference answers helps team learn).
  - Score breakdown by Naur layer shown if questions span multiple layers.
  - Artefact quality signal shown (e.g., "Questions generated from code and requirements" or "Questions generated from code only").
- Accessible to: FCS Initiator, all participants, Repo Admins, Org Admins.

---

### Story 6.3: Organisation Assessment Overview

**As an** Org Admin,
**I want to** see an overview of all assessments across my organisation,
**so that** I can identify repositories with comprehension concerns.

**Acceptance Criteria:**

- Table of all assessments (PRCC and FCS) showing:
  - Repository name
  - Assessment type (PRCC / FCS)
  - Date
  - Aggregate score
  - Outcome (Passed / Failed / Skipped / Partial)
  - Participant completion rate
- Filterable by: repository, assessment type, date range, outcome.
- Sortable by any column.
- Summary statistics:
  - Total assessments this period
  - Average aggregate score
  - Pass rate
  - Skip rate
- No individual developer names or scores on this page. The unit of analysis is the assessment (PR or feature), not the person.

---

### Story 6.4: Repository Assessment History

**As a** Repo Admin,
**I want to** see assessment history for a specific repository,
**so that** I can track comprehension trends over time.

**Acceptance Criteria:**

- Shows all assessments for the repository (same columns as Story 6.3).
- Simple line chart of aggregate score over time (one data point per assessment).
- Shows repository's current configuration.
- Fewer than 3 assessments: chart replaced with "Trend data available after 3 or more assessments."

---
 
## Out of Scope for V1

| Item | Rationale |
|------|-----------|
| **Jira integration** | Adds complexity. V1 relies on artefacts in GitHub repo and PR metadata. |
| **GitLab / Bitbucket support** | V1 is GitHub-only. Architecture should not preclude future support. |
| **CLI interface** | Both PRCC and FCS are web-based. |
| **Individual score tracking across assessments** | By design, prevents surveillance perception. Individual scores exist only within a single assessment for aggregate calculation. |
| **Custom prompt templates** | V1 uses fixed prompt templates. Customisable per-repo is V2. |
| **Team entity / team management** | Repository is the grouping unit. Teams are implicit. |
| **Slack / Teams notifications** | V1: email (FCS) and GitHub Check (PRCC) only. |
| **Cross-repo score comparison** | Scores not comparable across different artefact contexts. |
| **Artefact quality as numerical score** | V1 surfaces artefact quality as qualitative note, not number. |
| **Trend alerts / threshold notifications** | Overview dashboard is the mechanism for spotting trends. |
| **Multiple enforcement modes per repo** | V1: one mode per repository. Per-path or per-label modes deferred. |
| **Re-assessment / retake** | PRCC: new commits trigger new assessment. FCS: initiator creates new assessment. No retake flow. |
| **Self-hosted / on-premise** | V1 is SaaS (Vercel + Supabase). |
| **LLM cost controls / rate limiting** | V1: cost monitoring is operator responsibility. |
| **Webhook retry / delivery guarantee** | V1 relies on GitHub delivery. Manual "trigger assessment" button is V2. |
| **Framework metrics tracking** | Coding Time, PR Size, Review Time etc. are not tracked by this tool in V1. Focus is comprehension only. |

---

## Cross-Cutting Concerns

| Concern | Requirement |
|---------|-------------|
| **Privacy** | All assessment data in Supabase only. Never stored in GitHub (PR comments, check annotations, commit metadata). |
| **Performance** | Question generation < 30 seconds. Answer scoring < 10 seconds per answer. Targets, not hard gates. |
| **British English** | All user-facing text uses British English spelling. |
| **Accessibility** | WCAG 2.1 AA for the question answering interface. |
| **Error states** | Every user-facing error includes clear message and suggested action. |
| **Data retention** | Assessment data retained indefinitely in V1. Retention policy is V2. |

---

## Appendix: Decision Log

Links to ADRs that informed these requirements (to be populated as ADRs are created):

- ADR-0001: TBD — GitHub App as integration mechanism
- ADR-0002: TBD — Tech stack (Next.js, Supabase, Anthropic API)
- ADR-0003: TBD — Single aggregate score (no author/reviewer split)
- ADR-0004: TBD — Soft/Hard enforcement modes

---

# FILE 2: Changes to feature-comprehension-tool-plan.md

The following changes will be made to the implementation plan:

### Success Criteria (lines 14-21)
**Replace** current items 2-5 with:
1. Working tool that generates comprehension assessments from development artefacts
2. Both PRCC and FCS metrics implemented and usable
3. Tool used to assess its own implementation (dogfooding comprehension)
4. Case study material documenting the process

### Implementation Approaches (lines 26-41)
**Update** to reflect both are in scope for V1 equally, removing the "start with PR-level" sequencing. Both share the same assessment engine and web app.

### Phase 0 (lines 47-63)
**Remove:**
- "Complete framework document (Parts 4 & 5)" — done, not part of this project
- Jira references
**Add:**
- "Detailed requirements document" — now created (link to `docs/requirements/v1-requirements.md`)

### Phase 1a and 1b (lines 66-280)
**Merge** into single "Phase 1" with two tracks:
- **Track A: PRCC** — GitHub integration, webhook, Check API
- **Track B: FCS** — Assessment creation UI, participant notification
- **Shared:** Assessment engine, web app, authentication, results pages

**Update throughout:**
- Remove CLI references (feature-level is web-based)
- Replace author/reviewer score split with single aggregate
- Add Soft/Hard mode descriptions
- Remove individual score displays

### Technical Architecture (lines 358-491)
**Update:**
- Feature-level: replace CLI diagram with web-based architecture (same Next.js app)
- Add organisations table to data model
- Add `org_id` foreign keys throughout schema
- Add users table
- Improve participants table design

### Dogfooding Strategy (lines 604-656)
**Simplify** to comprehension assessment only:
- Run FCS against our own artefacts at phase completion
- Remove framework metrics tracking (Coding Time, PR Size, Review Time etc.)

### Metrics Dashboard (lines 658-685)
**Replace** with comprehension-only metrics:
- FCS scores at phase completion
- PRCC pass rate during development
- Remove framework metrics table

### Open Decisions (lines 688-716)
**Mark as decided:**
- GitHub App (decided)
- Next.js + Vercel (decided)
- Supabase (decided)
- Anthropic API (decided)
- 3-5 questions configurable (decided)
- Soft/Hard mode configurable (decided)
- Solo developer (decided)
**Remove:**
- CLI platform decision (web-based, no CLI)
- Response collection mechanism (web-based)

---

## Verification

1. Review requirements doc against all LS comments in the plan
2. Verify British English throughout
3. Run: `npx markdownlint-cli2 "docs/requirements/*.md"`
4. Run: `npx cspell "docs/requirements/*.md"`
5. Cross-reference with `feature-comprehension-score-article.md` for FCS definition consistency
6. Verify out-of-scope covers all deferred items from LS comments
