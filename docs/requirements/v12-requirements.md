# Feature Comprehension Score — V12 Requirements: PR Comprehension Check

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.7 |
| Status | Draft — Complete (ACs written; pending Gate 2 testability validation) |
| Author | LS / Claude |
| Created | 2026-05-02 |
| Last updated | 2026-05-04 (rev 7) |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-05-02 | LS / Claude | Initial structure draft |
| 0.2 | 2026-05-02 | LS / Claude | Gate 1 review: project link optional, question count from repo, Repo Admin can skip, queue clarified; resolved OQs 1–4. |
| 0.3 | 2026-05-03 | LS / Claude | Restored V1 contract gaps (artefact extraction, skip rules, debounce). Reworked Story 3.1 (full results visible after completion), Story 3.3 (unified queue), added Story 3.3a, repo→project unlink in Story 1.4, reference-answer policy revision (DP 9). |
| 0.4 | 2026-05-04 | LS / Claude | Resolved 6 pre-Epic `[Review]` comments. New DP 3 (single URL shape per type) closes OQ 6. Repos table = existing tab extension. External Contributor added to Roles. |
| 0.5 | 2026-05-04 | LS / Claude | Resolved 14 epic-pass review comments. Major: unified `[skip-prcc]` model in Story 2.7 (replaces V1 auto-skip rules); Story 2.8 rewritten (5-min configurable debounce, marker on push, answers retained on invalidation); Story 2.3 Check Run display contract; Story 3.4 access matrix; Story 3.3a as NavBar-only wiring. Resolved OQs 7, 8. New OQs 9–11 raised. |
| 0.6 | 2026-05-04 | LS / Claude | Resolved OQs 9, 10, 11 from review feedback. Skip token = `[skip-prcc]` only; trigger = open/ready (merge-time deferred); retroactive skip = both paths supported. New contract item: `[skip-prcc]` during debounce cancels regeneration. No `partial_skip` flag — submission counts convey state. Trimmed: collapsed resolved OQ table to one-liner log; removed stale `[Review]` blocks; compressed trigger-model fork section after decision; tightened Story 2.7 / 2.8 contract wording. |
| 0.7 | 2026-05-04 | LS / Claude | Acceptance criteria for all 20 stories (Step 4). Given/When/Then for each, drawn from the per-story contract notes (Story 2.1 trigger rules, Story 2.3 Check Run table, Story 2.7 §Skip semantics, Story 2.8 PR-update contract, Story 3.1 visibility contract, Story 3.4 access matrix). |

---

## Context / Background

V1 specified PRCC (PR Comprehension Check) as a preventative quality gate: when a PR is opened on a PRCC-enabled repository, the system generates comprehension questions from the PR artefacts, participants answer via the web app, and a GitHub Check Run passes or fails based on the configured enforcement mode. Nine stories were written (Epic 2 in V1).

V11 introduced Projects as the organising layer for FCS assessments and explicitly deferred PRCC product features. The only PRCC-related change in V11 was a nullable `project_id` FK on the `assessments` table — foundation work to avoid future schema migration. PRCC webhook handling, Check Run management, and the answering/scoring flow were not implemented.

V12 implements PRCC end-to-end, adapted for the V11 project model. PRCC can be enabled on any registered repo, with or without a project link. If the repo is linked to a project, the project's rubric-generation context (glob patterns, domain notes) is used for PRCC assessments — the same context used for FCS assessments in that project. If the repo is not linked to a project, rubric generation proceeds with code-only context. All PRCC operational settings — enforcement mode, score threshold, question count, minimum PR size, exempt file patterns — live together on the repo (existing `repository_config` columns; see Epic 1 schema note). The project link is a context source, not a settings override.

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
2. **Repo→project link optional, used as context source only.** A repo can have PRCC enabled with or without a project link. The link is a pointer to the project whose context (glob patterns, domain notes) feeds PRCC rubric generation. If not linked, PRCC proceeds with code-only context (plus repo-level exempt patterns). The link does not affect the URL of the resulting assessment, does not move the assessment "into" the project's URL hierarchy, and does not override any repo-level operational setting. Repo-level context (when a repo wants its own context independent of any project) is a future enhancement — see "What We Are NOT Building".
3. **One URL shape per assessment type.** PRCC assessments are always reachable at `/assessments/[aid]`. FCS assessments are reachable at `/projects/[pid]/assessments/[aid]` (V11 — FCS requires a project). The PRCC `aid` carries the project link as a property of the row, so the URL does not need to embed `pid`. This restores the V11 invariant (one URL per assessment type) and removes the dual-shape ambiguity from rev 2.
4. **Repo settings for PRCC operations.** Enforcement mode, score threshold, question count, minimum PR size, and exempt file patterns remain per-repo settings (as in V1). They are not inherited from the project.
5. **One project per repo.** A repo links to exactly one project at a time. Re-linking to a different project (or unlinking) is allowed and takes effect for future assessments.
6. **Shared assessment engine.** PRCC and FCS use the same rubric generation, answer scoring, and aggregate calculation engine. The only difference is the trigger (webhook vs manual), the enforcement (Check Run gate vs retrospective), and the source of artefacts (single PR vs multiple merged PRs).
7. **No data migration.** Product is pre-production. No backward-compatibility for V1-spec PRCC flows that were never implemented.
8. **Small PRs.** Each story targets < 200 lines of change.
9. **Reference answers as a learning surface (revision of V1, confirmed).** Once an assessment is fully complete (all participants submitted, scoring finalised, Check Run conclusion set), the rubric — questions, reference answers, and the participant's own scored answers — becomes visible to that participant. Applies to both PRCC and FCS. Rationale: in an AI-augmented team where a single human reviewer is increasingly common, the line between "answer leakage" and "Theory Building" has thinned. The reference answer is the most concentrated artefact of design intent; withholding it from people who already engaged with the questions removes the strongest learning moment. The Check Run remains the audit surface; this view is the learning surface. Other participants' individual scores remain private.

---

## Navigation Model

Navigation differs by role. V12 extends the V11 navigation model to include PRCC assessments.

### Org Admin / Repo Admin

After sign-in, admins land on their last-visited project or `/projects`.

```
NavBar: [FCS logo]  [Projects]  [My Assessments]  [Organisation]  [Org: Acme v]  [User v]

/projects                              ← All projects list
/projects/[id]                         ← Project dashboard — FCS assessments + PRCC assessments for linked repos
/projects/[id]/settings                ← Project context & config (also feeds PRCC for linked repos)
/projects/[id]/assessments/new         ← Create FCS assessment
/projects/[id]/assessments/[aid]       ← FCS assessment detail (FCS always has a project — V11)
/projects/[id]/assessments/[aid]/results
/projects/[id]/assessments/[aid]/submitted

/assessments                           ← My Assessments — admin's own participation queue (FCS+PRCC, pending+completed). See Story 3.3a.
/assessments/[aid]                     ← PRCC assessment detail (always — project link, if any, is a row property, not a URL parent)
/assessments/[aid]/results
/assessments/[aid]/submitted

/organisation                          ← Org settings: existing registered-repos tab gains PRCC columns + per-repo settings link
/organisation/repos/[repoId]           ← Per-repo PRCC settings page
```

**URL convention (resolves rev 2 ambiguity):** PRCC always uses `/assessments/[aid]`; FCS always uses `/projects/[pid]/assessments/[aid]`. The PRCC row may carry a `project_id` (when the repo is linked) but that is purely a context-source pointer — it does not change the URL. Why: FCS requires a project (V11 invariant) so embedding `pid` makes sense; PRCC's project link is optional and may be added/changed/removed over the lifetime of a repo, so embedding `pid` would create a moving URL. One URL per assessment type, deterministic from the type alone.

- **`/organisation`** — extends the existing registered-repos tab. No new "PRCC repos" tab. Existing columns (repo name, status, etc.) gain: linked project (or "—" + "Link" action), PRCC enabled (toggle preview), and a link to per-repo settings. Adding a repo to PRCC = enabling the toggle on its row in the existing table. Same surface for FCS-only repos and PRCC-enabled repos; PRCC is a column, not a separate registry.
- **`/organisation/repos/[repoId]`** — per-repo PRCC settings: enable/disable toggle, enforcement mode, threshold, question count, min PR size, exempt patterns. Also shows the current project link (if any) with a "Link to project" / "Change project" / "Unlink" action.
- **Project dashboard** — FCS assessments always appear here. PRCC assessments appear here when their repo is linked to this project (joined via `assessments.project_id`).
- **Org-level assessment overview (Story 3.4)** — all PRCC assessments appear here, including those without a project link. This is the catch-all admin view.

### Org Member

After sign-in, members land on `/assessments` (My Assessments — see Story 3.3 for the unified queue).

```
NavBar: [FCS logo]  [My Assessments]  [Org: Acme v]  [User v]

/assessments                           ← Unified queue (FCS + PRCC, pending + completed), filterable by project, type, status
/projects/[id]/assessments/[aid]       ← FCS assessment detail (FCS always has a project)
/projects/[id]/assessments/[aid]/results
/projects/[id]/assessments/[aid]/submitted
/assessments/[aid]                     ← PRCC assessment detail (always)
/assessments/[aid]/results
/assessments/[aid]/submitted
```

- `/assessments` includes both FCS and PRCC assessments where the user is enrolled as a participant. The list shows both pending and completed items. Filters: project (from V11 Story 2.3a), type (FCS / PRCC / All), status (Pending / Completed / All). Completed items show outcome and aggregate score and link through to the results page.
- PRCC participants who are not org members (external contributors) reach assessments via the Check Run link only. See Cross-Cutting Concerns §Security & Authorisation for the sign-in question.

### PRCC Participant (Check Run link)

A PR author or reviewer clicks the "Answer comprehension questions" link in the GitHub Check Run:

1. Link always points to `/assessments/[aid]` (PRCC URL convention — see Design Principle 3).
2. If unauthenticated → GitHub OAuth sign-in → redirect back to the assessment URL.
3. If authenticated but not a participant → access denied.
4. If authenticated and a participant → answering form renders.
5. After submission → confirmation at `/assessments/[aid]/submitted`.

> **Note on project link as context source.** The repo→project link in V12 exists solely to point PRCC rubric generation at the project's context (glob patterns, domain notes). It does not carry into the URL, does not appear in breadcrumbs, and does not give the project "ownership" of the PRCC assessment in any other sense. A future enhancement may add **repo-level** context configuration that overrides the project link — at that point the link becomes a fallback rather than the only path. Out of scope for V12 (see "What We Are NOT Building").

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
| **External Contributor** | Persistent (limited) | A GitHub user who is NOT a member of the org but is the author or a reviewer of a PR on a PRCC-enabled repo in that org. By V1's auth model (Story 5.1, ADR-0020) they cannot sign in to the app at all. V12 must decide whether to admit them as participants — see Cross-Cutting Concerns §Security & Authorisation and Open Question 7. Listed here so the role appears wherever it is referenced (Glossary, navigation notes, security section). |
| **Author** | Contextual | PR author in a PRCC assessment. Assigned automatically when a PR triggers PRCC. May be an Org Member, Repo Admin, Org Admin, or External Contributor. |
| **Reviewer** | Contextual | Required reviewer on a PR in a PRCC assessment. Assigned automatically. May be an Org Member, Repo Admin, Org Admin, or (rare) External Contributor. |

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

**Acceptance Criteria:**

- Given the schema migration adding `repositories.project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL` is applied, when an Org Admin views `/organisation`, then each repo row in the registered-repos table shows a "Context project" column with either the linked project's name (clickable, links to the project dashboard) or "—" with a "Link" action.
- Given an Org Admin clicks "Link" on an unlinked repo row, when the link dialog opens, then they can select from the org's existing projects and confirm.
- Given the Org Admin selects project P and confirms, when the link is saved, then `repositories.project_id = P.id` and the row updates to display P's name in the Context project column without page reload.
- Given a Repo Admin views the registered-repos table, when a row corresponds to a repo they administer in GitHub, then the "Link" action is enabled for that row; for repos they do not administer the action is disabled.
- Given an Org Member visits `/organisation`, when the page loads, then they see access denied (existing V11 behaviour — V12 does not change member access to org settings).
- Given a project P is deleted while repo R is linked to it, when the deletion completes, then `R.project_id` is set to NULL via `ON DELETE SET NULL`; existing PRCC assessments on R retain the `project_id` they were captured with at creation time (per Cross-Cutting Concerns §Data Integrity).
- Given a repo R is already linked to project P1, when an admin opens the link dialog, then the dialog shows P1 as the current selection and allows changing it (delegates to Story 1.4 for change/unlink behaviour).

> **Schema work:** This story includes adding `repositories.project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL`. V11 docs said this column would be the foundation work but it was not landed. Story 1.1 owns both the column add and the link UI.

---

<a id="REQ-prcc-configuration-enable-prcc-per-repo"></a>

### Story 1.2: Enable and configure PRCC on a repo

**As an** Org Admin or Repo Admin,
**I want to** enable PRCC on a registered repo (with or without a project link) and configure its operational settings,
**so that** PR events on that repo trigger comprehension assessments.

**Acceptance Criteria:**

- Given a registered repo R, when an Org Admin or admin-of-R opens `/organisation/repos/[R.id]`, then a PRCC section displays controls for: enabled toggle, enforcement mode (Soft/Hard), score threshold (Hard mode only), question count, and exempt file patterns.
- Given the PRCC enabled toggle is off, when the user toggles it on and saves, then `repository_config.prcc_enabled = true` and the new state persists across reload and is reflected immediately in the `/organisation` PRCC column.
- Given enforcement mode is set to Hard, when the page renders, then the score threshold input is shown and required; given enforcement mode is set to Soft, then the threshold input is hidden (or disabled) and not validated.
- Given a Hard-mode threshold is entered outside the integer range [0, 100], when the user attempts to save, then the form rejects the value with an inline error and does not persist the change.
- Given the question count is entered outside the configured allowed range (e.g. [1, 10] from existing FCS limits), when the user saves, then the form rejects the value with an inline error.
- Given exempt file patterns is a comma- or newline-separated list of glob patterns, when the user saves, then they are persisted as-is to `repository_config.exempt_file_patterns` (existing column).
- Given the PRCC settings page loads for a repo without a project link, when it renders, then the PRCC operational controls are still editable — operational settings are independent of the project link (per Design Principle 4).
- Given an Org Member visits `/organisation/repos/[R.id]`, when the page loads, then they see access denied.
- Given a Repo Admin visits `/organisation/repos/[R.id]` for a repo they do NOT administer in GitHub, when the page loads, then they see access denied.
- Given PRCC is toggled from enabled to disabled while an assessment for repo R is in progress, when the toggle is saved, then the in-progress assessment continues to completion; only PR events received after the disable take no action (per Story 2.1).

---

<a id="REQ-prcc-configuration-view-repo-prcc-status"></a>

### Story 1.3: View repo PRCC status on organisation settings

**As an** Org Admin or Repo Admin,
**I want to** see all registered repos on the organisation settings page with their PRCC status and (when set) the project that supplies their rubric context,
**so that** I can scan which repos have PRCC active and where they pull their context from.

**Acceptance Criteria:**

- Given a list of registered repos with mixed PRCC enablement, when an Org Admin or Repo Admin views `/organisation`, then the registered-repos table shows the columns: Repo name, Status (active/inactive — existing), PRCC (Enabled/Disabled chip), Context project (project name link or "—" with "Link" action), Settings (link to `/organisation/repos/[id]`).
- Given a repo R has `prcc_enabled = true` and `project_id = P.id`, when its row renders, then the PRCC column shows "Enabled" and the Context project column shows P's name as a clickable link to `/projects/[P.id]`.
- Given a repo R has `prcc_enabled = true` and `project_id IS NULL`, when its row renders, then the PRCC column shows "Enabled" and the Context project column shows "—" with a "Link" action; clicking opens the link dialog from Story 1.1.
- Given a repo R has `prcc_enabled = false`, when its row renders, then the PRCC column shows "Disabled"; the Context project column still shows the link state (link is independent of enablement).
- Given a Repo Admin views the table, when rows show repos they do not administer in GitHub, then settings actions on those rows are disabled and the Link action is disabled (read-only view of state).
- Given an Org Member visits `/organisation`, when the page loads, then they see access denied.
- Given the table is rendered, when no new "PRCC repos" tab exists, then the existing registered-repos tab is the single surface (no separate PRCC tab is introduced).

> **Note:** Per Design Principle 2, the project link is a context-source pointer only — a PRCC repo does not "belong to" a project. The repos table column is labelled "Context project" (or similar) to reflect this, not "Project".
---

<a id="REQ-prcc-configuration-change-project-link"></a>

### Story 1.4: Change or remove a repo's project link

**As an** Org Admin or Repo Admin,
**I want to** change a repo's project link to a different project, or remove the link entirely,
**so that** I can reorganise when a repo moves between teams, or run PRCC on a repo without project context.

**Acceptance Criteria:**

- Given a repo R linked to project P1, when an admin-of-R opens `/organisation/repos/[R.id]` and clicks "Change project", then the link dialog opens with P1 as the current selection.
- Given the admin selects a different project P2 and confirms, when saved, then `repositories.project_id = P2.id`; existing PRCC assessments on R retain their original `project_id` from creation time (per Cross-Cutting §Data Integrity).
- Given a repo R linked to a project, when an admin-of-R clicks "Unlink", then a confirmation dialog appears explaining that future PRCC assessments will use code-only context.
- Given the admin confirms unlink, when saved, then `repositories.project_id = NULL` and the row's Context project column shows "—" with a "Link" action; if `prcc_enabled` was true it remains true.
- Given an unlinked repo R with PRCC enabled, when a new PR triggers PRCC, then rubric generation proceeds with code-only context (no project glob patterns or domain notes injected — per Design Principle 2).
- Given a repo R has an in-progress PRCC assessment when its link is changed or removed, when the link change is saved, then the in-progress assessment is unaffected; only assessments created after the change use the new link.
- Given a Repo Admin attempts to change or remove the link on a repo they do not administer, when they reach the page, then the actions are not available (page is access-denied per Story 1.2).

> **Note:** "Remove" sets `repositories.project_id` to NULL — the repo continues to have PRCC enabled (if previously enabled) but rubric generation falls back to code-only context per Design Principle 2. Existing assessments retain the `project_id` they were created with (Cross-Cutting Concerns §Data Integrity).

---

### Epic 1 layout reference (informative)

To anchor Stories 1.1–1.4, the two repo-related surfaces are:

**`/organisation` — registered-repos table (existing tab, gains PRCC columns):**

| Column | Source | Notes |
|--------|--------|-------|
| Repo name | `repositories.github_repo_name` | Existing |
| Status | `repositories.status` | Existing (active / inactive) |
| PRCC | `repository_config.prcc_enabled` | New column — chip showing Enabled / Disabled |
| Context project | `repositories.project_id` → `projects.name` | New column — project name (link) or "—" with "Link" action |
| Settings | — | New action — opens `/organisation/repos/[repoId]` |

**`/organisation/repos/[repoId]` — per-repo PRCC settings page (new):**

- **PRCC section:** enabled toggle, enforcement mode (Soft/Hard), score threshold (Hard only), question count, exempt file patterns (for context filtering — see §Skip semantics).
- **Context section:** current context project (with "Link" / "Change" / "Unlink" action). Read-only display of the project's glob patterns + domain notes for transparency (the actual edit happens on the project's settings page).
- **History section:** recent PRCC assessments for this repo (last 10), each with PR# and outcome.

These layouts inform Stories 1.2, 1.3, 1.4 ACs in the next pass — they are not normative on their own.

---

## Epic 2: PRCC Webhook & Assessment Flow [Priority: High]

The core PRCC pipeline: webhook-triggered assessment creation, Check Run management, participant answering, relevance/scoring, gate enforcement, and PR update handling. Reuses the shared assessment engine (rubric generation, scoring, aggregate calculation) already built for FCS.

**Rationale:** Core product behaviour. Depends on Epic 1 (configuration).

<a id="REQ-prcc-webhook-and-assessment-flow-pr-event-detection"></a>

### Story 2.1: PR event detection via webhook

**As the** system,
**I want to** detect PR lifecycle events on PRCC-enabled repos and decide whether to initiate, update, or skip a comprehension assessment,
**so that** assessments are created at the right time and skipped predictably for cases that do not warrant comprehension review.

**Acceptance Criteria:**

- Given a webhook delivery for `pull_request.opened` on a repo with `prcc_enabled = true` and the PR not in draft state, when the handler runs, then a new PRCC assessment row is created (delegated to Story 2.2) and a Check Run is created in `in_progress` state (delegated to Story 2.3).
- Given a webhook delivery for `pull_request.ready_for_review` on a PR that previously had no assessment (was draft), when the handler runs, then a PRCC assessment is created (subject to Story 2.7 skip rules).
- Given a webhook delivery for `pull_request.review_requested` on a PR that already has an active assessment, when the handler runs, then the new reviewer is added to `assessment_participants` with `status = 'pending'`; the rubric is unchanged; the Check Run summary is refreshed to include the new participant (delegated to Story 2.3).
- Given a webhook delivery for `pull_request.review_request_removed` on a PR with an active assessment, when the handler runs, then the participant's row is updated to `status = 'removed'`; their previously submitted answers (if any) on `participant_answers` are retained verbatim and never deleted; the aggregate is recomputed excluding the removed participant.
- Given a webhook delivery for `pull_request.opened` on a draft PR (`pull_request.draft = true`), when the handler runs, then no assessment is created and no Check Run is created.
- Given a webhook delivery for any pull_request event on a repo where `repository_config.prcc_enabled = false`, when the handler runs, then the event is acknowledged with HTTP 200 and no assessment row is created.
- Given a webhook delivery for a non-pull_request event (e.g. `push` without a PR context), when the handler runs, then the event is acknowledged with no PRCC action.
- Given a webhook delivery whose signature fails HMAC-SHA256 verification, when the handler runs, then the response is HTTP 401 (existing behaviour) and no PRCC action is taken.
- Given the PR body, head commit message, or a qualifying PR comment contains `[skip-prcc]` per Story 2.7 §Skip semantics, when the handler runs on the qualifying event, then a `status = 'skipped'` assessment row is created (or the existing one is flipped to skipped) instead of generating a rubric.

> **V1 contract, with V12 revisions (see §Skip semantics below):**
> - **Triggers (assessment created):** PR opened (when not draft), PR moved from draft to ready-for-review, required reviewer added to a PR that already has an assessment (existing assessment is updated to include the new participant — same questions).
> - **Reviewer removed:** the participant's row is marked `removed` (existing `assessment_participants.status` enum), but their submitted answers are **retained verbatim** — never deleted, never soft-deleted. Audit / learning value is preserved. The aggregate is recomputed excluding the removed participant.
> - **Skip — no Check Run:** PR is in draft state. PRCC re-evaluates on draft→ready transition.
> - **Skip — `[skip]` marker (V12 unified skip):** see §Skip semantics below — replaces V1's automatic min-size and exempt-pattern auto-skip rules.
> - **PRCC disabled on the repo:** event acknowledged, no assessment created, no Check Run.

> **Note on exempt file patterns (in response to L241 review):** `repository_config.exempt_file_patterns` is configured per repo (existing column). In V12 it is used **only** for context filtering during rubric generation — files matching the pattern are excluded from the LLM prompt (e.g. `package-lock.json`, `*.snap`). It does **not** trigger an automatic PRCC skip the way V1 specified. Skipping a PRCC assessment is now an explicit author/admin action (see §Skip semantics).

---

<a id="REQ-prcc-webhook-and-assessment-flow-prcc-assessment-creation"></a>

### Story 2.2: PRCC assessment creation

**As the** system,
**I want to** create a PRCC assessment from the PR artefacts when a qualifying PR event is detected,
**so that** participants have questions to answer.

**Acceptance Criteria:**

- Given a qualifying PR event from Story 2.1, when the system fetches PR artefacts, then it collects the PR diff, changed-file contents, PR title, PR description, linked issue numbers (extracted via GitHub closing keywords e.g. `Closes #123`), and changed test files.
- Given `repository_config.exempt_file_patterns` is set, when artefacts are passed to the LLM, then files matching any pattern (e.g. `package-lock.json`, `*.snap`) are excluded from the prompt context; the assessment is still created (the patterns do not trigger a skip — see Story 2.7).
- Given the artefacts exceed the model's context window, when the system invokes Token Budget (V5 Epic 1) and agentic retrieval (V2 Epic 17 if enabled), then prompt size is reduced to fit; no V1 "> 50 files" hard rule is enforced.
- Given a repo R is linked to project P, when rubric generation runs for an assessment on R, then P's glob patterns and domain notes are included in the LLM prompt at creation time.
- Given a repo R is not linked to a project (`project_id IS NULL`), when rubric generation runs, then no injected project context is used (code-only).
- Given the LLM returns a valid rubric (questions, weights, reference answers), when the assessment is persisted, then `assessments.status = 'awaiting_answers'`; rows are written to `assessment_questions` (questions, weights, reference answers); rows are written to `assessment_participants` for the PR author and required reviewers (each with `status = 'pending'`); `assessments.project_id` is set to the repo's `project_id` at creation time (NULL if unlinked).
- Given the LLM call fails (timeout or API error), when retries are exhausted, then `assessments.status = 'rubric_failed'` and the Check Run is updated to `neutral` with an error summary (delegates to Story 2.9).
- Given the artefacts are very thin (e.g. one-line PR with empty description), when rubric generation runs, then a thin rubric is produced (low question count if appropriate); generation does not fail on sparse input.
- Given the question count from `repository_config.prcc_question_count` is N, when the rubric is generated, then the LLM is prompted to produce N questions (best-effort; thin artefacts may yield fewer).

> **Story 2.2 contract (informs ACs):** PRCC reuses the existing FCS extraction pipeline (Token Budget — V5 Epic 1; agentic retrieval — V2 Epic 17 if enabled). PRCC supplies a single PR as input; FCS supplies multiple merged PRs. The model context window is the bound on input size (no V1 "> 50 files" rule). PRCC inputs: PR diff, changed-file contents, PR title/description, linked issue numbers (closing keywords), test files. Filters: `exempt_file_patterns` (Story 2.1 note). Behaviour: thin artefacts → thin questions, no failure on sparse input.

---

<a id="REQ-prcc-webhook-and-assessment-flow-check-run-management"></a>

### Story 2.3: GitHub Check Run management

**As a** PR Author or Reviewer,
**I want to** see a GitHub Check Run on the PR with a clear status summary at every lifecycle stage,
**so that** I know what is required of me and what the current outcome is.

**Acceptance Criteria:**

- Given a PRCC assessment is created, when the system creates the Check Run via the GitHub API, then the Check Run is in `status = 'in_progress'` with title "Comprehension Check — generating questions" and a summary stating "Generating comprehension questions for [N] participants. This usually takes < 30s."
- Given the rubric is generated and the assessment status moves to `awaiting_answers`, when the Check Run is updated, then `status` remains `'in_progress'`, the title becomes "Comprehension Check — [k] of [N] answered" (with k=0 initially), and the summary lists each participant by GitHub handle with ✓ (submitted) or ⏳ (pending) and a link "Answer comprehension questions →" pointing to `/assessments/[aid]`.
- Given a participant submits answers, when the assessment row is updated, then the Check Run summary is refreshed within 30 seconds to reflect the new (k of N) count.
- Given all participants have submitted, when scoring begins, then the Check Run status remains `'in_progress'` with title "Comprehension Check — scoring" and summary "All [N] participants submitted. Scoring in progress."
- Given Soft mode and all participants answer relevantly (per Story 2.5), when scoring completes, then the Check Run is closed with `conclusion = 'success'`, title "Comprehension Check — passed", and summary "All participants answered relevantly" plus a "View results →" link.
- Given Hard mode and aggregate ≥ threshold (per Story 2.6), when scoring completes, then `conclusion = 'success'`, title "Comprehension Check — passed", and summary "Aggregate comprehension: NN%" plus a "View results →" link.
- Given Hard mode and aggregate < threshold, when scoring completes, then `conclusion = 'failure'`, title "Comprehension Check — failed", and summary "Aggregate comprehension: NN% (threshold: TT%)" with no per-participant breakdown plus a "View results →" link.
- Given the assessment is skipped via any path (per Story 2.7), when the Check Run is updated, then `conclusion = 'neutral'`, title "Comprehension Check — skipped", and summary names the skip source, skipped-by, and skipped-at (e.g. "Skipped via `[skip-prcc]` in PR body" or "Skipped by @alice: hotfix for prod incident").
- Given the assessment status is `rubric_failed` or `scoring_failed` (LLM error), when the Check Run is updated, then `conclusion = 'neutral'`, title "Comprehension Check — error", and summary states the failure reason and notes admin retry availability in-app.
- Given any Check Run state, when the summary renders, then it never displays individual participant scores, individual answer text, or reference answers (those live on the in-app results page — Story 3.1).
- Given a Check Run update fails to reach the GitHub API (transient network error), when the system retries up to the configured retry budget, then if any retry succeeds the state is reconciled; if all fail, the assessment data is correct in the database and the next state transition will reattempt the update.

> **Check Run display contract (informs ACs):**
>
> | Lifecycle stage | Check Run state | Title | Summary content |
> |---|---|---|---|
> | Just created, rubric generating | `in_progress` | "Comprehension Check — generating questions" | "Generating comprehension questions for [N] participants. This usually takes < 30s." |
> | Awaiting answers | `in_progress` | "Comprehension Check — [k] of [N] answered" | List participants by GitHub handle with ✓ (submitted) / ⏳ (pending). Link: "Answer comprehension questions →". |
> | Scoring in progress | `in_progress` | "Comprehension Check — scoring" | "All [N] participants submitted. Scoring in progress." |
> | Passed (Soft or Hard) | `success` | "Comprehension Check — passed" | Aggregate score (Hard) or "All participants answered relevantly" (Soft). Link: "View results →". |
> | Failed (Hard, below threshold) | `failure` | "Comprehension Check — failed" | "Aggregate comprehension: 58% (threshold: 70%)". No per-participant breakdown. Link: "View results →". |
> | Skipped (`[skip]` marker, admin skip, draft) | `neutral` | "Comprehension Check — skipped" | Skip reason (e.g. "Marked `[skip-prcc]` in PR description") + skipped-by + timestamp. |
> | LLM error / rubric_failed | `neutral` | "Comprehension Check — error" | "Could not generate questions: [reason]". Admin retry action available in-app. |
>
> **Never displays:** individual participant scores, individual answer text, reference answers (those live on the in-app results page — see Story 3.1).
---

<a id="REQ-prcc-webhook-and-assessment-flow-prcc-answering"></a>

### Story 2.4: PRCC assessment answering

**As a** PR Author or Reviewer,
**I want to** click the link from the GitHub Check Run and answer comprehension questions about the PR,
**so that** I demonstrate my understanding of the change.

**Acceptance Criteria:**

- Given a participant clicks the "Answer comprehension questions" link in the Check Run, when they are unauthenticated, then they are redirected to GitHub OAuth sign-in and back to `/assessments/[aid]` upon successful authentication.
- Given an authenticated user reaches `/assessments/[aid]` for an assessment where they are not enrolled in `assessment_participants`, when the page renders, then they see access denied.
- Given an authenticated participant reaches `/assessments/[aid]` before submitting, when the page renders, then the answering form shows each rubric question with a free-text response field, the assessment metadata (PR# and repo name), and the notice from Story 2.8 ("Finish your PR before requesting review …").
- Given the participant types answers and submits, when the request is sent, then their answers are persisted to `participant_answers` (one row per question), their `assessment_participants.status` moves to `'submitted'`, and the user is redirected to `/assessments/[aid]/submitted`.
- Given the participant has already submitted, when they revisit `/assessments/[aid]`, then the page redirects to `/assessments/[aid]/submitted` (or to `/assessments/[aid]/results` if the assessment is now `completed` — see Story 3.1).
- Given the assessment has been invalidated (per Story 2.8 — `superseded_by` is set) before the participant submits, when they attempt to submit, then submission is rejected with a clear message "This assessment has been replaced by a newer version" and a link to the new assessment.
- Given the assessment is in a terminal state (`status = 'skipped'`, `'completed'`, `'rubric_failed'`, or `'invalidated'`), when an authenticated participant visits the page, then the answering form is suppressed and the appropriate state view is shown.
- Given the answering form is rendered, when the user has typed but not submitted, then unsubmitted text is preserved if the page is reloaded within the same browser session (best-effort via existing FCS form behaviour — V12 does not introduce server-side draft persistence).

---

<a id="REQ-prcc-webhook-and-assessment-flow-relevance-validation"></a>

### Story 2.5: Relevance validation (Soft mode)

**As the** system,
**I want to** validate each participant's answers against the rubric for relevance in Soft mode,
**so that** the gate has meaning even without a score threshold — gibberish or copy-paste answers are caught while genuine attempts pass.

**Acceptance Criteria:**

- Given Soft mode (`enforcement_mode = 'soft'`) and all non-removed participants have submitted, when the system runs scoring, then each participant's answer to each question is classified as `relevant` or `not_relevant` via the existing relevance detection (V1 Story 4.4 — reused unchanged).
- Given all participants have all answers classified `relevant`, when scoring completes, then `assessments.conclusion = 'passed'` and the Check Run conclusion is `success` (per Story 2.3).
- Given any participant has any answer classified `not_relevant`, when scoring completes, then `assessments.conclusion = 'failed'` and the Check Run conclusion is `failure`.
- Given Soft mode, when the Check Run summary is composed, then no aggregate score percentage is displayed; the summary states "All participants answered relevantly" (pass) or "Some answers were not relevant to the rubric" (fail).
- Given a participant whose `assessment_participants.status = 'removed'`, when scoring runs, then their answers are excluded from the relevance evaluation; their submitted rows on `participant_answers` remain on disk but do not gate the outcome.
- Given a participant who has submitted answers but is later reclassified `did_not_participate` (admin action — out of scope for V12 ACs but supported by schema), when scoring runs, then their answers are excluded from the relevance evaluation.
- Given relevance classification fails for any question (LLM error during classification), when retries are exhausted, then the assessment is marked `scoring_failed` and routed to Story 2.9 error handling.
---

<a id="REQ-prcc-webhook-and-assessment-flow-score-based-evaluation"></a>

### Story 2.6: Score-based evaluation (Hard mode)

**As the** system,
**I want to** score participant answers against the rubric in Hard mode and enforce the score threshold,
**so that** merge is blocked when aggregate comprehension is insufficient.

**Acceptance Criteria:**

- Given Hard mode (`enforcement_mode = 'hard'`) and all non-removed participants have submitted, when the system runs scoring, then each participant's answer to each question is scored on a 0–100 scale using the shared scoring engine (the same engine used for FCS).
- Given a question has weight `w` and a participant's score on that question is `s`, when the participant's contribution is calculated, then their weighted contribution to the aggregate is `s * w / sum(weights)`.
- Given multiple non-removed participants, when the aggregate is computed, then it is the unweighted mean across participants of each participant's weighted score (so the aggregate is invariant to participant count).
- Given the computed aggregate ≥ `repository_config.score_threshold`, when scoring completes, then `assessments.conclusion = 'passed'`, `assessments.aggregate_score` is persisted, and the Check Run conclusion is `success`.
- Given the computed aggregate < `repository_config.score_threshold`, when scoring completes, then `assessments.conclusion = 'failed'`, `assessments.aggregate_score` is persisted, and the Check Run conclusion is `failure`.
- Given Hard mode, when the Check Run summary is composed, then it states "Aggregate comprehension: NN%" with the configured threshold; per-participant scores are NOT included in the Check Run.
- Given a removed participant, when the aggregate is computed, then their submitted answers are excluded from the aggregate; the threshold value is unchanged by the removal.
- Given scoring fails for any question (LLM error), when retries are exhausted, then `assessments.status = 'scoring_failed'` and routed to Story 2.9 error handling.

---

<a id="REQ-prcc-webhook-and-assessment-flow-prcc-gate-skip"></a>

### Story 2.7: PRCC gate skip — `[skip-prcc]` marker + admin override

**As a** PR author or admin,
**I want to** skip the PRCC gate either declaratively (a marker in the PR body, a commit message, or a PR comment) or by an admin action,
**so that** trivial PRs, emergency hotfixes, and scope-irrelevant PRs do not require a comprehension assessment, without relying on opaque automatic heuristics.

**Acceptance Criteria:**

- Given a PR is opened with the literal string `[skip-prcc]` anywhere in the PR body, when the webhook handler processes the event, then no rubric is generated; the assessment row is created with `status = 'skipped'`, `skip_reason = 'PR body marker'`, `skipped_by = 'system'`, `skipped_at = now()`; the Check Run is created in `conclusion = 'neutral'` with summary "Skipped via `[skip-prcc]` in PR body".
- Given a PR is opened without `[skip-prcc]` and a subsequent commit is pushed whose message contains `[skip-prcc]`, when the handler processes the push event, then if a debounced regeneration is queued it is cancelled (per Story 2.8), and if the assessment is `awaiting_answers` its status flips to `'skipped'` with `skip_reason = 'commit message marker'` and `skipped_by = 'system'`; previously submitted answers are retained on `participant_answers`.
- Given a top-level PR comment whose body is exactly `[skip-prcc]` or `[skip-prcc]: <reason>` is posted by an Org Admin, Repo Admin, or the PR author, when the handler processes the issue_comment event, then the assessment status flips to `'skipped'`, `skip_reason` captures the optional reason text (or "PR comment marker"), `skipped_by` is set to that user's id, and `skipped_at = now()`.
- Given a PR comment containing `[skip-prcc]` is posted by a user who is neither Org Admin nor Repo Admin nor the PR author, when the handler processes it, then no skip is applied (the marker is ignored); the assessment continues unchanged.
- Given an Org Admin opens `/assessments/[aid]` and clicks "Skip PRCC", when a reason is supplied (mandatory) and the request is submitted, then `status = 'skipped'`, `skip_reason` = supplied text, `skipped_by` = the admin's user id, `skipped_at = now()`; the Check Run is updated to `neutral`.
- Given a Repo Admin attempts the in-app "Skip PRCC" action on an assessment whose repo they do not administer, when the request is submitted, then it is rejected with HTTP 403 and the assessment is unchanged.
- Given the marker text appears as `[Skip-PRCC]`, `[skip prcc]`, `[skip-PRCC]`, or `skip-prcc` (without brackets), when the handler scans the input, then no skip is applied — the token is `[skip-prcc]` exactly, case-sensitive (per OQ 9 resolution).
- Given a skipped assessment, when displayed in `/assessments` and the org overview (Story 3.4), then it shows outcome "Skipped" with skip-by, skip-at, and skip-reason.
- Given `repository_config.exempt_file_patterns` is set and a PR's changed files all match those patterns, when the webhook handler runs without any `[skip-prcc]` marker, then a normal PRCC assessment IS created (V1's auto-skip on exempt-only patterns is NOT replicated — patterns affect context filtering only).
- Given `repository_config.min_pr_size` and `trivial_commit_threshold` columns exist, when the webhook handler runs, then their values are NOT consulted (V12 deprecates these auto-skip rules; columns retained without destructive migration).

---

### Story 2.7 supplement — §Skip semantics (unified skip model, V12 revision)

V1 specified three independent skip rules: small PRs (`min_pr_size`), exempt-only file changes (`exempt_file_patterns`), and "trivial commits" on push (`trivial_commit_threshold`). V12 collapses all of these into one explicit, declarative mechanism plus an admin override.

**The `[skip-prcc]` marker.** PRCC is skipped when any of the following is present:

1. **PR body** — the literal string `[skip-prcc]` (or configurable alias) appears anywhere in the PR description.
2. **Commit message** — the literal string `[skip-prcc]` appears in the message of the PR's HEAD commit (or any commit since the last PRCC trigger, if the PR has been updated).
3. **PR comment** — a top-level PR comment by an Org Admin, Repo Admin, or the PR author whose body is `[skip-prcc]` (optionally followed by `: <reason>`).
4. **Admin action in-app** — Org Admin (any repo) or Repo Admin (their repos) clicks "Skip PRCC" on the assessment page with a mandatory reason.

**The token is `[skip-prcc]` only** (case-sensitive, exact match — OQ 9 resolved).

When skipped:
- Assessment `status = skipped`, Check Run conclusion = `neutral`, summary names the skip source ("Skipped via `[skip-prcc]` in PR body" / "Skipped by @alice: hotfix for prod incident").
- `skip_reason` (free text including the source), `skipped_by` (user id, or `system` for marker-driven), `skipped_at` recorded on the assessment row.
- Skipped assessments appear in `/assessments` and the org overview (Story 3.4) with outcome `Skipped`.

**Retroactive skip after assessment generated.** Both paths supported (OQ 11 resolved): the author/admin can add `[skip-prcc]` in a subsequent commit/comment, **or** the admin can click "Skip PRCC" in-app. Same effect: status flips to `Skipped`, any submitted answers are retained on the row (per L238), no further answers required.

**Dropped from V12 (were in V1):** automatic skip on PR size below `min_pr_size`, automatic skip on all-files-match-`exempt_file_patterns`, "trivial commit" heuristic in Story 2.8. All three replaced by the explicit `[skip-prcc]` marker. `exempt_file_patterns` is kept but repurposed for context filtering only (see Story 2.1 note).

**Schema impact.** No new columns. `skip_reason` / `skipped_by` / `skipped_at` already exist on `assessments`. `min_pr_size` and `trivial_commit_threshold` columns in `repository_config` become unused — left in place (no destructive migration in v12), flagged deprecated.

---

<a id="REQ-prcc-webhook-and-assessment-flow-pr-update-handling"></a>

### Story 2.8: PR update handling

**As the** system,
**I want to** handle new commits pushed to a PR under assessment, debouncing rapid pushes and honouring `[skip-prcc]` markers,
**so that** the assessment reflects the current state of the PR, cannot be gamed by answer-then-push, and does not regenerate for minor fixes when the author marks the commit as skip-worthy.

**Acceptance Criteria:**

- Given an in-progress assessment (`status = 'awaiting_answers'`) and a new commit is pushed without `[skip-prcc]` in its message, when the debounce window of `repository_config.regen_debounce_seconds` (default 300) elapses, then the existing assessment is updated to `status = 'invalidated'` with `superseded_by` set to the new assessment's id; a new assessment is created from the updated PR artefacts (Story 2.2); `participant_answers` rows from the original assessment remain on disk verbatim.
- Given a completed assessment (`status = 'completed'`) and a new commit is pushed without `[skip-prcc]`, when debounce elapses, then a new assessment is created (the previous remains as `completed` for history) and `superseded_by` on the previous links it to the new one.
- Given a new commit whose message contains `[skip-prcc]`, when the handler processes the push, then no regeneration is queued; the existing assessment status (in-progress, completed, or skipped) is unchanged.
- Given multiple commits are pushed within the debounce window, when the window elapses, then a single regeneration is performed against the latest commit's state (intermediate commits do not produce intermediate assessments).
- Given a `[skip-prcc]` marker arrives during the debounce window via subsequent commit, qualifying PR comment, or admin action, when it is processed, then any pending queued regeneration is cancelled (per `sync_debounce` row removed); if the existing assessment is `awaiting_answers`, its status flips to `'skipped'`; if it is `completed`, no change is made.
- Given an assessment that has been partially answered (some participants submitted, others not) and is then skipped via `[skip-prcc]`, when the skip is applied, then `status = 'skipped'`, submitted `participant_answers` rows are retained, the per-participant submission counts visible on the assessment row convey state, and no separate `partial_skip` flag is written (per OQ 11 resolution — submission counts are sufficient).
- Given a participant is on the answering form, when the page renders, then a notice is displayed: "Finish your PR before requesting review — new commits will require a new assessment, unless you tag them with `[skip-prcc]`."
- Given `repository_config.regen_debounce_seconds = 300` (default) and an admin updates it to 60 via the per-repo settings page, when a new commit is pushed after the change, then the debounce window honours the new 60-second value.
- Given the trigger model is open / ready-for-review (per OQ 10), when a PR is merged or closed without a triggering update, then no merge-time PRCC assessment is created (merge-time trigger deferred to a future version).

> **PR update contract (V12 revision):**
> - **In-progress / completed + new commits without `[skip-prcc]` → regenerate.** In-progress: existing assessment marked `invalidated`, `superseded_by` set on the new one. Completed: previous assessment kept for history, new one created and linked. Either way, previously submitted answers are **retained verbatim** on their original row (per L238).
> - **New commits with `[skip-prcc]` in the commit message → no regeneration.** Commit is treated as PRCC-irrelevant. Existing assessment continues (or completed status stands).
> - **`[skip-prcc]` arriving during the debounce window → cancel pending regeneration.** A `[skip-prcc]` marker that lands while the debouncer is still waiting clears the queued regeneration. Effective whether the marker comes via subsequent commit, PR comment, or admin action (per L405).
> - **`[skip-prcc]` arriving after assessment was partially answered → status = `Skipped`.** Submitted answers retained on the row; Check Run becomes `neutral`. **No separate `partial_skip` flag** — the participant-level submission counts already convey the picture (per L430, decision: keep simple).
> - **Debounce window.** Multiple commits within `repository_config.regen_debounce_seconds` (default `300` — 5 min, configurable per repo) collapse to a single regeneration.
> - **UX notice in answering form.** "Finish your PR before requesting review — new commits will require a new assessment, unless you tag them with `[skip-prcc]`."

> **Trigger model decided (OQ 10 → option (a)).** PRCC fires on PR opened (when not draft), draft→ready, and reviewer added — same as V1 / V12 rev 5 default. Author can use `[skip-prcc]` to silence. Merge-time trigger (L336 alternative) and hybrid `[defer-prcc]` model considered and deferred — revisit if partner-customer feedback shows open-time friction is unworkable.

---

<a id="REQ-prcc-webhook-and-assessment-flow-llm-error-handling-prcc"></a>

### Story 2.9: LLM error handling for PRCC

**As the** system,
**I want to** handle LLM API failures during PRCC rubric generation and scoring without blocking the PR indefinitely,
**so that** the PR is not stuck in limbo when the LLM is unavailable.

**Acceptance Criteria:**

- Given a transient LLM API failure (timeout, 5xx, rate-limit) during rubric generation, when the system retries up to the configured retry budget with exponential backoff, then if any retry succeeds the assessment proceeds normally to `awaiting_answers`.
- Given LLM retries are exhausted during rubric generation, when retries fail, then `assessments.status = 'rubric_failed'`, the Check Run conclusion is `neutral` with title "Comprehension Check — error" and summary stating the failure reason in plain language (no stack traces).
- Given an assessment is in `rubric_failed`, when an Org Admin or admin-of-repo opens `/assessments/[aid]`, then a "Retry rubric generation" admin action is available; clicking it re-attempts generation against the current PR state (refetched).
- Given a `rubric_failed` assessment is retried successfully, when generation completes, then the row transitions to `awaiting_answers`, the Check Run is reopened to `in_progress`, and participants are notified per Check Run update flow.
- Given a transient LLM API failure during scoring (relevance or score-based), when the system retries up to the retry budget, then if any retry succeeds, scoring completes; if all fail, `assessments.status = 'scoring_failed'`, the Check Run conclusion is `neutral` with summary "Could not score answers", and an admin "Retry scoring" action is available in-app.
- Given the LLM is unavailable for an extended period (e.g. provider outage), when participants visit `/assessments/[aid]` while the assessment is in `rubric_failed`, then the answering form is suppressed and the page shows the error state with a notice "Comprehension questions could not be generated. An admin has been notified" (no indefinite loading spinner).
- Given a `rubric_failed` or `scoring_failed` assessment, when it appears in `/assessments` for participants, then the row shows status "Error" with no answering action; admins see a "Retry" affordance.
- Given LLM error logs are emitted, when an error occurs, then they include the assessment id, repo, PR number, the operation (generation/scoring), the LLM provider response code, and a redacted summary — sufficient to debug without leaking PR content.

---

## Epic 3: PRCC Reporting & Visibility [Priority: Medium]

Result pages, organisation-level PRCC overview, and integration with the existing project dashboard and assessment queue.

**Rationale:** Users need to see PRCC outcomes. Depends on Epic 2.

<a id="REQ-prcc-reporting-and-visibility-prcc-results-page"></a>

### Story 3.1: PRCC assessment results page

**As a** PRCC participant, Org Admin, or Repo Admin,
**I want to** see the full results of a completed PRCC assessment — including the rubric, my own answers and scores, and the team aggregate — as a Naur Theory Building learning surface,
**so that** I close the loop on what I demonstrated I understood and what the artefacts intended.

**Acceptance Criteria:**

- Given a PRCC assessment with `status = 'completed'` and the signed-in user is enrolled as a participant, when they visit `/assessments/[aid]/results`, then the page shows: each rubric question, its weight, the reference answer, the participant's own submitted answer, the participant's own per-question score, the team aggregate score, the outcome (Passed/Failed), and the enforcement mode/threshold context.
- Given a completed PRCC assessment and the signed-in user is an Org Admin or admin of the assessment's repo, when they visit the results page, then the page shows the rubric (questions + reference answers + weights), the team aggregate, the outcome, and any skip metadata; it does NOT show other participants' submitted answer text or per-participant scores.
- Given a completed assessment and the signed-in user is neither a participant nor admin-of-repo nor Org Admin, when they visit the results page, then they see access denied.
- Given a per-question aggregate is displayed on the results page (e.g. "Q1 average: 73%"), when it renders, then no per-participant attribution is shown.
- Given an assessment with `status = 'awaiting_answers'` or `status = 'scoring'`, when any user visits `/assessments/[aid]/results`, then the page shows a progress view (k of N submitted, scoring status); the rubric, reference answers, and submitted answers are NOT shown.
- Given an assessment with `status = 'skipped'`, when an authorised viewer visits `/assessments/[aid]/results`, then the page shows outcome = Skipped, skip reason, skipped-by, skipped-at; rubric content is not shown (the rubric may not have been generated).
- Given an assessment with `status = 'invalidated'` (superseded), when a participant visits its results page, then the page shows an explanation that this assessment was replaced and provides a link to the superseding assessment (`superseded_by`).
- Given an Org Admin or admin-of-repo is also a participant on the same assessment, when they visit the results page, then they see the participant view (their own answers + scores) — admin role does not strip the participant view.

> **Visibility contract (revises V1 Story 6.1):**
> - **Visible to: a participant viewing their own completed assessment** — questions, reference answers, weights, the participant's own submitted answers, the participant's own per-question scores, the team aggregate score, the outcome (Passed/Failed/Skipped), and the enforcement mode/threshold context.
> - **Visible to: Org Admins / Repo Admins viewing the same assessment** — everything above except other participants' submitted answers and per-participant scores. Admins see the rubric (questions + reference answers), the team aggregate, the outcome, and any skip metadata.
> - **Never visible to anyone:** another participant's individual score or their submitted answer text. Per-question aggregate (across all participants) is shown, attribution is not.
> - **Available only after completion** — `status = completed`, all participants either submitted or marked `did_not_participate`, and scoring finalised. While in-progress, the page shows progress only.
> - **Skipped assessments** show outcome + skip reason + skipped-by + skipped-at; no rubric content (rubric may not have been generated).
>
> **Note:** This is the principal V1 reversal, confirmed in rev 4. V1 Story 6.1 explicitly forbade reference answers on PRCC results pages ("to prevent answer sharing on future PRs"). V12 reverses that for both PRCC and FCS — see Design Principle 9 for the Naur Theory Building rationale.

---

<a id="REQ-prcc-reporting-and-visibility-prcc-in-project-dashboard"></a>

### Story 3.2: PRCC assessments in the project dashboard

**As an** Org Admin or Repo Admin,
**I want to** see PRCC assessments alongside FCS assessments in the project dashboard,
**so that** all comprehension activity for the project is visible in one place.

**Acceptance Criteria:**

- Given a project P with at least one repo R linked to P (`repositories.project_id = P.id`) and a PRCC assessment A on R, when an Org Admin or admin-of-R views `/projects/[P.id]`, then assessment A is listed alongside FCS assessments for the project.
- Given the listing includes mixed types (FCS and PRCC) on `/projects/[P.id]`, when each row renders, then a type label distinguishes them (FCS vs PRCC); PRCC rows show repo name and PR# as the identifier; FCS rows show the feature name (V11 behaviour, unchanged).
- Given a PRCC assessment B on a repo whose `project_id` is NOT P (or NULL), when `/projects/[P.id]` loads, then B is NOT listed on P's dashboard.
- Given a PRCC assessment A was created when its repo was linked to P, and the link is later changed to project Q (Story 1.4), when `/projects/[P.id]` loads, then A IS still listed on P (the assessment retains its captured `project_id` per Cross-Cutting §Data Integrity).
- Given an Org Member visits `/projects/[P.id]`, when the page loads, then access follows the existing V11 project access rules — V12 does not change member access.
- Given the project dashboard shows status filters (FCS / PRCC / All), when the user filters to PRCC, then only PRCC assessments captured to this project are shown.

---

<a id="REQ-prcc-reporting-and-visibility-unified-my-assessments"></a>

### Story 3.3: Unified My Assessments queue (FCS + PRCC, pending + completed)

**As any** authenticated user enrolled as a participant on at least one assessment,
**I want to** see all my assessments — FCS and PRCC, pending and completed — in a single queue with filters,
**so that** I have one destination for everything I am responsible for, and a single place to revisit completed assessments for learning.

**Acceptance Criteria:**

- Given the signed-in user is enrolled as a participant on at least one assessment, when they visit `/assessments`, then the page lists every assessment where they appear in `assessment_participants`, regardless of type (FCS or PRCC) or status (pending, submitted, completed, skipped, failed, passed).
- Given an assessment where the user's `assessment_participants.status = 'removed'`, when `/assessments` loads, then it is NOT listed.
- Given an assessment that has been superseded (`superseded_by` set, `status = 'invalidated'`), when `/assessments` loads, then only the latest assessment in the chain appears — the invalidated one is hidden.
- Given each row in the queue, when it renders, then it shows: type label (FCS / PRCC), context project name (or "—" for PRCC assessments without a project link), repo + PR# (PRCC) or feature name (FCS), the user's own status (Pending / Submitted / Completed), the team outcome when finalised (Passed / Failed / Skipped + aggregate score for Hard mode), and a link to the appropriate detail or results page.
- Given the project filter (V11 Story 2.3a) is set to project P, when the queue refreshes, then only assessments whose `project_id = P.id` are shown; PRCC assessments without a project link are excluded by this filter.
- Given the type filter is set to PRCC, when the queue refreshes, then only PRCC rows are shown; set to FCS shows only FCS rows; set to All shows both.
- Given the status filter is set to Completed, when the queue refreshes, then only assessments with terminal status (`completed`, `skipped`, conclusion `passed` / `failed`) are shown.
- Given the user lands on `/assessments`, when no filter is set, then the default status filter is Pending.
- Given the user has no pending assessments but has completed ones, when the default Pending filter is applied, then the empty state reads "No pending assessments — switch to Completed to review past activity" with a one-click filter switch.
- Given the user has no assessments at all, when the page loads with any filter, then the empty state reads "You have no assessments yet".
- Given the V11 page was titled "My Pending Assessments", when V12 ships, then the page title and NavBar label become "My Assessments"; no separate pending-only page exists.

> **Queue contract (extends V11 Story 2.3 / 2.3a):**
> - **Items shown:** every assessment where the signed-in user is enrolled as a participant, regardless of type (FCS or PRCC) or status (pending, submitted, completed, skipped). Excludes assessments where the user was removed (`status = removed`) and assessments superseded by a regeneration (only the latest in a `superseded_by` chain appears).
> - **Each row shows:** type label (FCS/PRCC), context project name (always shown when set — for PRCC this is the link target; for FCS this is the owner project), repo + PR# (PRCC) or feature name (FCS), the user's own status (Pending / Submitted / Completed), the team outcome when the assessment is finalised (Passed / Failed / Skipped + aggregate score), and a link to the appropriate detail or results page.
> - **Filters:** project (V11 Story 2.3a, retained), type (FCS / PRCC / All), status (Pending / Submitted / Completed / Skipped / All). Default view: Pending.
> - **Empty states:** distinct empty states for "no pending" and "no items at all".
> - **PRCC items without a project link** show "—" or "(no project)" in the project column. Type/status filters still apply.

> **Renames V11's "My Pending Assessments" → "My Assessments".** Glossary updated. The pending-only V11 view becomes the default filter on the unified queue, not a separate page.

---

<a id="REQ-prcc-reporting-and-visibility-admin-access-my-assessments"></a>

### Story 3.3a: Admin access to My Assessments (NavBar wiring only)

**As an** Org Admin or Repo Admin,
**I want** the "My Assessments" link in the NavBar so I can reach `/assessments` from any page,
**so that** I have the same path to my own participation queue that Org Members do.

**Acceptance Criteria:**

- Given the signed-in user is an Org Admin or Repo Admin, when any page renders, then the NavBar shows a "My Assessments" link pointing to `/assessments`.
- Given the admin clicks "My Assessments" in the NavBar, when `/assessments` loads, then it shows the unified queue defined by Story 3.3, scoped to the admin's own participations (no admin-mode "view all" toggle on this page).
- Given an Org Member, when any page renders, then the NavBar already shows "My Assessments" (existing V11 behaviour) — V12 does not add a duplicate link or alter the member NavBar.
- Given the admin has zero assessments where they are personally enrolled as a participant, when they click "My Assessments", then the page shows the empty state from Story 3.3 ("You have no assessments yet").

> **Confirmed by L433: the queue itself has no admin/member distinction.** `/assessments` is the same page, same query, same display for everyone — scoped to the signed-in user's own participations. Story 3.3 is the queue spec; Story 3.3a is **only** the navigation wiring (admin NavBar gains the link; the route was already accessible). Considered merging into Story 3.3 — kept separate so the navigation change is its own commit.

---

<a id="REQ-prcc-reporting-and-visibility-prcc-in-org-overview"></a>

### Story 3.4: PRCC assessments in organisation assessment overview

**As an** Org Admin or Repo Admin,
**I want to** see PRCC assessments in the organisation-level overview, with row-level access scoped to my admin reach,
**so that** I can monitor PRCC activity but cannot peek at repos I do not administer.

**Acceptance Criteria:**

- Given the signed-in user is an Org Admin, when they visit the org-level assessment overview, then PRCC assessments from all repos in the org are listed (including PRCC assessments without a project link).
- Given the signed-in user is a Repo Admin (admin of at least one org repo in GitHub), when they visit the org-level overview, then all PRCC assessments in the org are listed; rows show repo name, PR#, type, outcome, date — metadata only.
- Given a Repo Admin clicks a row for a repo they administer, when the detail loads, then the Story 3.1 results page is shown with admin-level visibility (rubric + reference answers + team aggregate; not other participants' answer text or per-participant scores).
- Given a Repo Admin clicks a row for a repo they do NOT administer, when the click is handled, then the user sees access denied (or the row is rendered non-clickable from the start with a tooltip explaining the limitation).
- Given an Org Member attempts to access the org overview URL, when access is checked, then the page returns access denied — their queue is `/assessments` (Story 3.3).
- Given a list row, when it renders, then it shows only metadata already visible in GitHub itself (PR#, repo name, outcome, date) — no rubric content, no answer text, no scores.
- Given a Repo Admin who is also a participant on an assessment for a repo they do NOT administer, when they click that row in the org overview, then they see access denied (the participant role to that assessment is reachable via `/assessments` from Story 3.3, not from the org overview).

> **Access matrix (responds to L452):**
>
> | Role | List visibility | Detail visibility |
> |---|---|---|
> | **Org Admin** | All PRCC assessments in the org | All assessments — full results |
> | **Repo Admin** | All PRCC assessments in the org **as a list** (rows show repo name, PR#, type, outcome, date) — agreed per L452 | Detail (Story 3.1 results page) only for assessments on **repos they administer**. Clicking a row for a non-admin repo → access denied page or row is non-clickable. |
> | **Org Member** | Not accessible (their queue is `/assessments`, not the org overview) | — |
>
> Rationale: a Repo Admin needs to see org-wide PRCC activity to coordinate with peers ("which repos are flunking?") but should not be able to read the rubric / scores for repos they have no GitHub admin role on. List rows leak only metadata that is already visible in GitHub itself (PR number, repo, outcome). Detail leaks rubric content + answers.

---

<a id="REQ-prcc-reporting-and-visibility-prcc-metadata-export"></a>

### Story 3.5: PR metadata export

**As an** Org Admin,
**I want** PRCC aggregate score and outcome stored in the Check Run summary in a machine-readable format,
**so that** external metrics systems can consume the data.

**Acceptance Criteria:**

- Given a completed PRCC assessment with `conclusion = 'passed'` or `'failed'`, when the Check Run summary is updated, then it includes a machine-readable block (HTML comment containing JSON, or a fenced JSON code block) carrying: `assessment_id`, `aggregate_score` (Hard mode only), `threshold` (Hard mode only), `enforcement_mode`, `outcome`, and `participant_count`.
- Given external systems read the Check Run via the GitHub API, when they parse the summary, then the machine-readable block has stable delimiters (e.g. `<!-- prcc:metadata-start -->` / `<!-- prcc:metadata-end -->`) so it can be extracted without parsing the prose.
- Given a skipped assessment (`status = 'skipped'`), when the Check Run summary is composed, then the metadata block is omitted (no metrics to report); the human-readable skip reason remains.
- Given an errored assessment (`rubric_failed` or `scoring_failed`), when the Check Run summary is composed, then the metadata block is omitted.
- Given the metadata block is included, when displayed in the GitHub UI, then it does not visually clutter the human-readable summary (rendered inside an HTML comment so it is hidden from human view but readable via the API).
- Given the metadata block schema, when it is documented in design notes, then the field set is fixed for V12 (additions in future versions are non-breaking — consumers ignore unknown fields).

---

## Cross-Cutting Concerns

### Security & Authorisation

- PRCC assessment creation is system-initiated (webhook), not user-initiated. The webhook handler authenticates via GitHub signature verification (existing pattern in `POST /api/webhooks/github`).
- PRCC gate skip is available to Org Admin (any repo) and Repo Admin (repos they administer).
- Existing org-scoped RLS policies on `assessments`, `assessment_questions`, `assessment_participants`, and `participant_answers` extend to PRCC assessments without change.
- The Check Run link is the primary access path for participants. Org members also discover assessments via `/assessments` (Story 3.3 / 3.3a).

> **External contributors — V12 scope.** PRCC is org-members-only in V12. If a PR author is not an org member, they are not enrolled as a PRCC participant; required reviewers (org members) still answer; the gate runs on reviewer answers only. The OSS-maintainer use case (Soft mode for contributor self-check) is real and deferred to V13 with its own design (likely a single-assessment auth scope and dedicated ADR). See "What We Are NOT Building".

### Data Integrity

- A PRCC assessment always has `repository_id` (NOT NULL, same as today). `project_id` is set from the repo→project link at creation time if the repo is linked to a project; otherwise it is NULL.
- Repo→project link changes do not retroactively affect existing assessments. Each assessment captures its `project_id` at creation.
- PRCC rubric generation uses project context at the time of assessment creation if a project is linked. Context changes do not retroactively affect existing assessments.

### Context Resolution

- PRCC rubric generation reads project-level context (glob patterns, domain notes) from the project linked to the assessment's repo at creation time. Same resolution path as FCS (Story 3.2 in V11). If no project is linked, rubric generation proceeds with no injected context (code-only).
- Repo-level **exempt file patterns** are applied during artefact fetching for context filtering — files matching the patterns are excluded from the LLM prompt (e.g. lockfiles, snapshots). They do **not** trigger an automatic PRCC skip — see §Skip semantics under Story 2.7.
- PRCC question count comes from the repo-level setting (`repository_config.prcc_question_count`), alongside the other repo-level operational settings.

### Observability

- All PRCC webhook events logged with: event type, repository, PR number, action taken, and assessment ID (if created).
- Check Run state transitions logged: created → in_progress → completed (success/failure/neutral).
- LLM calls for PRCC rubric generation and scoring use the same structured logging as FCS.
- PRCC-specific metrics: webhook-to-assessment latency, assessment completion rate, skip rate, pass/fail rate per repo.

### Existing Artefacts Preserved

- The shared assessment engine (rubric generation, scoring, aggregate calculation) is unchanged. PRCC is a new consumer of the same engine.
- The existing `POST /api/webhooks/github` route gains PR event handling. Installation event handling is unchanged.
- The existing assessment answering form, results page, and assessment list components are extended to handle PRCC assessments — not duplicated.

### Reference Answer Visibility

See **Design Principle 9** and **Story 3.1 visibility contract**. Revises V1 Story 3.4 and Story 6.1: rubric (incl. reference answers) becomes visible to participants and admins after `status = completed`; per-participant individual scores remain private; other participants' submitted answer text is never shown.

---

## What We Are NOT Building

- **Repo-level PRCC context (deferred, not rejected).** V12 sources PRCC context only from the linked project. There is no separate "PRCC context" configuration on the repo independent of the project. If no project is linked, PRCC proceeds without injected context. A future enhancement may add a repo-level context block that overrides the project link (so the project link becomes a fallback) — explicitly out of scope for V12 but the data model should not preclude it.
- **Multiple projects per repo.** A repo links to exactly one project. Multi-project repo membership is out of scope.
- **PR decorator (V1 Epic 7).** Exploratory reflection questions posted as PR comments. Deferred to a future version.
- **PRCC self-reassessment.** Unlike FCS (Story 3.6), PRCC is a gate — new commits trigger a new assessment, not a self-directed re-answer.
- **Per-participant individual scores visible to others.** A participant sees their own scored answers; nobody sees another participant's per-question score or submitted answer text. Only the team aggregate is shared.
- **Branch protection integration.** PRCC gates via Check Run only. Required status check configuration in GitHub branch protection is the repo admin's responsibility, not an in-app feature.
- **PRCC on draft PRs.** PRCC triggers only when a PR is opened as ready or moved from draft to ready. Draft PRs are ignored.
- **Custom prompt templates per repo.** V12 uses the same fixed prompt templates as FCS (Naur's three layers). Customisable per-repo is a future enhancement.
- **PRCC for non-GitHub repos.** GitHub only, same as V1.
- **Repo→project bulk linking.** One repo at a time. Bulk operations deferred.
- **PRCC participation by non-org-member authors (OSS-maintainer use case).** External contributors (PR authors who are not org members) are not enrolled as PRCC participants in V12. Required reviewers (org members) still answer; the PRCC gate is on reviewer answers only. The OSS-maintainer use case (Soft mode running on contributor PRs to gauge contributor understanding) is real but deserves its own design — deferred to V13. See OQ 7 resolution.

---

## Open Questions

All Gate-1 OQs are resolved as of rev 6. Full resolution log is in the table below for traceability; no item still requires user input before AC writing.

| # | Status | One-line resolution |
|---|--------|---------------------|
| 1 | Resolved (rev 2, refined rev 4) | Repo→project link is optional; if linked, project context feeds rubric; URL is `/assessments/[aid]` either way (DP 3). |
| 2 | Resolved | PRCC question count lives on `repository_config.prcc_question_count` alongside the other repo-level operational settings. |
| 3 | Resolved | Repo Admin can skip PRCC on their admin repos; Org Admin can skip on any repo (Story 2.7). |
| 4 | Resolved (rev 3, confirmed rev 4) | `/assessments` is a unified queue (FCS+PRCC, pending+completed), filterable; admins have access via NavBar (Story 3.3a). |
| 5 | Resolved (rev 3, confirmed rev 4) | After completion, participants see full rubric incl. reference answers + own scored answers. Applies to PRCC and FCS (DP 9, revises V1 Story 3.4 / 6.1). |
| 6 | Resolved (rev 4) | One URL shape per assessment type — PRCC `/assessments/[aid]`, FCS `/projects/[pid]/assessments/[aid]` (DP 3). |
| 7 | Resolved (rev 5) | PRCC is org-members-only in V12. OSS / external-contributor case deferred to V13. |
| 8 | Resolved (rev 5) | Story 2.2 keeps artefact extraction bundled; reuses existing FCS extraction code; the "> 50 files" V1 heuristic dropped in favour of the model's context-window bound. |
| 9 | Resolved (rev 6) | Skip marker token: `[skip-prcc]` only, case-sensitive (Story 2.7). |
| 10 | Resolved (rev 6) | Trigger model: open / ready-for-review (V1 default). Merge-time alternative considered and deferred (Story 2.8). |
| 11 | Resolved (rev 6) | Retroactive skip: both paths supported — `[skip-prcc]` in subsequent commit/comment OR in-app admin action (Story 2.7). |

---

## Next Steps

1. Gate 2 review — confirm ACs are testable and complete; raise `[Review]` markers where needed.
2. On Gate 2 sign-off, run `/kickoff docs/requirements/v12-requirements.md` to produce HLD, ADRs, and implementation plan.

---

## Testability Validation (rev 7)

Scanned every AC across 20 stories. No vague qualifiers ("appropriate", "user-friendly", "fast", "secure" without measurable criteria) found. Negative cases covered: invalid input (Story 1.2 threshold/count bounds), permission denied (Stories 1.1, 1.2, 1.3, 1.4, 2.7, 3.1, 3.4), not found / removed (Story 2.1 reviewer removed), concurrent / mid-flight state (Stories 1.4 mid-flight link change, 2.4 invalidated submission, 2.7 partial-skip), API failure (Stories 2.2, 2.3, 2.5, 2.6, 2.9). Each AC names a concrete observable outcome (column rendered, status value persisted, HTTP code returned, Check Run state). No issues blocking Gate 2.

Two intentionally-soft items, called out explicitly rather than tightened:

| Story | AC | Reason it is intentionally soft |
|---|---|---|
| 2.3 | "summary refreshed within 30 seconds" | 30s is a target, not a hard SLO — actual bound depends on GitHub API latency. Acceptable to test as "refreshed eventually" with a generous timeout. |
| 2.4 | "unsubmitted text preserved if reloaded within same browser session" | Best-effort, leverages existing FCS form behaviour; no new V12 server-side draft store. Test via existing FCS draft persistence path. |

---

*This document is an artefact that will be used in our own Feature Comprehension Score assessment.*
