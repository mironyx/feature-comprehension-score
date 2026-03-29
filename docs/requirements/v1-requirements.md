# Feature Comprehension Score Tool — V1 Requirements

## Document Control

| Field | Value |
|-------|-------|
| Version | 1.3 |
| Status | Draft |
| Author | LS / Claude |
| Created | 2026-03-03 |
| Last updated | 2026-03-29 |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-03-03 | LS | Initial draft |
| 0.2 | 2026-03-05 | LS / Claude | Applied confirmed decisions from implementation plan review: simplified roles, updated Naur layer names, added Story 2.9, updated FCS creation flow, deferred auto-save and Naur layer breakdown, added trivial commit detection |
| 0.3 | 2026-03-07 | LS / Claude | Story 3.1: FCS participants auto-suggested from PR authors/reviewers instead of manual entry (L3 design decision) |
| 0.4 | 2026-03-08 | LS / Claude | Story 1.1: Added acceptance criteria for org/repo soft-delete (active/inactive status on uninstall/removal) |
| 0.5 | 2026-03-09 | LS / Claude | Drift report fixes: replaced Repo Admin with Org Admin (W3, Stories 1.3, 2.7, 6.1); removed deprecated FCS Initiator and FCS Participant role names (W4, Roles section and Story 3.3); removed auto-save from Story 5.3 acceptance criteria (W5); rewrote Story 3.1 artefact selection to merged PRs only (W6); fixed Epic 5 hosting reference to GCP Cloud Run (I1); added Research Spikes to Appendix (I2) |
| 0.6 | 2026-03-09 | LS / Claude | Story 2.9: updated acceptance criteria to reference Check Run as the metadata export mechanism (not commit status or label), aligned with design doc v0.7 decision |
| 0.7 | 2026-03-14 | LS / Claude | Added V2 section with PR Decorator feature (Epic 7) |
| 0.8 | 2026-03-15 | LS / Claude | Story 4.1: added additional_context_suggestions to LLM response (passive metadata). V2: added OSS model consideration and agentic artefact retrieval sections. Out of Scope: added OSS models and agentic retrieval entries. |
| 0.9 | 2026-03-16 | LS / Claude | Story 3.4: added self-directed private view for FCS participants (own scores, Naur layer, submitted answers — no reference answers). Added Story 3.6: FCS Self-Reassessment (re-answer flow, locked aggregate). Per ADR-0005 revision (Option 4). |
| 1.0 | 2026-03-18 | LS / Claude | V2: added expanded assessment areas (test strategy, operational, security); added IP-rich feature concepts (comprehension decay, outcome correlation, AI vs human delta, bus factor map, artefact quality scoring, benchmark mode). |
| 1.1 | 2026-03-27 | LS / Claude | Story 1.1: added technical mechanism note — webhook handler at `POST /api/webhooks/github` is the implementation mechanism for org/repo registration. |
| 1.2 | 2026-03-29 | LS / Claude | Story 3.1: added post-creation UX AC (rubric_generation waiting state, rubric_failed error state with retry). Story 4.5: renamed status to `rubric_failed`; added admin retry AC and admin visibility AC. Story 5.1: added `repo` to required OAuth scopes (required for reading PR content). |
| 1.3 | 2026-03-29 | LS / Claude | MVP Phase 2 dogfooding findings: Story 4.1 corrected world-to-program Naur layer definition (domain-to-code correspondence, not project history). Added observability requirement to Cross-Cutting Concerns (structured logging, LLM call tracing). Story 5.2 added participant linking AC. |

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
| **Naur layer** | One of three layers of developer understanding from Peter Naur's Theory Building: world-to-program mapping, design justification, modification capacity. |

---

## Roles

| Role | Type | Description |
|------|------|-----------|
| **Org Admin** | Persistent | Highest app role. Installs the GitHub App, configures organisation-level and repository-level settings. Maps to GitHub organisation owner/admin. Can create FCS assessments. |
| **User** | Persistent | Any authenticated user who belongs to an organisation with the app installed. Can view assessments for their orgs, answer assessments they are listed on, and be nominated as a participant. |
| **Author** | Contextual | PR author in a PRCC assessment. Assigned automatically when a PR triggers PRCC. |
| **Reviewer** | Contextual | Required reviewer on a PR in a PRCC assessment. Assigned automatically. |

**Notes:**
- GitHub roles (org admin, repo admin/maintainer) are used for permission checks but are not separate app roles.
- Repo-level configuration and gate skip capabilities are exercised by Org Admins.
- Author and Reviewer are contextual — a User becomes an Author or Reviewer for a specific assessment, not permanently.

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
- Given the Org Admin uninstalls the GitHub App from the organisation, the organisation record is set to inactive (soft-deleted). Active assessments are not deleted.
- Given a repository is removed from the app installation, the repository record is set to inactive. Existing assessment data is retained.

**Notes:** The GitHub App must request the minimum permissions needed: read access to pull requests, code, and metadata; write access to checks and statuses.

**Technical mechanism:** Organisation and repository registration is driven by a GitHub App webhook handler at `POST /api/webhooks/github`. GitHub fires `installation` and `installation_repositories` events to this endpoint when the app is installed, modified, or uninstalled. The handler verifies the request signature (`X-Hub-Signature-256`) before processing. See §4.4 in the design document for the full route contract.

---

### Story 1.2: Organisation Dashboard Access

**As an** Org Admin,
**I want to** access a web dashboard for my organisation after installing the app,
**so that** I can view and manage my organisation's settings and assessments.

**Acceptance Criteria:**

- Given the Org Admin authenticates via GitHub OAuth, when they log in, then they see a list of organisations they have admin access to that have the app installed.
- Given the user belongs to multiple organisations with the app installed, then they see an organisation switcher to select which to view.
- Given an authenticated user who is not an admin of any organisation with the app installed, then they see an appropriate message and installation instructions.
- Given the Org Admin selects an organisation, then they see a dashboard showing all registered repositories and their configuration status.

---

### Story 1.3: Repository Configuration

**As an** Org Admin,
**I want to** configure comprehension assessment settings for a specific repository,
**so that** the tool behaves appropriately for my team's context.

**Acceptance Criteria:**

- Given a registered repository, an Org Admin can configure:
  - **PRCC enabled/disabled** (default: enabled)
  - **FCS enabled/disabled** (default: enabled)
  - **Enforcement mode for PRCC:** Soft or Hard (default: Soft)
  - **Score threshold for Hard mode:** Configurable percentage (default: 70%)
  - **Question count for PRCC:** 3 to 5 (default: 3)
  - **Question count for FCS:** 3 to 5 (default: 5)
  - **Minimum PR size for PRCC:** Line count below which PRCC is skipped (default: 20 lines changed)
  - **Exempt file patterns:** Glob patterns for files that should not trigger PRCC (e.g., `*.md`, `*.json`, `package-lock.json`)
- Given a configuration change is saved, then it takes effect for the next assessment (not retroactively).
- Given no configuration has been set for a repository, then organisation-level defaults are used.
- Only Org Admins can access and modify repository configuration.

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
- Given a user switches between organisations via the org switcher, then all data (assessments, configuration, reports) refreshes to show only the selected organisation's data.
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
- The extracted artefacts are passed to the assessment engine (Story 4.1) as structured input. This extraction is testable via unit test with sample PR data.

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

**As a** PR Author or Reviewer,
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
- Given a participant has been flagged for irrelevant answers 3 times on the same question, the system accepts the answer but flags the assessment for Org Admin review.
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

**As an** Org Admin,
**I want to** skip the PRCC gate for a specific PR when justified,
**so that** emergency hotfixes or time-critical changes are not blocked.

**Acceptance Criteria:**

- Given a PR has a PRCC assessment pending, an Org Admin can mark the assessment as "skipped" from the web app with a mandatory reason. Only Org Admins can skip assessments.
- Given an assessment is skipped, the GitHub Check is set to "neutral" with annotation "Comprehension check skipped: [reason]".
- The skip event is recorded (user, timestamp, reason).
- Skips are visible in organisation-level reporting (skip rate is a tracked metric).
- PR Authors cannot skip their own assessments unless they are also Org Admins (role check via GitHub API).

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
- Given a trivial commit is pushed (e.g., only documentation/comments changed, or fewer than 5 lines changed), the existing assessment is NOT invalidated. The heuristic for "trivial" is configurable.
- The assessment answering interface displays a UX notice: "Finish your PR before requesting review — new commits will require a new assessment."

**Notes:** Regeneration on push prevents gaming (answer easy questions on trivial commit, then push real code). The trivial commit exception avoids penalising minor fixes (typos, comment updates). If this proves too painful, a V2 option could be "regenerate only if diff changes by more than X%".

---

### Story 2.9: PR Metadata Export

**As an** Org Admin,
**I want** comprehension score and skip status stored in PR metadata,
**so that** external metrics systems can consume the data.

**Acceptance Criteria:**

- Given a PRCC assessment completes (pass or fail), the aggregate score and outcome are surfaced via the GitHub Check Run `output.summary` field in a consistent, machine-readable format (pipe-delimited: `Aggregate comprehension: {score}% | Participants: {n}/{total} | Outcome: {outcome}`).
- Given a PRCC assessment is skipped, the Check Run `output.summary` reflects the skipped outcome.
- External systems can query the Check Run via `GET /repos/{owner}/{repo}/commits/{ref}/check-runs?check_name=Comprehension+Check` and use the `external_id` field to cross-reference with the Supabase API for full assessment data.
- Assessment data remains in Supabase only (the Check Run carries summary information, not the full assessment).

---

## Epic 3: Feature Comprehension Score (FCS) Flow

The retrospective diagnostic. An Org Admin creates an assessment for a feature by selecting merged PRs, nominates participants, they answer via the web app, and a feature-level comprehension score is produced.

### Story 3.1: Create Feature Assessment

**As an** Org Admin,
**I want to** create a feature comprehension assessment by selecting merged PRs from a repository,
**so that** I can assess my team's understanding at sprint retro.

**Acceptance Criteria:**

- Given I am authenticated as an Org Admin and have access to a repository with FCS enabled, I can create a new FCS assessment from the web app.
- I provide:
  - Feature name/title (free text)
  - Description (optional)
  - One or more merged PRs from the repository (the system extracts artefacts from the selected PRs, reusing the same extraction logic as PRCC)
  - Participant list: auto-suggested from the authors and reviewers of the selected merged PRs. Org Admin can add or remove participants before confirming.
- Given I select merged PRs, the system auto-suggests participants from those PRs' authors and reviewers.
- Given I submit, the system fetches artefacts from the selected PRs via GitHub API and initiates question generation.
- Given I submit successfully, I am redirected to the assessments list where the new assessment appears in a "Generating questions…" state (`rubric_generation` status) until the LLM completes.
- Given rubric generation completes successfully, the assessment status changes to `awaiting_responses` and it becomes actionable for participants.
- Given rubric generation fails (LLM error, network timeout), the assessment is marked `rubric_failed` and I see an error state with a "Retry" button. Retrying re-runs rubric generation against the already-stored PR records without re-validating them.
- Given a selected PR has an active or in-progress PRCC assessment, the system displays a warning before proceeding.
- Given the artefacts are insufficient (e.g., single empty file), the system warns the initiator and proceeds (thin artefacts produce thin questions — by design).

---

### Story 3.2: FCS Participant Notification

**As a** participant,
**I want to** receive a notification that I have been asked to complete a comprehension assessment,
**so that** I can complete it before the sprint retro.

**Acceptance Criteria:**

- Given an FCS assessment is created with my GitHub username as a participant, I receive a notification via email (using the email associated with my GitHub account).
- The notification includes: feature name, repository, number of questions, and a link to the web app.
- Given a participant has not completed the assessment within a configurable timeframe (default: 48 hours), a single reminder is sent.

---

### Story 3.3: Assessment Question Answering (FCS)

**As a** participant,
**I want to** answer comprehension questions about a feature via the web app,
**so that** my team gets a comprehension score.

**Acceptance Criteria:**

- All acceptance criteria from Story 2.4 apply (authentication, access control, question display, submission, no resubmission).
- FCS assessments do not block any GitHub process (no Check Run).
- Given not all participants have completed, the Org Admin can see a completion dashboard showing which participants have and have not answered (visible to Org Admin only for follow-up purposes).

---

### Story 3.4: FCS Scoring and Results

**As an** Org Admin,
**I want to** see the feature comprehension score once all participants have answered,
**so that** I can use it in our sprint retrospective discussion.

**Acceptance Criteria:**

- Given all participants have submitted, the system scores all answers and calculates the aggregate Feature Comprehension Score.
- The FCS result page (Org Admin view) shows:
  - Overall aggregate score (percentage)
  - Per-question aggregate score (how the group did on each question, no individual attribution)
  - The questions with reference answers (now visible, since assessment is complete)
  - Artefact quality signal: a note if artefacts were thin (e.g., "Questions generated from code only — no requirements or design documents available")
- Individual participant scores are not displayed to Org Admins or other participants.
- The Org Admin can trigger scoring before all participants answer (with warning that score is based on partial data).
- Given a participant views the FCS results page, they see a **self-directed private view** showing:
  - Their own per-question scores (0.0–1.0)
  - The Naur layer each question targets (domain intent / design justification / modification capacity)
  - The questions and their own submitted answers
  - Reference answers are **not** shown in the self-view (prevents gaming on re-assessment)
- The self-directed view is visible only to the participant themselves — no other user (including Org Admins) can access it.
- See ADR-0005 (revised) for rationale.

**Notes:** The self-directed view is a learning aid, not a reporting mechanism. The team aggregate is the organisational metric. PRCC results pages do not include a self-directed view — see Story 6.1.

---

### Story 3.5: FCS Without Full Participation

**As an** Org Admin,
**I want to** close an FCS assessment even if not all participants have responded,
**so that** a missing team member does not block the retrospective.

**Acceptance Criteria:**

- Given an FCS assessment has been open for more than the configured timeframe, the Org Admin can "close" the assessment and trigger scoring on responses received.
- The result clearly indicates: "Score based on N of M participants".
- Participants who did not respond are recorded as "did not participate" (not scored as zero).

---

### Story 3.6: FCS Self-Reassessment

**As a** participant,
**I want to** re-answer an FCS assessment after seeing my scores,
**so that** I can test whether I have closed my comprehension gaps.

**Acceptance Criteria:**

- Given I have completed an FCS assessment and can see my self-directed scores (Story 3.4), I can choose to re-answer the assessment at any time.
- Given I start a re-assessment, I see the same questions as the original assessment (the rubric is fixed).
- Given I submit re-assessment answers, they are scored against the same rubric and my self-directed view updates with the new scores.
- Given I re-assess, the **team aggregate score is not affected** — it is locked at first completion and never recalculated from re-assessment answers.
- Given I have re-assessed multiple times, my self-directed view shows only the most recent scores (not a history of all attempts).
- Given I re-assess, my original answers and scores are retained in the database for audit purposes but are not displayed.
- Re-assessment is available only for FCS assessments, not PRCC.
- There is no limit on the number of re-assessments a participant can perform.

**Notes:** Re-assessment is a learning exercise. The participant studies the artefacts (code, design docs, PRs) to improve their understanding, then re-answers to verify. This aligns with Naur's theory building — comprehension is built through engagement with the artefacts, not by reading reference answers.

---

## Epic 4: Shared Assessment Engine

The core engine used by both PRCC and FCS. Handles question generation, rubric creation, answer scoring, and aggregate calculation.

### Story 4.1: Question Generation from Artefacts

**As the** system,
**I want to** generate comprehension questions from development artefacts,
**so that** both PRCC and FCS use the same generation logic.

**Acceptance Criteria:**

- Given a set of artefacts (code diffs, full files, PR descriptions, linked issues, design documents), the system generates 3-5 questions (configurable) targeting Naur's three layers:
  - **World-to-program mapping** (domain-to-code correspondence): "Which domain concept does X represent in the code? How do the domain entities map to the data model? What aspects of the domain are deliberately not modelled?"
  - **Design justification** (structural decisions): "Why was this approach chosen? What are the trade-offs?"
  - **Modification capacity** (safe change paths): "What would break if we changed X? How would you extend this?"

World-to-program mapping (domain-to-code correspondence): "Given the following requirements and test cases, generate five short-answer questions that test whether a developer understands how real-world domain concepts are reflected in the program structure — which aspects of the domain the program handles, how domain entities map to code constructs (types, tables, modules), and which domain behaviours are deliberately excluded. Questions should require reasoning about domain-to-code correspondence, not code recall or project history. Do not ask about why a file was created, development process decisions, or session/issue history. For each question, output: the question text, a weight from 1–3 reflecting its importance to domain correctness, and a reference answer that a developer with full understanding of the artefacts should be able to give."

Design justification (structural decisions): "Given the following design notes, ADRs, and pull request descriptions, generate five short-answer questions that test whether a developer understands why key structural decisions were made — module boundaries, data model choices, integration approach — not just what they are. For each question, output: the question text, a weight from 1–3 reflecting how central this decision is to the overall design, and a reference answer derived from the artefacts. Where the artefacts do not record a justification, note that explicitly in the reference answer rather than inferring one."

Modification capacity (safe change paths): "Given the following codebase and requirements, generate five scenario-based questions that test whether a developer could safely make a specific type of change — adding a new rule, extending an integration, handling a new edge case — without breaking existing behaviour. For each question, output: the question text, a weight from 1–3 reflecting the risk level of the change scenario, and a reference answer describing the correct reasoning path and any dependencies or constraints the developer would need to account for."

- For each question, the system generates:
  - Question text (short-answer format)
  - Weight (1-3) reflecting importance/risk
  - Reference answer derived from artefacts
- The rubric is generated in a single LLM call and stored before any participant sees questions.
- Reference answers are never shown to participants until assessment completion (FCS) or not at all (PRCC).
- Given code-only artefacts (no requirements, no design docs), the system generates code-focused questions and includes metadata flag: `artefact_quality: code_only`.
- The system uses the Anthropic Claude API for generation.
- Given the artefacts provided are incomplete (e.g., code-only, no design docs), the LLM response includes optional `additional_context_suggestions` — a list of artefact types that would improve question quality if available. This metadata is stored with the assessment for analysis but not acted upon in V1.

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

- LLM API errors during question generation: retry up to 3 times with exponential backoff. If all retries are exhausted, assessment status is set to `rubric_failed` (not rolled back — PR records are retained for retry). For PRCC, GitHub Check is set to "neutral".
- Given an assessment is in `rubric_failed` state, an Org Admin can trigger a retry from the assessments list. Retry re-runs rubric generation against the already-stored PR records without re-validating them.
- Given an assessment is in `rubric_generation` or `rubric_failed` state, it appears in the Org Admin's assessments list with its current status clearly indicated (not silently hidden).
- LLM API errors during scoring: retry up to 3 times. If exhausted, individual score marked "scoring_failed" and assessment proceeds with available scores.
- Malformed LLM responses (unparseable JSON, missing fields): treated as failure and retried.
- All LLM errors logged with request context (minus participant answers for privacy).

---

## Epic 5: Web Application & Authentication

The Next.js web application hosted on GCP Cloud Run (ADR-0002). Handles authentication, question answering, results, and configuration.

**Hosting:** GCP Cloud Run (see ADR-0002). Not Vercel.

### Story 5.1: GitHub OAuth Authentication

**As a** user,
**I want to** sign in using my GitHub account,
**so that** I do not need a separate account.

**Acceptance Criteria:**

- Unauthenticated users see a "Sign in with GitHub" button.
- Authentication uses Supabase Auth with GitHub as the OAuth provider. Supabase manages sessions and token refresh; GitHub provides identity.
- OAuth flow redirects to GitHub, then back to the app on authorisation.
- Minimum OAuth scopes: `read:user`, `read:org`, `repo`. The `repo` scope is required to read PR content (titles, merge status, diffs) for artefact extraction and rubric generation.
- Expired sessions prompt re-authentication via Supabase token refresh.
- Sign-out invalidates the Supabase session.

---

### Story 5.2: Access Control

**As the** system,
**I want to** enforce access control based on organisation membership and app roles,
**so that** users only see authorised data.

**Acceptance Criteria:**

- Users can only see assessments for organisations they belong to (verified via GitHub API).
- Assessment URLs for non-participants show access denied.
- Participant linking: when a participant first visits an assessment URL, the system links their authenticated user identity to their enrolment record (which was created with only their GitHub user ID). This must use the participant's own authenticated session so the identity link is correct.
- Org Admin access: determined by GitHub organisation admin role.
- Assessment participation: listed as participant on the specific assessment.
- All access checks enforce the simplified role model: Org Admin, User, Author (contextual), Reviewer (contextual).

---

### Story 5.3: Assessment Answering Interface

**As a** participant,
**I want** the answering interface to be clear, fast, and mobile-friendly,
**so that** I can complete the assessment quickly.

**Acceptance Criteria:**

- Displays: repository name, PR number (PRCC) or feature name (FCS), and all questions.
- Each question: text and text area for answer (minimum 2 sentences encouraged, no hard maximum).
- Responsive and usable on mobile.
- After submission: confirmation page showing overall completion status ("You are participant 2 of 3").
- Does not show: reference answers, other participants' answers, scores, or individual breakdowns.

**Notes:** Auto-save of draft answers is deferred to V2.

---

### Story 5.4: Navigation and Layout

**As a** user,
**I want** clear navigation,
**so that** I can find pending assessments, completed assessments, and settings.

**Acceptance Criteria:**

- Top-level navigation:
  - **My Assessments:** List of assessments where I am a participant (pending / completed).
  - **Organisation:** (Org Admins) Organisation dashboard and settings.
  - **Repository Settings:** (Org Admins) Per-repository configuration.
- Landing page after sign-in shows pending assessments prominently.
- Completed assessments link to results page.
- Build admin-first: full interface with all views for Org Admins, then restrict views for non-admin Users.

---

## Epic 6: Reporting & Results

Result pages for individual assessments and organisation-level overview. Focus on aggregate data — no individual score tracking.

### Story 6.1: PRCC Assessment Results Page

**As a** participant or Org Admin,
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
- Accessible to: all participants and Org Admins. Access verified via organisation membership check.

---

### Story 6.2: FCS Assessment Results Page

**As an** Org Admin or participant,
**I want to** see feature comprehension results,
**so that** we can discuss comprehension gaps at our retrospective.

**Acceptance Criteria:**

- All criteria from Story 6.1, with these differences:
  - Feature name and description shown instead of PR number.
  - **Reference answers ARE shown** (FCS is retrospective and educational — seeing reference answers helps team learn).
  - Artefact quality signal shown (e.g., "Questions generated from code and requirements" or "Questions generated from code only").
- Individual participant scores are not displayed.
- Accessible to: Org Admin, all participants.

**Notes:** Naur layer breakdown in FCS results is deferred to V2. V1 shows aggregate + per-question aggregate only.

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

**As an** Org Admin,
**I want to** see assessment history for a specific repository,
**so that** I can track comprehension trends over time.

**Acceptance Criteria:**

- Shows all assessments for the repository (same columns as Story 6.3).
- Simple line chart of aggregate score over time (one data point per assessment).
- Shows repository's current configuration.
- Fewer than 3 assessments: chart replaced with "Trend data available after 3 or more assessments."

---

## V2 Features

Features confirmed for V2 but not in scope for V1. Captured here to preserve intent without creating scope creep pressure.

### Epic 7: PR Decorator

A companion feature to FCS assessment. Generates exploratory, reflection-focused questions and posts them as a GitHub PR comment when a PR is submitted. Not a gate — no scoring, no blocking. Purpose is developer learning and theory building at the moment of highest context.

**Motivation:** Meets developers where they already are (the PR), requires no intent or discipline, and brings standardised questions to the developer rather than requiring self-directed LLM use. Distinct from FCS assessment: this is a learning aid, not a measurement instrument.

**Two distinct question modes (same analysis engine, different prompt):**

| | PR Decorator | FCS Assessment |
|---|---|---|
| **Purpose** | Learning / reflection | Measurement |
| **Audience** | Developer | Team + Leadership |
| **Tone** | Conversational, exploratory | Structured, standardised |
| **Timing** | At PR submission | Post-sprint / post-feature |
| **Stakes** | None — no score | Produces the FCS metric |
| **Questions** | Open, "dig deeper" style | Targeted, comprehension-testing |

**High-level stories (to be detailed in V2 requirements):**

- **Story 7.1: PR decorator question generation** — On PR open/ready-for-review, generate 3–5 exploratory questions from PR artefacts using a dedicated "reflection" prompt mode (not the assessment scoring prompt). Post as a GitHub PR comment. No scoring, no participant list, no check run.
- **Story 7.2: PR decorator configuration** — Org Admin can enable/disable PR decorator independently of PRCC. Configurable question count (default: 3).
- **Story 7.3: Optional response capture** — If developers reply to the PR comment with answers, optionally capture responses as enrichment data for the FCS trend analysis pipeline. (Requires design — privacy implications to consider.)

**Sequencing note:** Ship FCS assessment V1 first. Add PR decorator once a design partner is using the product — their feedback will determine exactly what "reflection" questions should look like.

---

### OSS / Alternative LLM Models for Question Generation

V1 uses the Anthropic Claude API exclusively for question generation and scoring. For V2, evaluate open-source or alternative models to reduce cost:

- **Question generation** — The most token-intensive operation. OSS models (e.g., Llama, Mistral, DeepSeek) running on self-hosted infrastructure or via cheaper API providers could reduce per-assessment cost significantly. Quality trade-off must be benchmarked against Claude output.
- **Relevance detection** — Binary classification task. Likely achievable with smaller, cheaper models. Good candidate for early migration.
- **Answer scoring** — Requires nuanced semantic comparison. Quality is critical here. Likely remains on Claude longer, but worth benchmarking.
- **Model abstraction** — The `LLMClient` port interface already abstracts the provider. Adding an alternative provider is an adapter change, not an architecture change.

### Agentic Artefact Retrieval

V1 captures `additional_context_suggestions` from the LLM as passive metadata. For V2, evaluate an agentic approach where the system automatically retrieves suggested artefacts and re-generates questions:

- The V1 `additional_context_suggestions` data provides evidence for whether this would add value (if the LLM consistently requests the same artefact types, the investment is justified).
- Cost implications: additional LLM calls and GitHub API calls per assessment. Should be opt-in and configurable per organisation.
- Aligns with the `ArtefactSource` port design — the agent would call back into the same extraction interface.

---

### Expanded Assessment Areas

V1 generates questions across Naur's three layers (world-to-program mapping, design justification, modification capacity). These additional knowledge areas are candidates for V2 assessment prompts. Each is a distinct dimension of understanding that AI-augmented teams are likely to have invisible blind spots in.

**Test strategy awareness**
Not coverage percentage, but qualitative understanding of what the test suite actually guards. Example questions: "What failure modes does this test suite not catch? What would you add to it and why?" With AI writing tests, a team can have 85% coverage and no understanding of what the tests actually protect. This area is orthogonal to Naur — it tests confidence in quality, not just understanding of the feature.

**Operational / production knowledge**
Can the team explain how this feature behaves in production? Example questions: "How would you know this feature is broken? What would you look at first in an incident? What are the known performance characteristics?" Naur's modification capacity layer partially covers this, but operational knowledge is a distinct domain — a developer can reason about code changes without knowing anything about alerts, dashboards, or failure modes at runtime.

**Security / threat model awareness**
Does the team understand the trust boundaries and attack surface? Example questions: "What data flows through this feature? What trust assumptions were made? What is the most likely misuse vector?" Particularly relevant for AI-generated code, where the implementation may be syntactically safe but semantically naive about threats. Should be configurable — not all features have a meaningful security surface.

**Notes:** These areas should be opt-in and configurable per assessment — a CRUD endpoint and a payment pipeline have very different threat surfaces. Universal application would dilute question quality. Exact prompt engineering for each area is a V2 research spike.

---

### Comprehension Decay Tracking

Track how team understanding of a feature changes over time by enabling periodic re-assessment of the same feature (30 / 60 / 90 days after completion). Plot the "comprehension half-life" per feature.

**Motivation:** Naur's original observation was that when the team disperses or moves on, the theory dies. This is the first tool to make that decay visible and measurable. The longitudinal data accumulated across customers becomes a moat — over time the product can show norms: "the average team loses 40% of design justification understanding within 8 weeks."

**High-level design notes (to be detailed in V2 requirements):**

- Decay assessments reuse the same question set as the original to allow direct comparison.
- Score trend is shown per feature: original score → 30-day → 60-day → 90-day.
- Org Admin can schedule decay assessments or trigger manually.
- Decay curve is a product-level differentiator and should be surfaced prominently in the results dashboard.

---

### Comprehension-to-Outcome Correlation

Cross-reference FCS scores with production incidents, bug rates, and change failure rates per feature. Over time, the system builds evidence of the relationship between comprehension and delivery quality.

**Motivation:** This is a data flywheel. Each customer's data makes the signal stronger. Once the correlation is established (e.g., "features scoring below 60% have 3× the incident rate in the following 90 days"), the FCS score becomes a leading indicator for risk — not just a retrospective measurement. This is impossible to replicate without longitudinal data and is the strongest long-term moat in the product.

**High-level design notes (to be detailed in V2 requirements):**

- V1 incident integration: GitHub Issues labelled as bugs, or Jira integration.
- Correlation is shown at org level, not feature level, to avoid surveillance perception.
- Requires a minimum dataset threshold before surfacing — suppress until statistically meaningful.
- Privacy: individual scores are never included in correlation analysis, only aggregate feature scores.

---

### AI vs Human Comprehension Delta

Ask the same assessment questions to an LLM (with full access to the feature artefacts) and to the human participants. Surface the gap as a distinct metric.

**Motivation:** A genuinely novel framing not found in any existing tool. If AI scores 85% and the team scores 40% on their own code — that is a strong signal. If the team scores higher than the AI — they have genuine depth that the artefacts alone do not surface, which is exactly what Naur's theory building describes. The delta itself is informative in both directions.

**High-level design notes (to be detailed in V2 requirements):**

- AI baseline is generated at question-creation time using the same artefacts, before any human answers.
- AI baseline is not shown to participants during the assessment (prevents anchoring).
- Delta is shown in the results view alongside the aggregate human score.
- Framing matters: position as "what the code says about itself" vs. "what the team knows beyond the code" — not as a competition.

---

### Bus Factor Map

Visualise which team members have a passing FCS score on which features. Flag features where fewer than N people have demonstrated sufficient understanding.

**Motivation:** Bus factor (or truck factor) is a well-understood concept in engineering leadership. This makes it measurable per feature, not just per codebase. Particularly actionable when a team member announces they are leaving — the manager can immediately see which features are at risk. Multi-user data is required, so this is a natural fit for V2 after V1 accumulates team-level participation data.

**High-level design notes (to be detailed in V2 requirements):**

- Displayed as a feature × participant matrix on the org dashboard (accessible to Org Admin only).
- "Passing" threshold is configurable (default: 70%).
- Features with only one participant above threshold are flagged as single points of failure.
- Integrates with GitHub membership: when a contributor leaves the org, affected features are automatically re-flagged.
- Individual scores remain private — the map shows pass/fail status only, not scores.

---

### Artefact Quality Scoring

Alongside the FCS score, score the quality of the artefacts that were available for the assessment. Thin artefacts generate thin questions — artefact quality is the upstream constraint on comprehension.

**Motivation:** This shifts the tool's framing from "your team failed to understand the feature" to "your knowledge transfer process produced insufficient artefacts." Less threatening, more actionable. It also surfaces a second diagnostic signal: a team with high artefact quality and low FCS scores has a different problem from a team with low artefact quality and low FCS scores.

**High-level design notes (to be detailed in V2 requirements):**

- Artefact quality dimensions: PR description completeness, linked issues, design document presence, commit message quality, inline comments.
- Scoring is LLM-based, using a separate evaluation prompt — not a heuristic count.
- Shown alongside FCS score on the results page: "Artefact quality: 62% — questions may not fully cover design intent."
- V1 already captures `additional_context_suggestions` which is a proxy signal for artefact gaps — use as training signal for the quality scorer.

---

### Benchmark Mode

Aggregate anonymised FCS scores across participating organisations by feature type, team size, and industry vertical. Surface peer comparison as a contextual reference alongside each team's own score.

**Motivation:** Network effect — every new customer makes the benchmark more valuable, creating retention and a compounding data advantage. Example insight: "Your team scores 78% on design justification — the median for similar-sized teams on similar features is 65%." Transforms the FCS from an absolute score into a relative one, which is far more meaningful for goal-setting.

**High-level design notes (to be detailed in V2 requirements):**

- Opt-in only. Organisations must explicitly consent to contribute anonymised data to the benchmark pool.
- Minimum cohort size before surfacing a benchmark (e.g., 10 organisations) to prevent reverse-engineering of individual org data.
- Segmentation dimensions: team size, feature complexity (proxy: PR size, commit count), industry (self-reported).
- Shown on the results page as a contextual band ("teams like yours"), not a leaderboard.

---

## Out of Scope for V1

| Item | Rationale |
|------|-----------|
| **Jira integration** | Adds complexity. V1 relies on artefacts in GitHub repo and PR metadata. |
| **GitLab / Bitbucket support** | V1 is GitHub-only. Architecture should not preclude future support. |
| **CLI interface** | Both PRCC and FCS are web-based. |
| **Individual score tracking across assessments** | By design, prevents surveillance perception. Individual scores are visible only to the participant within a single FCS assessment (self-directed view, ADR-0005). No cross-assessment individual tracking. |
| **Custom prompt templates** | V1 uses fixed prompt templates. Customisable per-repo is V2. |
| **Team entity / team management** | Repository is the grouping unit. Teams are implicit. |
| **Slack / Teams notifications** | V1: email (FCS) and GitHub Check (PRCC) only. |
| **Cross-repo score comparison** | Scores not comparable across different artefact contexts. |
| **Artefact quality as numerical score** | V1 surfaces artefact quality as qualitative note, not number. |
| **Trend alerts / threshold notifications** | Overview dashboard is the mechanism for spotting trends. |
| **Multiple enforcement modes per repo** | V1: one mode per repository. Per-path or per-label modes deferred. |
| **Re-assessment / retake (PRCC)** | PRCC: new commits trigger new assessment. No self-reassessment for PRCC (it is a gate, not a learning tool). FCS self-reassessment is in scope — see Story 3.6. |
| **Self-hosted / on-premise** | V1 is SaaS. |
| **OSS / alternative LLM models** | V1 uses Anthropic Claude exclusively. Model abstraction exists via LLMClient port. Benchmark alternatives in V2. |
| **Agentic artefact retrieval** | V1 captures `additional_context_suggestions` as passive metadata. Automatic retrieval and re-generation deferred to V2. |
| **LLM cost controls / rate limiting** | V1: cost monitoring is operator responsibility. |
| **Webhook retry / delivery guarantee** | V1 relies on GitHub delivery. Manual "trigger assessment" button is V2. |
| **Framework metrics tracking** | Coding Time, PR Size, Review Time etc. are not tracked by this tool in V1. Focus is comprehension only. |
| **Auto-save draft answers** | Deferred to V2. |
| **Naur layer breakdown in FCS results** | V1 shows aggregate + per-question aggregate only. Layer breakdown deferred to V2. |

---

## Cross-Cutting Concerns

| Concern | Requirement |
|---------|-------------|
| **Privacy** | All assessment data in Supabase only. Never stored in GitHub (PR comments, check annotations, commit metadata). PR metadata export (Story 2.9) contains summary scores only. |
| **Performance** | Question generation < 30 seconds. Answer scoring < 10 seconds per answer. Targets, not hard gates. |
| **British English** | All user-facing text uses British English spelling. |
| **Accessibility** | WCAG 2.1 AA for the question answering interface. |
| **Observability** | Structured JSON logging to stdout (compatible with Cloud Run / GCP Logging). All API routes log with request context (request ID, user ID). LLM calls log: assembled artefact summary, full prompt, full response, latency. Log levels: `error` for failures, `warn` for degraded paths, `info` for lifecycle events and LLM calls. Design for future OpenTelemetry integration. |
| **Error states** | Every user-facing error includes clear message and suggested action. |
| **Data retention** | Assessment data retained indefinitely in V1. Retention policy is V2. |

---

## Appendix: Decision Log

Links to ADRs that informed these requirements:

| ADR | Decision |
|-----|----------|
| ADR-0001 | GitHub App as integration mechanism (vs GitHub Action) |
| ADR-0002 | Hosting: GCP Cloud Run (chosen over Vercel) |
| ADR-0003 | Auth: Supabase Auth + GitHub OAuth |
| ADR-0004 | Roles & access control model |
| ADR-0005 | Single aggregate score (no author/reviewer split) |
| ADR-0006 | Soft/Hard enforcement modes |
| ADR-0007 | PR size threshold criteria (lines vs files vs combination) |
| ADR-0008 | Data model & multi-tenancy approach |

---

## Appendix: Research Spikes

Research spikes that informed design decisions and ADRs:

| Spike | Topic | Informed |
|-------|-------|----------|
| spike-003 | GitHub Check API — Check Runs vs Commit Statuses, permissions, webhook events, re-run behaviour | ADR-0001 (GitHub App integration), Story 2.9 L4 contract (PR metadata export via Check Run) |
| spike-004 | Supabase Auth + GitHub OAuth — session management, JWT handling, RLS integration, org membership verification | ADR-0003 (Auth: Supabase Auth + GitHub OAuth) |

---

*This document is an artefact that will be used in our own Feature Comprehension Score assessment.*
