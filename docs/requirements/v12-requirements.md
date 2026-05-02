# Feature Comprehension Score — V12 Requirements: PR Comprehension Check

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.1 |
| Status | Draft — Structure |
| Author | LS / Claude |
| Created | 2026-05-02 |
| Last updated | 2026-05-02 |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-05-02 | LS / Claude | Initial structure draft |

---

## Context / Background

V1 specified PRCC (PR Comprehension Check) as a preventative quality gate: when a PR is opened on a PRCC-enabled repository, the system generates comprehension questions from the PR artefacts, participants answer via the web app, and a GitHub Check Run passes or fails based on the configured enforcement mode. Nine stories were written (Epic 2 in V1).

V11 introduced Projects as the organising layer for FCS assessments and explicitly deferred PRCC product features. The only PRCC-related change in V11 was a nullable `project_id` FK on the `assessments` table — foundation work to avoid future schema migration. PRCC webhook handling, Check Run management, and the answering/scoring flow were not implemented.

V12 implements PRCC end-to-end, adapted for the V11 project model. A repo must be linked to a project before PRCC can be enabled on it. The project provides rubric-generation context (glob patterns, domain notes) for its linked repos' PRCC assessments — the same context used for FCS assessments in that project. PRCC operational settings (enforcement mode, score threshold, question count, minimum PR size, exempt file patterns) remain at the repo level.

This is a clean-sheet document. It does not re-state the V1 PRCC stories verbatim; it re-specifies them for the post-V11 architecture.

---

## Glossary

| Term | Definition |
|------|-----------|
| **PRCC** | PR Comprehension Check — a preventative quality gate triggered by PR events on enabled repos. Generates comprehension questions, collects participant answers, and updates a GitHub Check Run to pass or fail based on enforcement mode. |
| **Project** | A named initiative within an org that groups FCS assessments and carries context configuration. In V12, a project also provides context for PRCC assessments on repos linked to it. |
| **Repo→project link** | An explicit admin action that associates a registered repository with a project. Required before PRCC can be enabled on that repo. |
| **Assessment** | A generated set of comprehension questions with reference answers and weights. Same `assessments` row regardless of type (`prcc` or `fcs`). |
| **Rubric** | The fixed set of questions, weights, and reference answers generated before any participant sees the assessment. |
| **Participant** | A GitHub user who must answer an assessment. For PRCC: the PR author and required reviewers, assigned automatically by the webhook. |
| **Soft mode** | Enforcement level where all participants must answer relevantly, but no score threshold blocks the outcome. |
| **Hard mode** | Enforcement level where all participants must answer AND the aggregate score must meet a configurable threshold. |
| **Aggregate score** | The combined weighted score across all participants for an assessment. Individual scores are never surfaced separately. |
| **Check Run** | A GitHub Check Run on the PR. Carries PRCC status (in_progress, success, failure, neutral) and summary information. |
| **PRCC configuration** | The combination of: (a) a repo→project link, (b) PRCC enabled flag on the repo config, and (c) per-repo PRCC operational settings. |

---

## Design Principles / Constraints

1. **Project context for PRCC.** PRCC rubric generation uses the linked project's context (glob patterns, domain notes). There is no separate PRCC-specific context store. If the project has no context configured, rubric generation proceeds with no injected context.
2. **Repo→project link required for PRCC.** A repo cannot have PRCC enabled without being linked to a project. This ensures consistent URL structure and prevents navigation ambiguity that V11 experienced with mixed project/non-project URLs.
3. **Repo settings for PRCC operations.** Enforcement mode, score threshold, question count, minimum PR size, and exempt file patterns remain per-repo settings (as in V1). They are not inherited from the project.
4. **One project per repo.** A repo links to exactly one project at a time. Re-linking to a different project is allowed and takes effect for future assessments.
5. **Shared assessment engine.** PRCC and FCS use the same rubric generation, answer scoring, and aggregate calculation engine. The only difference is the trigger (webhook vs manual), the enforcement (Check Run gate vs retrospective), and the source of artefacts (single PR vs multiple merged PRs).
6. **No data migration.** Product is pre-production. No backward-compatibility for V1-spec PRCC flows that were never implemented.
7. **Small PRs.** Each story targets < 200 lines of change.

---

## Navigation Model

Navigation differs by role. V12 extends the V11 navigation model to include PRCC assessments.

### Org Admin / Repo Admin

After sign-in, admins land on their last-visited project or `/projects`.

```
NavBar: [FCS logo]  [Projects]  [Organisation]  [Org: Acme v]  [User v]

/projects                              ← All projects list
/projects/[id]                         ← Project dashboard — FCS + PRCC assessment list, "New FCS" entry point
/projects/[id]/settings                ← Project context & config
/projects/[id]/assessments/new         ← Create FCS assessment
/projects/[id]/assessments/[aid]       ← Assessment detail / answering form
/projects/[id]/assessments/[aid]/results
/projects/[id]/assessments/[aid]/submitted

/organisation                          ← Org settings: registered repos, repo→project links, per-repo PRCC config
/organisation/repos/[repoId]           ← Per-repo PRCC settings page
```

- `/organisation` — the org settings page gains a repos table with columns: repo name, linked project, PRCC status (enabled/disabled), and a link to per-repo settings.
- `/organisation/repos/[repoId]` — per-repo PRCC settings: enable/disable toggle, enforcement mode, threshold, question count, min PR size, exempt patterns. Also shows the current project link with a "Change project" action.
- PRCC assessments appear in the project dashboard assessment list alongside FCS assessments, distinguished by type label.

### Org Member

After sign-in, members land on `/assessments` (My Pending Assessments).

```
NavBar: [FCS logo]  [My Assessments]  [Org: Acme v]  [User v]

/assessments                           ← All pending assessments (FCS + PRCC), filterable by project and type
/projects/[id]/assessments/[aid]       ← Assessment detail (reached via list or invitation link)
/projects/[id]/assessments/[aid]/results
/projects/[id]/assessments/[aid]/submitted
```

- `/assessments` now includes both FCS and PRCC assessments where the user has a pending submission. PRCC items are labelled with type "PRCC" and the PR number. The project filter (Story 2.3a in V11) is extended with a type filter (FCS / PRCC / All).
- PRCC participants who are not org members (external contributors) reach assessments via the Check Run link only — they do not have a `/assessments` queue because they cannot sign in to the app.

### PRCC Participant (Check Run link)

A PR author or reviewer clicks the "Answer comprehension questions" link in the GitHub Check Run:

1. Link points to `/projects/[pid]/assessments/[aid]`.
2. If unauthenticated → GitHub OAuth sign-in → redirect back to the assessment URL.
3. If authenticated but not a participant → access denied.
4. If authenticated and a participant → answering form renders.
5. After submission → confirmation at `/projects/[pid]/assessments/[aid]/submitted`.

### Root redirect (extends V11 Story 4.4)

- **Org Admin / Repo Admin** with last-visited project → `/projects/[id]`.
- **Org Admin / Repo Admin** without last-visited → `/projects`.
- **Org Member** → `/assessments`.
- **Unauthenticated** → sign-in flow.

---

## Roles

| Role | Type | Description |
|------|------|-----------|
| **Org Admin** | Persistent | GitHub org admin/owner. Full access: create/edit/delete projects; link repos to projects; configure PRCC per repo; create FCS assessments; skip PRCC gates. |
| **Repo Admin** | Persistent | GitHub org member with admin access to at least one org repo. Can create/edit projects; link repos to projects (within their admin repos); configure PRCC on repos they admin; create FCS assessments. Cannot delete projects or skip PRCC gates. |
| **Org Member** | Persistent | GitHub org member (neither org admin nor repo admin). Can view and submit assessments they are invited to. Sees their pending queue at `/assessments`. No project or repo management access. |
| **Author** | Contextual | PR author in a PRCC assessment. Assigned automatically when a PR triggers PRCC. |
| **Reviewer** | Contextual | Required reviewer on a PR in a PRCC assessment. Assigned automatically. |

---

## Epic 1: PRCC Configuration [Priority: High]

Wires the repo→project link and per-repo PRCC settings into the existing organisation settings and project surfaces. Foundation for all PRCC behaviour in Epics 2–3.

**Rationale:** PRCC cannot trigger without a repo→project link and enabled flag. Configuration must be delivered first.

<a id="REQ-prcc-configuration-link-repo-to-project"></a>

### Story 1.1: Link a repo to a project

**As an** Org Admin or Repo Admin,
**I want to** link a registered repository to a project,
**so that** PRCC can be enabled on that repo and assessments generated from it use the project's context.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-configuration-enable-prcc-per-repo"></a>

### Story 1.2: Enable and configure PRCC on a repo

**As an** Org Admin or Repo Admin,
**I want to** enable PRCC on a project-linked repo and configure its operational settings,
**so that** PR events on that repo trigger comprehension assessments.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-configuration-view-repo-prcc-status"></a>

### Story 1.3: View repo PRCC status on organisation settings

**As an** Org Admin or Repo Admin,
**I want to** see all registered repos on the organisation settings page with their project link and PRCC status,
**so that** I can scan which repos have PRCC active and which projects they belong to.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-configuration-change-project-link"></a>

### Story 1.4: Change a repo's project link

**As an** Org Admin or Repo Admin,
**I want to** change which project a repo is linked to,
**so that** I can reorganise when a repo moves between teams or initiatives.

*(Acceptance criteria in next pass)*

---

## Epic 2: PRCC Webhook & Assessment Flow [Priority: High]

The core PRCC pipeline: webhook-triggered assessment creation, Check Run management, participant answering, relevance/scoring, gate enforcement, and PR update handling. Reuses the shared assessment engine (rubric generation, scoring, aggregate calculation) already built for FCS.

**Rationale:** Core product behaviour. Depends on Epic 1 (configuration).

<a id="REQ-prcc-webhook-and-assessment-flow-pr-event-detection"></a>

### Story 2.1: PR event detection via webhook

**As the** system,
**I want to** detect PR open, ready-for-review, and reviewer-change events on PRCC-enabled repos,
**so that** I can initiate, update, or skip comprehension assessments at the right time.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-webhook-and-assessment-flow-prcc-assessment-creation"></a>

### Story 2.2: PRCC assessment creation

**As the** system,
**I want to** create a PRCC assessment from the PR artefacts when a qualifying PR event is detected,
**so that** participants have questions to answer.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-webhook-and-assessment-flow-check-run-management"></a>

### Story 2.3: GitHub Check Run management

**As a** PR Author or Reviewer,
**I want to** see a GitHub Check Run on the PR showing the comprehension assessment status,
**so that** I know I need to answer questions and whether the gate has passed.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-webhook-and-assessment-flow-prcc-answering"></a>

### Story 2.4: PRCC assessment answering

**As a** PR Author or Reviewer,
**I want to** click the link from the GitHub Check Run and answer comprehension questions about the PR,
**so that** I demonstrate my understanding of the change.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-webhook-and-assessment-flow-relevance-validation"></a>

### Story 2.5: Relevance validation (Soft mode)

**As the** system,
**I want to** validate that PRCC answers are genuine attempts in Soft mode,
**so that** the gate has meaning even without a score threshold.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-webhook-and-assessment-flow-score-based-evaluation"></a>

### Story 2.6: Score-based evaluation (Hard mode)

**As the** system,
**I want to** score participant answers against the rubric in Hard mode and enforce the score threshold,
**so that** merge is blocked when aggregate comprehension is insufficient.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-webhook-and-assessment-flow-prcc-gate-skip"></a>

### Story 2.7: PRCC gate skip

**As an** Org Admin,
**I want to** skip the PRCC gate for a specific PR when justified,
**so that** emergency hotfixes or time-critical changes are not blocked.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-webhook-and-assessment-flow-pr-update-handling"></a>

### Story 2.8: PR update handling

**As the** system,
**I want to** handle new commits pushed to a PR under assessment,
**so that** the assessment reflects the current state of the PR and cannot be gamed.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-webhook-and-assessment-flow-llm-error-handling-prcc"></a>

### Story 2.9: LLM error handling for PRCC

**As the** system,
**I want to** handle LLM API failures during PRCC rubric generation and scoring without blocking the PR indefinitely,
**so that** the PR is not stuck in limbo when the LLM is unavailable.

*(Acceptance criteria in next pass)*

---

## Epic 3: PRCC Reporting & Visibility [Priority: Medium]

Result pages, organisation-level PRCC overview, and integration with the existing project dashboard and assessment queue.

**Rationale:** Users need to see PRCC outcomes. Depends on Epic 2.

<a id="REQ-prcc-reporting-and-visibility-prcc-results-page"></a>

### Story 3.1: PRCC assessment results page

**As a** PRCC participant or Org Admin,
**I want to** see the results of a completed PRCC assessment,
**so that** I understand the comprehension outcome for that PR.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-reporting-and-visibility-prcc-in-project-dashboard"></a>

### Story 3.2: PRCC assessments in the project dashboard

**As an** Org Admin or Repo Admin,
**I want to** see PRCC assessments alongside FCS assessments in the project dashboard,
**so that** all comprehension activity for the project is visible in one place.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-reporting-and-visibility-prcc-in-member-queue"></a>

### Story 3.3: PRCC assessments in My Pending Assessments

**As an** Org Member,
**I want to** see pending PRCC assessments where I am a participant in My Pending Assessments,
**so that** I can find and complete my PRCC assessments from the same queue as my FCS assessments.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-reporting-and-visibility-prcc-in-org-overview"></a>

### Story 3.4: PRCC assessments in organisation assessment overview

**As an** Org Admin,
**I want to** see PRCC assessments in the organisation-level assessment overview,
**so that** I can monitor PRCC activity across all repos.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-reporting-and-visibility-prcc-metadata-export"></a>

### Story 3.5: PR metadata export

**As an** Org Admin,
**I want** PRCC aggregate score and outcome stored in the Check Run summary in a machine-readable format,
**so that** external metrics systems can consume the data.

*(Acceptance criteria in next pass)*

---

## Cross-Cutting Concerns

### Security & Authorisation

- PRCC assessment creation is system-initiated (webhook), not user-initiated. The webhook handler authenticates via GitHub signature verification (existing pattern in `POST /api/webhooks/github`).
- PRCC gate skip is restricted to Org Admin only. Repo Admin cannot skip PRCC gates.
- Existing org-scoped RLS policies on `assessments`, `assessment_questions`, `assessment_participants`, and `participant_answers` extend to PRCC assessments without change.
- The Check Run link is the only access path for participants who cannot sign in to the app (external contributors). Access control validates the participant's GitHub identity against the assessment enrolment.

### Data Integrity

- A PRCC assessment always has `repository_id` (NOT NULL, same as today) and `project_id` set from the repo→project link at creation time.
- Repo→project link changes do not retroactively affect existing assessments. Each assessment captures its `project_id` at creation.
- PRCC rubric generation uses project context at the time of assessment creation. Context changes do not retroactively affect existing assessments.

### Context Resolution

- PRCC rubric generation reads project-level context (glob patterns, domain notes) from the project linked to the assessment's repo at creation time. Same resolution path as FCS (Story 3.2 in V11).
- Repo-level exempt file patterns are applied during artefact fetching. Files matching exempt patterns are excluded from the LLM prompt.
- PRCC question count comes from the repo-level setting (`repository_config.prcc_question_count`), not the project's FCS question count.

### Observability

- All PRCC webhook events logged with: event type, repository, PR number, action taken, and assessment ID (if created).
- Check Run state transitions logged: created → in_progress → completed (success/failure/neutral).
- LLM calls for PRCC rubric generation and scoring use the same structured logging as FCS.
- PRCC-specific metrics: webhook-to-assessment latency, assessment completion rate, skip rate, pass/fail rate per repo.

### Existing Artefacts Preserved

- The shared assessment engine (rubric generation, scoring, aggregate calculation) is unchanged. PRCC is a new consumer of the same engine.
- The existing `POST /api/webhooks/github` route gains PR event handling. Installation event handling is unchanged.
- The existing assessment answering form, results page, and assessment list components are extended to handle PRCC assessments — not duplicated.

---

## What We Are NOT Building

- **Repo-level PRCC context.** PRCC uses project context only. There is no separate "PRCC context" configuration on the repo. If the linked project has no context, PRCC proceeds without injected context.
- **PRCC without a project link.** A repo must be linked to a project before PRCC can be enabled. No project-less PRCC.
- **Multiple projects per repo.** A repo links to exactly one project. Multi-project repo membership is out of scope.
- **PR decorator (V1 Epic 7).** Exploratory reflection questions posted as PR comments. Deferred to a future version.
- **PRCC self-reassessment.** Unlike FCS (Story 3.6), PRCC is a gate — new commits trigger a new assessment, not a self-directed re-answer.
- **Branch protection integration.** PRCC gates via Check Run only. Required status check configuration in GitHub branch protection is the repo admin's responsibility, not an in-app feature.
- **PRCC on draft PRs.** PRCC triggers only when a PR is opened as ready or moved from draft to ready. Draft PRs are ignored.
- **Custom prompt templates per repo.** V12 uses the same fixed prompt templates as FCS (Naur's three layers). Customisable per-repo is a future enhancement.
- **PRCC for non-GitHub repos.** GitHub only, same as V1.
- **Repo→project bulk linking.** One repo at a time. Bulk operations deferred.

---

## Open Questions

| # | Question | Context | Options | Impact |
|---|----------|---------|---------|--------|
| 1 | Should PRCC require a project link, or should project-less PRCC (with code-only context) be allowed? | The current structure requires a project link. Allowing project-less PRCC would add URL ambiguity (`/assessments/[aid]` for project-less vs `/projects/[pid]/assessments/[aid]` for project-linked), which caused navigation issues in V11. | (a) Require project link — consistent URLs, simpler nav. (b) Allow project-less — more flexible but two URL shapes. | Determines whether `repositories.project_id` is nullable or NOT NULL for PRCC-enabled repos. |
| 2 | Should PRCC question count come from repo config or project config? | Currently specified as repo-level (`repository_config.prcc_question_count`). But the project already has `fcs_question_count` — should there be one question count per project regardless of assessment type? | (a) Repo-level PRCC count (current spec). (b) Single project-level question count for all assessment types. | Affects the settings surface and rubric generation parameter resolution. |
| 3 | Can a Repo Admin skip PRCC gates, or is that Org Admin only? | Currently specified as Org Admin only (Story 2.7). Repo Admins can configure PRCC but cannot skip gates. Consistent with project delete being Org Admin only (V11 Story 1.5). | (a) Org Admin only (current spec). (b) Repo Admin on repos they administer. | Affects skip UX and authorisation checks. |
| 4 | Should PRCC assessments appear in "My Pending Assessments" (`/assessments`) for Org Members, or only via Check Run links? | Currently specified as appearing in the queue (Story 3.3). The Check Run link is the primary call-to-action, but the queue provides a fallback discovery path. | (a) Both queue + Check Run link (current spec). (b) Check Run link only — no queue entry. | Affects the `/assessments` query and the member experience. |

---

## Next Steps

1. Address Open Questions via review comments.
2. Gate 1: validate epic structure, story organisation, and navigation model.
3. Write acceptance criteria (Step 4).
4. Gate 2: full document review.

---

*This document is an artefact that will be used in our own Feature Comprehension Score assessment.*
