# Feature Comprehension Score — V12 Requirements: PR Comprehension Check

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.3 |
| Status | Draft — Structure (Gate 1 review pending) |
| Author | LS / Claude |
| Created | 2026-05-02 |
| Last updated | 2026-05-03 (rev 3) |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-05-02 | LS / Claude | Initial structure draft |
| 0.2 | 2026-05-02 | LS / Claude | Gate 1 review: project link optional, PRCC question count from repo, Repo Admin can skip, queue clarified; resolved all 4 OQs |
| 0.3 | 2026-05-03 | LS / Claude | Gate 1 review pass: restored V1 contract gaps (artefact extraction, draft/min-size/exempt skip, trivial commit + debounce); flagged repo schema add (`repositories.project_id`); reworked Story 3.1 — full results visible to PRCC participants after completion (incl. reference answers); reworked Story 3.3 — unified My Assessments queue (FCS+PRCC, pending+completed); added Story 3.3a (admin access to My Assessments); added repo→project unlink to Story 1.4; revised V1 Story 3.4/6.1 reference-answer policy in Cross-Cutting Concerns; new `[Review]` markers for URL shape, external contributor auth, and artefact-extraction story split. |

---

## Context / Background

V1 specified PRCC (PR Comprehension Check) as a preventative quality gate: when a PR is opened on a PRCC-enabled repository, the system generates comprehension questions from the PR artefacts, participants answer via the web app, and a GitHub Check Run passes or fails based on the configured enforcement mode. Nine stories were written (Epic 2 in V1).

V11 introduced Projects as the organising layer for FCS assessments and explicitly deferred PRCC product features. The only PRCC-related change in V11 was a nullable `project_id` FK on the `assessments` table — foundation work to avoid future schema migration. PRCC webhook handling, Check Run management, and the answering/scoring flow were not implemented.

V12 implements PRCC end-to-end, adapted for the V11 project model. PRCC can be enabled on any registered repo, with or without a project link. If the repo is linked to a project, the project's rubric-generation context (glob patterns, domain notes) is used for PRCC assessments — the same context used for FCS assessments in that project. If the repo is not linked to a project, rubric generation proceeds with code-only context. PRCC operational settings (enforcement mode, score threshold, question count, minimum PR size, exempt file patterns) remain at the repo level. PRCC question count is independent of the project's FCS question count — a project might use 8 questions for FCS while a linked repo uses 3 for PRCC.

This is a clean-sheet document. It does not re-state the V1 PRCC stories verbatim; it re-specifies them for the post-V11 architecture.

---

## Glossary

| Term | Definition |
|------|-----------|
| **PRCC** | PR Comprehension Check — a preventative quality gate triggered by PR events on enabled repos. Generates comprehension questions, collects participant answers, and updates a GitHub Check Run to pass or fail based on enforcement mode. |
| **Project** | A named initiative within an org that groups FCS assessments and carries context configuration. In V12, a project also provides context for PRCC assessments on repos linked to it. |
| **Repo→project link** | An optional admin action that associates a registered repository with a project. When set, PRCC assessments on that repo use the project's context for rubric generation. |
| **Assessment** | A generated set of comprehension questions with reference answers and weights. Same `assessments` row regardless of type (`prcc` or `fcs`). |
| **Rubric** | The fixed set of questions, weights, and reference answers generated before any participant sees the assessment. |
| **Participant** | A GitHub user who must answer an assessment. For PRCC: the PR author and required reviewers, assigned automatically by the webhook. |
| **Soft mode** | Enforcement level where all participants must answer relevantly, but no score threshold blocks the outcome. |
| **Hard mode** | Enforcement level where all participants must answer AND the aggregate score must meet a configurable threshold. |
| **Aggregate score** | The combined weighted score across all participants for an assessment. Individual scores are never surfaced separately. |
| **Check Run** | A GitHub Check Run on the PR. Carries PRCC status (in_progress, success, failure, neutral) and summary information. |
| **PRCC configuration** | The combination of: (a) a PRCC enabled flag on the repo config, (b) per-repo PRCC operational settings (enforcement mode, threshold, question count, min PR size, exempt patterns), and (c) an optional repo→project link for context. |
| **My Assessments** | A cross-project, cross-type queue showing all assessments where the signed-in user is enrolled as a participant — both FCS and PRCC, both pending and completed. Replaces V11's "My Pending Assessments". Filterable by project, type, and status. |
| **Self-directed results view** | The participant's view of a completed assessment, showing the full rubric (questions + reference answers), their own submitted answers, their own per-question scores, and the team aggregate. Other participants' individual scores are never shown. Applies to both PRCC and FCS — see Cross-Cutting Concerns §Reference answer visibility. |

---

## Design Principles / Constraints

1. **Project context for PRCC.** PRCC rubric generation uses the linked project's context (glob patterns, domain notes). There is no separate PRCC-specific context store. If the project has no context configured, rubric generation proceeds with no injected context.
2. **Repo→project link optional.** A repo can have PRCC enabled with or without a project link. If linked, PRCC uses the project's context for rubric generation. If not linked, PRCC proceeds with code-only context (plus repo-level exempt file patterns). Two assessment URL shapes exist (`/projects/[pid]/assessments/[aid]` for project-linked, `/assessments/[aid]` for unlinked) — both are explicitly documented and the shape is determined by the data, not the user's role.
3. **Repo settings for PRCC operations.** Enforcement mode, score threshold, question count, minimum PR size, and exempt file patterns remain per-repo settings (as in V1). They are not inherited from the project.
4. **One project per repo.** A repo links to exactly one project at a time. Re-linking to a different project is allowed and takes effect for future assessments.
5. **Shared assessment engine.** PRCC and FCS use the same rubric generation, answer scoring, and aggregate calculation engine. The only difference is the trigger (webhook vs manual), the enforcement (Check Run gate vs retrospective), and the source of artefacts (single PR vs multiple merged PRs).
6. **No data migration.** Product is pre-production. No backward-compatibility for V1-spec PRCC flows that were never implemented.
7. **Small PRs.** Each story targets < 200 lines of change.
8. **Reference answers as a learning surface (revision of V1).** Once an assessment is fully complete (all participants submitted, scoring finalised, Check Run conclusion set), the rubric — questions, reference answers, and the participant's own scored answers — becomes visible to that participant. Applies to both PRCC and FCS. Rationale: in an AI-augmented team where a single human reviewer is increasingly common, the line between "answer leakage" and "Theory Building" has thinned. The reference answer is the most concentrated artefact of design intent; withholding it from people who already passed (or failed) the assessment removes the strongest learning moment. The Check Run remains the audit surface; this view is the learning surface. Other participants' individual scores remain private.

> **[Review]:** This principle revises V1 Story 3.4 (FCS self-view: reference answers NOT shown) and V1 Story 6.1 (PRCC results page: reference answers NOT shown — "prevents answer sharing on future PRs"). Cross-PR reuse is still possible — same person, same repo, similar question shapes. If you want a softer revision: (a) keep reference answers hidden in PRCC only, show them in FCS only (preserves V1 PRCC stance); (b) gate by mode — show reference answers only after an admin "publishes results"; (c) accept the revision as written. Default below assumes (c).

---

## Navigation Model

Navigation differs by role. V12 extends the V11 navigation model to include PRCC assessments.

### Org Admin / Repo Admin

After sign-in, admins land on their last-visited project or `/projects`.

```
NavBar: [FCS logo]  [Projects]  [My Assessments]  [Organisation]  [Org: Acme v]  [User v]

/projects                              ← All projects list
/projects/[id]                         ← Project dashboard — FCS + PRCC assessments (for linked repos)
/projects/[id]/settings                ← Project context & config
/projects/[id]/assessments/new         ← Create FCS assessment
/projects/[id]/assessments/[aid]       ← Assessment detail (when assessment has a project)
/projects/[id]/assessments/[aid]/results
/projects/[id]/assessments/[aid]/submitted

/assessments                           ← My Assessments — admin's own participation queue (FCS+PRCC, pending+completed). See Story 3.3a.
/assessments/[aid]                     ← Assessment detail (when assessment has no project — PRCC only)
/assessments/[aid]/results
/assessments/[aid]/submitted

/organisation                          ← Org settings: registered repos, PRCC config, repo→project links
/organisation/repos/[repoId]           ← Per-repo PRCC settings page
```

> **[Review]:** Two URL shapes for assessment detail (`/projects/[pid]/assessments/[aid]` for project-linked, `/assessments/[aid]` for unlinked PRCC) is a deliberate choice with trade-offs. V11 Story 4.5 AC4 explicitly returned 404 for `/assessments/[aid]` — V12 brings that shape back. Three live alternatives:
> - **(a) Two URL shapes (current draft)** — route resolves by data shape. Simple but loses the V11 invariant.
> - **(b) Mandatory repo→project link for PRCC** — collapses to one URL shape. Loses the "PRCC without project" use case in Design Principle 2; every repo with PRCC must first be linked.
> - **(c) Different prefix for unlinked PRCC** — e.g. `/repos/[rid]/prcc/[aid]`. Three URL patterns total but each pattern means exactly one thing.

- `/organisation` — the org settings page gains a repos table with columns: repo name, linked project (or "—"), PRCC status (enabled/disabled), and a link to per-repo settings.
- `/organisation/repos/[repoId]` — per-repo PRCC settings: enable/disable toggle, enforcement mode, threshold, question count, min PR size, exempt patterns. Also shows the current project link (if any) with a "Link to project" or "Change project" action.
- PRCC assessments that have a project appear in the project dashboard alongside FCS assessments, distinguished by type label.
- PRCC assessments without a project appear on the org-level assessment overview (Story 3.4) but not in any project dashboard.

### Org Member

After sign-in, members land on `/assessments` (My Assessments — see Story 3.3 for the unified queue).

```
NavBar: [FCS logo]  [My Assessments]  [Org: Acme v]  [User v]

/assessments                           ← Unified queue (FCS + PRCC, pending + completed), filterable by project, type, status
/projects/[id]/assessments/[aid]       ← Assessment detail (when assessment has a project)
/projects/[id]/assessments/[aid]/results
/projects/[id]/assessments/[aid]/submitted
/assessments/[aid]                     ← Assessment detail (when assessment has no project — PRCC only)
/assessments/[aid]/results
/assessments/[aid]/submitted
```

- `/assessments` includes both FCS and PRCC assessments where the user is enrolled as a participant. The list shows both pending and completed items. Filters: project (from V11 Story 2.3a), type (FCS / PRCC / All), status (Pending / Completed / All). Completed items show outcome and aggregate score and link through to the results page.
- PRCC participants who are not org members (external contributors) reach assessments via the Check Run link only. See Cross-Cutting Concerns §Security & Authorisation for the sign-in question.

### PRCC Participant (Check Run link)

A PR author or reviewer clicks the "Answer comprehension questions" link in the GitHub Check Run:

1. If the assessment has a project: link points to `/projects/[pid]/assessments/[aid]`.
2. If the assessment has no project: link points to `/assessments/[aid]`.
3. If unauthenticated → GitHub OAuth sign-in → redirect back to the assessment URL.
4. If authenticated but not a participant → access denied.
5. If authenticated and a participant → answering form renders.
6. After submission → confirmation at the same URL base + `/submitted`.

The URL shape is determined by whether the assessment has a `project_id` — not by user role. Both shapes are valid and the route handler resolves the correct assessment regardless.

### Root redirect (extends V11 Story 4.4)

- **Org Admin / Repo Admin** with last-visited project → `/projects/[id]`.
- **Org Admin / Repo Admin** without last-visited → `/projects`.
- **Org Member** → `/assessments`.
- **Unauthenticated** → sign-in flow.

---

## Roles

| Role | Type | Description |
|------|------|-----------|
| **Org Admin** | Persistent | GitHub org admin/owner. Full access: create/edit/delete projects; link repos to projects; configure PRCC per repo; create FCS assessments; skip PRCC gates on any repo. |
| **Repo Admin** | Persistent | GitHub org member with admin access to at least one org repo. Can create/edit projects; link repos to projects (within their admin repos); configure PRCC on repos they admin; create FCS assessments; skip PRCC gates on repos they administer. Cannot delete projects. |
| **Org Member** | Persistent | GitHub org member (neither org admin nor repo admin). Can view and submit assessments they are invited to. Sees their pending queue at `/assessments`. No project or repo management access. |
| **Author** | Contextual | PR author in a PRCC assessment. Assigned automatically when a PR triggers PRCC. |
| **Reviewer** | Contextual | Required reviewer on a PR in a PRCC assessment. Assigned automatically. |

---

## Epic 1: PRCC Configuration [Priority: High]

Wires the repo→project link (optional) and per-repo PRCC settings into the existing organisation settings and project surfaces. Foundation for all PRCC behaviour in Epics 2–3.

**Rationale:** PRCC cannot trigger without being enabled on a repo. Configuration must be delivered first.

> **Schema state (verified 2026-05-03):** `repository_config` already has all PRCC operational columns (`prcc_enabled`, `enforcement_mode`, `score_threshold`, `prcc_question_count`, `min_pr_size`, `trivial_commit_threshold`, `exempt_file_patterns`). `assessments` already has `pr_number`, `pr_head_sha`, `check_run_id`, `skip_reason/skipped_by/skipped_at`, `superseded_by`, and the `assessments_fcs_requires_project` constraint that already permits `project_id IS NULL` for PRCC. `sync_debounce` table already exists. **One new column is needed: `repositories.project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL`** — V11 said this would land but it did not. Story 1.1 covers the add.

<a id="REQ-prcc-configuration-link-repo-to-project"></a>

### Story 1.1: Link a repo to a project (optional)

**As an** Org Admin or Repo Admin,
**I want to** optionally link a registered repository to a project,
**so that** PRCC assessments on that repo use the project's context for rubric generation.

*(Acceptance criteria in next pass)*

> **Schema work:** This story includes adding `repositories.project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL`. V11 docs said this column would be the foundation work but it was not landed. Story 1.1 owns both the column add and the link UI.

---

<a id="REQ-prcc-configuration-enable-prcc-per-repo"></a>

### Story 1.2: Enable and configure PRCC on a repo

**As an** Org Admin or Repo Admin,
**I want to** enable PRCC on a registered repo (with or without a project link) and configure its operational settings,
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

### Story 1.4: Change or remove a repo's project link

**As an** Org Admin or Repo Admin,
**I want to** change a repo's project link to a different project, or remove the link entirely,
**so that** I can reorganise when a repo moves between teams, or run PRCC on a repo without project context.

*(Acceptance criteria in next pass)*

> **Note:** "Remove" sets `repositories.project_id` to NULL — the repo continues to have PRCC enabled (if previously enabled) but rubric generation falls back to code-only context per Design Principle 2. Existing assessments retain the `project_id` they were created with (Cross-Cutting Concerns §Data Integrity).

---

## Epic 2: PRCC Webhook & Assessment Flow [Priority: High]

The core PRCC pipeline: webhook-triggered assessment creation, Check Run management, participant answering, relevance/scoring, gate enforcement, and PR update handling. Reuses the shared assessment engine (rubric generation, scoring, aggregate calculation) already built for FCS.

**Rationale:** Core product behaviour. Depends on Epic 1 (configuration).

<a id="REQ-prcc-webhook-and-assessment-flow-pr-event-detection"></a>

### Story 2.1: PR event detection via webhook

**As the** system,
**I want to** detect PR lifecycle events on PRCC-enabled repos and decide whether to initiate, update, or skip a comprehension assessment,
**so that** assessments are created at the right time and skipped predictably for cases that do not warrant comprehension review.

*(Acceptance criteria in next pass — see Notes below for the V1 contract this story must preserve.)*

> **V1 contract to preserve (carried forward from V1 Story 2.1):**
> - **Triggers (assessment created):** PR opened (when not draft), PR moved from draft to ready-for-review, required reviewer added to a PR that already has an assessment (existing assessment is updated to include the new participant — same questions).
> - **Trigger (participant removed):** required reviewer removed → participant removed from the assessment, their existing responses soft-deleted.
> - **Skip — neutral conclusion:** PR is below `min_pr_size` (line count) — Check Run set to `neutral` with explanation.
> - **Skip — neutral conclusion:** all changed files match `exempt_file_patterns` — Check Run set to `neutral` with explanation.
> - **Skip — no Check Run:** PR is in draft state. PRCC re-evaluates on draft→ready transition.
> - **PRCC disabled on the repo:** event acknowledged, no assessment created, no Check Run.

---

<a id="REQ-prcc-webhook-and-assessment-flow-prcc-assessment-creation"></a>

### Story 2.2: PRCC assessment creation

**As the** system,
**I want to** create a PRCC assessment from the PR artefacts when a qualifying PR event is detected,
**so that** participants have questions to answer.

*(Acceptance criteria in next pass)*

> **[Review]:** V1 Story 2.2 was a dedicated "PR Artefact Extraction" story covering: which artefacts are pulled (diff, full file content, PR title/description, linked issues, test files), what to do when the PR has > 50 changed files (focus on most substantive by lines changed up to a token limit), and the "thin artefacts → thin questions" contract. V12 currently bundles all of this into Story 2.2. Two options:
> - **(a) Keep bundled** — write the artefact-extraction contract as ACs on Story 2.2 (questions, file selection rule, token limits, thin-artefact behaviour). One bigger story, one PR.
> - **(b) Split out Story 2.2a "PRCC artefact extraction"** — mirrors V1 2.2 verbatim. Two smaller stories, two PRs, easier to test extraction in isolation.
> Recommend (b) if the extraction logic differs meaningfully from FCS extraction (which today reads multiple merged PRs); recommend (a) if extraction is genuinely shared and PRCC just supplies different inputs.

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

**As an** Org Admin or Repo Admin,
**I want to** skip the PRCC gate for a specific PR when justified,
**so that** emergency hotfixes or time-critical changes are not blocked.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-webhook-and-assessment-flow-pr-update-handling"></a>

### Story 2.8: PR update handling

**As the** system,
**I want to** handle new commits pushed to a PR under assessment, with debounce and a trivial-commit exception,
**so that** the assessment reflects the current state of the PR, cannot be gamed by answer-then-push, and does not punish minor fixes.

*(Acceptance criteria in next pass — see Notes below for the V1 contract this story must preserve.)*

> **V1 contract to preserve (carried forward from V1 Story 2.8 — schema already supports this via `sync_debounce` table and `repository_config.trivial_commit_threshold`):**
> - **In-progress + new commits → invalidate + regenerate.** If a PR has an in-progress assessment (not all participants answered) and new non-trivial commits arrive, the existing assessment is invalidated (`status = invalidated`, `superseded_by` set) and a new assessment is generated. Participants who already answered must answer again.
> - **Completed + new commits → new assessment, history retained.** If a PR has a completed assessment and new non-trivial commits arrive, a new assessment is generated; the previous assessment is retained for history (linked via `superseded_by`).
> - **No commits → status unchanged.** A completed, passed assessment with no further commits stays `success`.
> - **60-second debounce.** Multiple commits within 60s collapse to a single regeneration (existing `sync_debounce` table).
> - **Trivial commit exception.** Pushes that change ≤ `trivial_commit_threshold` lines (default 5) or only modify documentation/comments do NOT invalidate the existing assessment. Heuristic is configurable per repo.
> - **UX notice in answering form.** "Finish your PR before requesting review — new commits will require a new assessment."

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
**I want to** see the full results of a completed PRCC assessment — including the rubric, my own answers and scores, and the team aggregate — as a Naur Theory Building learning surface,
**so that** I close the loop on what I demonstrated I understood and what the artefacts intended.

*(Acceptance criteria in next pass — see Notes below for the visibility contract.)*

> **Visibility contract (revises V1 Story 6.1):**
> - **Visible to: a participant viewing their own completed assessment** — questions, reference answers, weights, the participant's own submitted answers, the participant's own per-question scores, the team aggregate score, the outcome (Passed/Failed/Skipped), and the enforcement mode/threshold context.
> - **Visible to: Org Admins / Repo Admins viewing the same assessment** — everything above except other participants' submitted answers and per-participant scores. Admins see the rubric (questions + reference answers), the team aggregate, the outcome, and any skip metadata.
> - **Never visible to anyone:** another participant's individual score or their submitted answer text. Per-question aggregate (across all participants) is shown, attribution is not.
> - **Available only after completion** — `status = completed`, all participants either submitted or marked `did_not_participate`, and scoring finalised. While in-progress, the page shows progress only.
> - **Skipped assessments** show outcome + skip reason + skipped-by + skipped-at; no rubric content (rubric may not have been generated).
>
> **[Review]:** This is the principal V1 reversal. V1 Story 6.1 explicitly forbade reference answers on PRCC results pages "to prevent answer sharing on future PRs". See Design Principle 8 for the rationale and softer-revision options.

---

<a id="REQ-prcc-reporting-and-visibility-prcc-in-project-dashboard"></a>

### Story 3.2: PRCC assessments in the project dashboard

**As an** Org Admin or Repo Admin,
**I want to** see PRCC assessments alongside FCS assessments in the project dashboard,
**so that** all comprehension activity for the project is visible in one place.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-reporting-and-visibility-unified-my-assessments"></a>

### Story 3.3: Unified My Assessments queue (FCS + PRCC, pending + completed)

**As any** authenticated user enrolled as a participant on at least one assessment,
**I want to** see all my assessments — FCS and PRCC, pending and completed — in a single queue with filters,
**so that** I have one destination for everything I am responsible for, and a single place to revisit completed assessments for learning.

*(Acceptance criteria in next pass — see Notes below for the queue contract.)*

> **Queue contract (extends V11 Story 2.3 / 2.3a):**
> - **Items shown:** every assessment where the signed-in user is enrolled as a participant, regardless of type (FCS or PRCC) or status (pending, submitted, completed). Excludes assessments where the user was removed (`status = removed`) and assessments superseded by a regeneration (only the latest in a `superseded_by` chain appears).
> - **Each row shows:** type label (FCS/PRCC), project name (if any), repo + PR# (PRCC) or feature name (FCS), the user's own status (Pending / Submitted / Completed), the team outcome (only when the assessment is fully complete: Passed / Failed / Skipped + aggregate score), and a link to the appropriate detail or results page.
> - **Filters:** project (V11 Story 2.3a, retained), type (FCS / PRCC / All), status (Pending / Submitted / Completed / All). Default view: Pending.
> - **Empty states:** distinct empty states for "no pending" and "no items at all".
> - **PRCC items without a project link** show "—" or "(no project)" in the project column. Type/status filters still apply.

> **Renames V11's "My Pending Assessments" → "My Assessments".** Glossary updated. The pending-only V11 view becomes the default filter on the unified queue, not a separate page.

---

<a id="REQ-prcc-reporting-and-visibility-admin-access-my-assessments"></a>

### Story 3.3a: Admin access to My Assessments

**As an** Org Admin or Repo Admin who is also a participant on a PRCC or FCS assessment (e.g. PR author, required reviewer, nominated reviewer),
**I want to** access `/assessments` and see my own participation queue,
**so that** I can discover and complete my own assessments without relying on the GitHub Check Run alone, and revisit my completed assessments alongside non-admin teammates.

*(Acceptance criteria in next pass — see Notes below.)*

> **Notes:**
> - The NavBar gains a "My Assessments" link for admins (alongside Projects and Organisation). See Navigation Model.
> - The queue at `/assessments` is exactly the same query for admins and members: scoped to the signed-in user's participations. An admin who happens to be a participant on zero assessments sees the empty state, not an admin-wide list.
> - A combined "all assessments in the org" admin view is Story 3.4 (org-level overview), not this story. Story 3.3a is the admin's own participation queue.
> - This story closes the V12-rev-2 gap where admins had no in-app discovery path for their own PRCC assignments.

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
- PRCC gate skip is available to Org Admin (any repo) and Repo Admin (repos they administer).
- Existing org-scoped RLS policies on `assessments`, `assessment_questions`, `assessment_participants`, and `participant_answers` extend to PRCC assessments without change.
- The Check Run link is the primary access path for participants. Org members also discover assessments via `/assessments` (Story 3.3 / 3.3a).

> **[Review]: External contributor sign-in.** V1 Story 5.1 + ADR-0020 scoped GitHub OAuth to org members (sign-in succeeds only when the user belongs to an installed-app org). PRCC's participant pool can include external contributors (PR authors who are not org members). Three options:
> - **(a) PRCC is org-members-only.** External-contributor PRs simply do not enrol the author as a PRCC participant; required reviewers (always org members in practice) still answer; the PR is gated on reviewer answers only. Simplest. Forfeits the author's perspective.
> - **(b) Limited-purpose sign-in for assessment URLs.** A non-org-member who arrives at `/assessments/[aid]` can authenticate via GitHub OAuth and gain access *only* to the specific assessments where their `github_user_id` matches an `assessment_participants` row. They never see `/projects`, `/organisation`, or any other org data. Requires a new auth path.
> - **(c) GitHub App impersonation token.** The Check Run link carries a short-lived signed token that grants single-assessment access without GitHub OAuth. No GitHub session needed. New ADR territory; more complex but cleanest UX.
> Recommend (a) for V12 if the partner customer's PRCC use cases all involve org-member authors; (b) if external contributors are routine and a per-assessment sign-in is acceptable; (c) only if (a) is too restrictive and (b) creates friction.

### Data Integrity

- A PRCC assessment always has `repository_id` (NOT NULL, same as today). `project_id` is set from the repo→project link at creation time if the repo is linked to a project; otherwise it is NULL.
- Repo→project link changes do not retroactively affect existing assessments. Each assessment captures its `project_id` at creation.
- PRCC rubric generation uses project context at the time of assessment creation if a project is linked. Context changes do not retroactively affect existing assessments.

### Context Resolution

- PRCC rubric generation reads project-level context (glob patterns, domain notes) from the project linked to the assessment's repo at creation time. Same resolution path as FCS (Story 3.2 in V11). If no project is linked, rubric generation proceeds with no injected context (code-only).
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

### Reference Answer Visibility (revises V1 Story 3.4 and 6.1)

- **PRCC and FCS are aligned.** Once an assessment reaches `status = completed` (all participants either submitted or marked `did_not_participate`, scoring finalised), the rubric — questions, reference answers, weights — becomes visible on the results page to: (a) every participant on that assessment, viewing their own scored answers alongside; (b) Org Admins / Repo Admins, without other participants' submitted answer text or per-participant scores.
- **Rationale (Naur Theory Building).** The reference answer is the most concentrated artefact of design intent the rubric produces. Withholding it from the people who already engaged with the questions removes the strongest learning moment. The Check Run remains the audit/team surface; the in-app results page is the learning surface.
- **What is still private.** Per-participant individual scores remain visible only to the participant themselves. Other participants' submitted answer text is never shown.
- **V1 lines this revises.** V1 Story 3.4 ("Reference answers are **not** shown in the self-view"); V1 Story 6.1 ("the questions (reference answers NOT shown for PRCC — prevents answer sharing on future PRs)"). See Design Principle 8 for trade-offs.

---

## What We Are NOT Building

- **Repo-level PRCC context.** PRCC uses the linked project's context if a project link exists. There is no separate "PRCC context" configuration on the repo independent of the project. If no project is linked (or the linked project has no context), PRCC proceeds without injected context.
- **Multiple projects per repo.** A repo links to exactly one project. Multi-project repo membership is out of scope.
- **PR decorator (V1 Epic 7).** Exploratory reflection questions posted as PR comments. Deferred to a future version.
- **PRCC self-reassessment.** Unlike FCS (Story 3.6), PRCC is a gate — new commits trigger a new assessment, not a self-directed re-answer.
- **Per-participant individual scores visible to others.** A participant sees their own scored answers; nobody sees another participant's per-question score or submitted answer text. Only the team aggregate is shared.
- **Branch protection integration.** PRCC gates via Check Run only. Required status check configuration in GitHub branch protection is the repo admin's responsibility, not an in-app feature.
- **PRCC on draft PRs.** PRCC triggers only when a PR is opened as ready or moved from draft to ready. Draft PRs are ignored.
- **Custom prompt templates per repo.** V12 uses the same fixed prompt templates as FCS (Naur's three layers). Customisable per-repo is a future enhancement.
- **PRCC for non-GitHub repos.** GitHub only, same as V1.
- **Repo→project bulk linking.** One repo at a time. Bulk operations deferred.

---

## Open Questions

| # | Question | Context | Options | Impact |
|---|----------|---------|---------|--------|
| 1 | **Resolved.** Project link is optional. PRCC can be enabled on any registered repo with or without a project link. If linked, the project's context is used; if not, code-only context. Two URL shapes exist (`/projects/[pid]/assessments/[aid]` for linked, `/assessments/[aid]` for unlinked) — both documented in the Navigation Model. | — | — | — |
| 2 | **Resolved.** PRCC question count comes from repo config (`repository_config.prcc_question_count`). It is independent of the project's FCS question count. A project might use 8 questions for FCS while a linked repo uses 3 for PRCC — different use cases, different volumes. | — | — | — |
| 3 | **Resolved.** Repo Admin can skip PRCC gates on repos they administer. Org Admin can skip on any repo. Updated Story 2.7 and Roles table accordingly. | — | — | — |
| 4 | **Resolved (rev 2), then revised (rev 3).** Originally: queue is pending-only. Revised: `/assessments` is now a unified queue of FCS+PRCC, pending+completed, filterable by project/type/status. Completed items show outcome and aggregate score. Admins also have access (Story 3.3a). External contributor sign-in is now a separate open question — see OQ 7. | — | — | — |
| 5 | **Resolved (rev 3).** PRCC participants see the full rubric (questions, reference answers, weights), their own submitted answers, and their own per-question scores once an assessment is `completed`. Same policy applies to FCS. Other participants' individual scores remain private. Revises V1 Story 3.4 and V1 Story 6.1. Rationale: Naur Theory Building learning surface; AI-era reality of solo human reviewer. See Design Principle 8 for trade-offs and softer-revision options. | — | — | — |
| 6 | **Open.** URL shape for unlinked PRCC assessments. V11 Story 4.5 AC4 returned 404 for `/assessments/[aid]`; V12 brings that shape back as the canonical URL for assessments with no project link. Options on the Navigation Model `[Review]` marker: (a) two URL shapes, (b) mandatory repo→project link for PRCC, (c) different prefix (`/repos/[rid]/prcc/[aid]`). | URL routing and deep-link compatibility | (a) two shapes; (b) link mandatory; (c) different prefix | Routing complexity, V11 invariant, deep-link stability |
| 7 | **Open.** External contributor sign-in. Today's OAuth scope (V1 Story 5.1, ADR-0020) only admits org members. PRCC PR authors may be external contributors. Options on the Cross-Cutting Concerns `[Review]` marker: (a) PRCC is org-members-only (drop external authors as participants), (b) limited-purpose sign-in scoped to specific assessment URLs, (c) signed-token Check Run link with no OAuth required. | Auth scope, ADR-0020, who counts as a participant | (a) org-only; (b) limited sign-in; (c) signed token | Author perspective coverage, auth complexity, new ADR likely |
| 8 | **Open.** Artefact-extraction story split. V1 had a dedicated Story 2.2 for PR artefact extraction; V12 currently bundles it into Story 2.2 (assessment creation). Options on Story 2.2 `[Review]` marker: (a) keep bundled and write extraction as ACs of 2.2, (b) split out Story 2.2a "PRCC artefact extraction". | Story sizing, testability, V1 contract preservation | (a) bundle; (b) split | PR sizing, single-PR target (< 200 lines) |

---

## Next Steps

1. Address `[Review]` markers (Design Principle 8, Navigation Model URL shape, Story 2.2 artefact extraction split, Cross-Cutting external-contributor sign-in) and Open Questions 6–8 via review comments.
2. Gate 1: validate epic structure, story organisation, navigation model, and the visibility revision (DP 8).
3. Write acceptance criteria (Step 4) — including the V1-contract notes captured under Stories 2.1, 2.8, and the visibility contract under Story 3.1.
4. Gate 2: full document review.

---

*This document is an artefact that will be used in our own Feature Comprehension Score assessment.*
