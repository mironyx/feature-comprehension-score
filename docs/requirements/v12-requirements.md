# Feature Comprehension Score — V12 Requirements: PR Comprehension Check

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.5 |
| Status | Draft — Structure (Gate 1 — epic-pass review applied; 4 open OQs flagged) |
| Author | LS / Claude |
| Created | 2026-05-02 |
| Last updated | 2026-05-04 (rev 5) |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-05-02 | LS / Claude | Initial structure draft |
| 0.2 | 2026-05-02 | LS / Claude | Gate 1 review: project link optional, PRCC question count from repo, Repo Admin can skip, queue clarified; resolved all 4 OQs |
| 0.3 | 2026-05-03 | LS / Claude | Gate 1 review pass: restored V1 contract gaps (artefact extraction, draft/min-size/exempt skip, trivial commit + debounce); flagged repo schema add (`repositories.project_id`); reworked Story 3.1 — full results visible to PRCC participants after completion (incl. reference answers); reworked Story 3.3 — unified My Assessments queue (FCS+PRCC, pending+completed); added Story 3.3a (admin access to My Assessments); added repo→project unlink to Story 1.4; revised V1 Story 3.4/6.1 reference-answer policy in Cross-Cutting Concerns; new `[Review]` markers for URL shape, external contributor auth, and artefact-extraction story split. |
| 0.4 | 2026-05-04 | LS / Claude | Resolved 6 pre-Epic `[Review]` comments: dropped awkward "PRCC question count is independent" phrasing in Context (it is just one of the repo settings); resolved URL shape — single PRCC URL `/assessments/[aid]`, FCS keeps `/projects/[pid]/assessments/[aid]` (new Design Principle 3, restores V11 invariant, closes OQ 6); confirmed reference-answer revision (DP 9, no softer alternative needed); clarified `/organisation` repos table is an extension of the existing registered-repos tab (no new "PRCC repos" tab); reframed project link as context-source-only with repo-level context as a deferred future enhancement; added External Contributor to Roles table (cross-references OQ 7, still open). |
| 0.5 | 2026-05-04 | LS / Claude | Resolved 14 epic-pass `[Review]` comments. **Major:** introduced unified `[skip-prcc]` skip model in Story 2.7 (replaces V1 `min_pr_size`, exempt-pattern auto-skip, and trivial-commit heuristic with one explicit declarative mechanism + admin override). Story 2.8 rewritten — debounce raised to 5 min configurable, `[skip-prcc]` on push commits replaces "trivial commit" rule, answers retained on invalidation (per L238). Resolved OQ 7 (PRCC org-members-only in V12; OSS use case deferred to V13) and OQ 8 (artefact extraction bundled, reuses existing FCS code). Added Epic 1 layout reference (registered-repos table + per-repo settings page). Story 2.3 Check Run display contract added. Story 2.5 wording aligned with rubric. Story 3.1 explicitly names Repo Admin alongside Org Admin (L376). Story 3.3a clarified as NavBar-only wiring (queue itself is identical for admin/member, per L433). Story 3.4 access matrix added — Repo Admin sees list, detail only for admin repos (L452). New `[Review]` markers on Story 2.7 (skip token + retroactive skip path) and Story 2.8 (trigger model — current open/ready vs merge-time vs hybrid). New OQs 9, 10, 11 (skip token, trigger model, retroactive skip). |

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
**I want to** see all registered repos on the organisation settings page with their PRCC status and (when set) the project that supplies their rubric context,
**so that** I can scan which repos have PRCC active and where they pull their context from.

*(Acceptance criteria in next pass)*

> **Note:** Per Design Principle 2, the project link is a context-source pointer only — a PRCC repo does not "belong to" a project. The repos table column is labelled "Context project" (or similar) to reflect this, not "Project".
---

<a id="REQ-prcc-configuration-change-project-link"></a>

### Story 1.4: Change or remove a repo's project link

**As an** Org Admin or Repo Admin,
**I want to** change a repo's project link to a different project, or remove the link entirely,
**so that** I can reorganise when a repo moves between teams, or run PRCC on a repo without project context.

*(Acceptance criteria in next pass)*

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

*(Acceptance criteria in next pass — see Notes below for the V1 contract this story must preserve.)*

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

*(Acceptance criteria in next pass)*

> **Resolved (rev 5).** Story 2.2 keeps artefact extraction bundled. PRCC reuses the existing FCS extraction code (Token Budget — V5 Epic 1; agentic retrieval — V2 Epic 17 if enabled), with PRCC supplying a single PR as input where FCS supplies multiple merged PRs. The "> 50 files" V1 heuristic is dropped — the actual bound is the model's context window, enforced inside the existing extraction pipeline. OQ 8 closed in rev 5.

> **Story 2.2 ACs (next pass) must specify:**
> - Inputs PRCC supplies to the existing extraction pipeline: PR diff, changed-file contents, PR title/description, linked issue numbers (closing keywords), test files in the PR.
> - Reuse points: token budget (V5 Epic 1) for context-window enforcement; exempt file patterns (Story 2.1 note) for file filtering.
> - The "thin artefacts → thin questions" contract — no failure if artefacts are sparse, the rubric just reflects what was available.
> - Where PRCC differs from FCS extraction (single PR vs multiple merged PRs) — list the specific call-site differences only; do not re-implement shared steps.
---

<a id="REQ-prcc-webhook-and-assessment-flow-check-run-management"></a>

### Story 2.3: GitHub Check Run management

**As a** PR Author or Reviewer,
**I want to** see a GitHub Check Run on the PR with a clear status summary at every lifecycle stage,
**so that** I know what is required of me and what the current outcome is.

*(Acceptance criteria in next pass — see Notes below for the Check Run display contract.)*

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

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-webhook-and-assessment-flow-relevance-validation"></a>

### Story 2.5: Relevance validation (Soft mode)

**As the** system,
**I want to** validate each participant's answers against the rubric for relevance in Soft mode,
**so that** the gate has meaning even without a score threshold — gibberish or copy-paste answers are caught while genuine attempts pass.

*(Acceptance criteria in next pass — relevance is a binary check against each rubric question; reuses the existing relevance detection from V1 Story 4.4.)*
---

<a id="REQ-prcc-webhook-and-assessment-flow-score-based-evaluation"></a>

### Story 2.6: Score-based evaluation (Hard mode)

**As the** system,
**I want to** score participant answers against the rubric in Hard mode and enforce the score threshold,
**so that** merge is blocked when aggregate comprehension is insufficient.

*(Acceptance criteria in next pass)*

---

<a id="REQ-prcc-webhook-and-assessment-flow-prcc-gate-skip"></a>

### Story 2.7: PRCC gate skip — `[skip-prcc]` marker + admin override

**As a** PR author or admin,
**I want to** skip the PRCC gate either declaratively (a marker in the PR body, a commit message, or a PR comment) or by an admin action,
**so that** trivial PRs, emergency hotfixes, and scope-irrelevant PRs do not require a comprehension assessment, without relying on opaque automatic heuristics.

*(Acceptance criteria in next pass — see §Skip semantics below for the unified skip model that this story implements.)*

---

### Story 2.7 supplement — §Skip semantics (unified skip model, V12 revision)

V1 specified three independent skip rules: small PRs (`min_pr_size`), exempt-only file changes (`exempt_file_patterns`), and "trivial commits" on push (`trivial_commit_threshold`). V12 collapses all of these into one explicit, declarative mechanism plus an admin override.

**The `[skip-prcc]` marker.** PRCC is skipped when any of the following is present:

1. **PR body** — the literal string `[skip-prcc]` (or configurable alias) appears anywhere in the PR description.
2. **Commit message** — the literal string `[skip-prcc]` appears in the message of the PR's HEAD commit (or any commit since the last PRCC trigger, if the PR has been updated).
3. **PR comment** — a top-level PR comment by an Org Admin, Repo Admin, or the PR author whose body is `[skip-prcc]` (optionally followed by `: <reason>`).
4. **Admin action in-app** — Org Admin (any repo) or Repo Admin (their repos) clicks "Skip PRCC" on the assessment page with a mandatory reason.

When skipped:
- Check Run conclusion = `neutral`.
- Check Run summary names the skip source (e.g. "Skipped via `[skip-prcc]` in PR body" / "Skipped by @alice: hotfix for prod incident").
- Skip metadata recorded on the assessment row: `skip_reason`, `skipped_by` (user or `system` if marker-driven), `skipped_at`.
- Skipped assessments appear in `/assessments` (if user is a participant) and in the org overview (Story 3.4) with outcome `Skipped`.

**Dropped from V12 (was in V1):**
- Automatic skip on PR size below `min_pr_size`.
- Automatic skip on all-files-match-`exempt_file_patterns`.
- Automatic skip on "trivial commit" heuristic in Story 2.8 (replaced by `[skip-prcc]` on push).

`exempt_file_patterns` is **kept** but repurposed for context filtering only — see Story 2.1 note.

**Schema impact.** No new columns — existing `skip_reason` / `skipped_by` / `skipped_at` columns on `assessments` already cover this. The marker source goes into `skip_reason` as free text. `min_pr_size` and `trivial_commit_threshold` columns become unused; we leave them in `repository_config` for now (no destructive migration in v12) but flag them as deprecated.

**Open Question 9 — marker token.** `[skip-prcc]` is the proposed token. Aliases? Three options on the `[Review]` marker below.

> **[Review]: Skip marker token.** Options:
> - **(a) `[skip-prcc]` only** — explicit and PRCC-specific; coexists with `[skip ci]` and similar without ambiguity. Recommended.
> - **(b) `[skip-prcc]` + `[skip prcc]` + case-insensitive variants** — forgiving on punctuation and casing. Slightly more parsing.
> - **(c) Repurpose `[skip ci]`** — many CI systems already understand this. PRCC users wouldn't need to learn a new token. Risk: skips PRCC even when the user intended only to skip CI.

> **[Review]: Forgotten marker — admin retroactive skip.** L321 raised the question of what happens if the author forgets `[skip-prcc]`. Two options once an assessment has been generated:
> - **(a) Author or admin adds `[skip-prcc]` in a subsequent comment** — webhook re-evaluates and skips. Question: what happens to in-flight participants who already started? Their answers are retained (per L238 rule); status flips to `Skipped` and no further answers required.
> - **(b) Admin uses in-app "Skip PRCC" action** — same effect, no comment needed. Already covered in skip source 4 above.
> Recommend supporting both. Authors and reviewers prefer (a) (in-context); admins handling exceptions prefer (b).

---

<a id="REQ-prcc-webhook-and-assessment-flow-pr-update-handling"></a>

### Story 2.8: PR update handling

**As the** system,
**I want to** handle new commits pushed to a PR under assessment, debouncing rapid pushes and honouring `[skip-prcc]` markers,
**so that** the assessment reflects the current state of the PR, cannot be gamed by answer-then-push, and does not regenerate for minor fixes when the author marks the commit as skip-worthy.

*(Acceptance criteria in next pass — see contract below.)*

> **PR update contract (V12 revision):**
> - **In-progress + new commits without `[skip-prcc]` → invalidate + regenerate.** Existing assessment marked `invalidated`, `superseded_by` set on the new assessment. Participants who already answered must answer again. Their previous answers are **retained** on the invalidated assessment row (per L238 rule — never deleted).
> - **In-progress + new commits with `[skip-prcc]` in the commit message → no regeneration.** The commit is treated as not-PR-relevant. Existing assessment continues. (Replaces V1's "trivial commit" heuristic — author declares intent explicitly instead of relying on a line-count heuristic.)
> - **Completed + new commits without `[skip-prcc]` → new assessment, history retained.** Previous assessment kept; new assessment created and linked via `superseded_by`.
> - **Completed + new commits with `[skip-prcc]` → no new assessment.** Marker treats the push as PRCC-irrelevant; previous outcome stands.
> - **No commits → status unchanged.**
> - **Debounce.** Multiple commits within the configurable debounce window (`repository_config.regen_debounce_seconds`, default `300` — 5 minutes) collapse to a single regeneration. Old V1 default of 60s is too short in practice; raise to 5 min and make configurable per repo.
> - **UX notice in answering form.** "Finish your PR before requesting review — new commits will require a new assessment, unless you tag them with `[skip-prcc]`."

> **L348 / partial-skip status.** If `[skip-prcc]` arrives **after** the assessment was generated and partially answered, the assessment is marked `Skipped` with the marker as the reason. Submitted answers are retained on the row (audit / learning). The Check Run becomes `neutral`. There is no separate "partial skip" status — `Skipped` plus the participant-level submission counts already convey the picture. (Recommend; happy to add a `partial_skip` flag if you want it surfaced more strongly.)

---

### §Trigger model — open design fork (L336)

L336 raised a real question: pre-merge debounce does not help if a PR sits open for days. Three live options for the **trigger model** — when does PRCC fire?

| Option | Trigger | Author experience | Risk |
|---|---|---|---|
| **(a) Open / ready-for-review (current V1 + V12 default)** | When PR opened, draft→ready, or reviewer added. | Author answers up front; questions visible alongside review. | Stale PRs accumulate; if author keeps PR open while iterating, debounce only goes so far. |
| **(b) Merge-time only (L336 radical)** | When user attempts to merge (e.g. `pull_request` `closed` with `merged: false` / pre-merge check). | Author works freely; gate fires at the actual merge moment. | GitHub's merge UX must be willing to wait for PRCC; assessment is the slowest part of the path to green. Reviewers may already have approved before they know about PRCC. |
| **(c) Hybrid — author opt-in.** | Default open / ready-for-review (a). Author can defer with `[defer-prcc]` marker to say "don't trigger until I push without that marker or remove it". | Author chooses. | Two paths to support; harder to reason about. |

> **[Review]: Trigger model.** Recommend (a) for V12 as the simplest match to existing infrastructure (webhook handlers, Check Run lifecycle). (b) is a real product re-think — interesting but worth testing the assumption with the partner customer first. (c) is a compromise that probably collects the worst of both. Pick:
> - **(a) Keep open/ready trigger** (default). Add the `[skip-prcc]` model to handle "don't bother me yet" cases.
> - **(b) Move to merge-time trigger.** Re-scope Story 2.1 events list (remove `opened`, `ready_for_review`, `review_requested`; add `merge attempted` detection — typically via a required-status-check pattern).
> - **(c) Hybrid with `[defer-prcc]`** — both events fire, marker controls.

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

**As a** PRCC participant, Org Admin, or Repo Admin,
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
> **Note:** This is the principal V1 reversal, confirmed in rev 4. V1 Story 6.1 explicitly forbade reference answers on PRCC results pages ("to prevent answer sharing on future PRs"). V12 reverses that for both PRCC and FCS — see Design Principle 9 for the Naur Theory Building rationale.

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

*(Acceptance criteria in next pass — trivially small story.)*

> **Confirmed by L433: the queue itself has no admin/member distinction.** `/assessments` is the same page, same query, same display for everyone — scoped to the signed-in user's own participations. Story 3.3 is the queue spec; Story 3.3a is **only** the navigation wiring (admin NavBar gains the link; the route was already accessible). Considered merging into Story 3.3 — kept separate so the navigation change is its own commit.

---

<a id="REQ-prcc-reporting-and-visibility-prcc-in-org-overview"></a>

### Story 3.4: PRCC assessments in organisation assessment overview

**As an** Org Admin or Repo Admin,
**I want to** see PRCC assessments in the organisation-level overview, with row-level access scoped to my admin reach,
**so that** I can monitor PRCC activity but cannot peek at repos I do not administer.

*(Acceptance criteria in next pass — see access matrix below.)*

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

*(Acceptance criteria in next pass)*

---

## Cross-Cutting Concerns

### Security & Authorisation

- PRCC assessment creation is system-initiated (webhook), not user-initiated. The webhook handler authenticates via GitHub signature verification (existing pattern in `POST /api/webhooks/github`).
- PRCC gate skip is available to Org Admin (any repo) and Repo Admin (repos they administer).
- Existing org-scoped RLS policies on `assessments`, `assessment_questions`, `assessment_participants`, and `participant_answers` extend to PRCC assessments without change.
- The Check Run link is the primary access path for participants. Org members also discover assessments via `/assessments` (Story 3.3 / 3.3a).

> **External contributor sign-in — the OSS-maintainer use case (responds to L484).** L484 reframes the question concretely: the use case for external contributors is the OSS-maintainer scenario — the maintainer (org member) wants Soft mode running on contributor PRs to gauge whether the contributor understands their own change before the maintainer invests review time. The question is "is it worth the complication?"
>
> **Recommendation: defer to V13. V12 ships PRCC as org-members-only.**
> - **Rationale:** Your immediate users (and the dogfooding case) are internal teams where authors and reviewers are all org members. The OSS use case is real but narrower; it deserves its own design (likely centred on Soft mode, no admin actions, single-assessment auth scope) and probably a dedicated ADR.
> - **What V12 does:** if a PR author is not an org member, they are simply not enrolled as a PRCC participant. Required reviewers (org members) still answer; the gate is on reviewer answers only. This is what V1 quietly assumed but never specified.
> - **What changes in `What We Are NOT Building`:** add "PRCC participation by non-org-member authors (the OSS-maintainer / external contributor use case) — V13".
>
> **Reasonable, or push back?** If the OSS use case is more central than I think, say so and I'll re-open this with a Story-2.4-onwards external-author path.

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

### Reference Answer Visibility (revises V1 Story 3.4 and 6.1)

- **PRCC and FCS are aligned.** Once an assessment reaches `status = completed` (all participants either submitted or marked `did_not_participate`, scoring finalised), the rubric — questions, reference answers, weights — becomes visible on the results page to: (a) every participant on that assessment, viewing their own scored answers alongside; (b) Org Admins / Repo Admins, without other participants' submitted answer text or per-participant scores.
- **Rationale (Naur Theory Building).** The reference answer is the most concentrated artefact of design intent the rubric produces. Withholding it from the people who already engaged with the questions removes the strongest learning moment. The Check Run remains the audit/team surface; the in-app results page is the learning surface.
- **What is still private.** Per-participant individual scores remain visible only to the participant themselves. Other participants' submitted answer text is never shown.
- **V1 lines this revises.** V1 Story 3.4 ("Reference answers are **not** shown in the self-view"); V1 Story 6.1 ("the questions (reference answers NOT shown for PRCC — prevents answer sharing on future PRs)"). See Design Principle 9 for the rationale.

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

| # | Question | Context | Options | Impact |
|---|----------|---------|---------|--------|
| 1 | **Resolved (rev 2, refined rev 4).** Project link is optional. PRCC can be enabled on any registered repo with or without a project link. If linked, the project's context is used; if not, code-only context. PRCC URL shape is `/assessments/[aid]` regardless of link status — see OQ 6 / Design Principle 3. | — | — | — |
| 2 | **Resolved.** PRCC question count is one of the repo-level operational settings on `repository_config.prcc_question_count`, alongside enforcement mode, threshold, min PR size, and exempt patterns. The project's FCS question count is a separate setting on a separate entity. | — | — | — |
| 3 | **Resolved.** Repo Admin can skip PRCC gates on repos they administer. Org Admin can skip on any repo. Updated Story 2.7 and Roles table accordingly. | — | — | — |
| 4 | **Resolved (rev 2), then revised (rev 3).** Originally: queue is pending-only. Revised: `/assessments` is now a unified queue of FCS+PRCC, pending+completed, filterable by project/type/status. Completed items show outcome and aggregate score. Admins also have access (Story 3.3a). External contributor sign-in is now a separate open question — see OQ 7. | — | — | — |
| 5 | **Resolved (rev 3, confirmed rev 4).** PRCC participants see the full rubric (questions, reference answers, weights), their own submitted answers, and their own per-question scores once an assessment is `completed`. Same policy applies to FCS. Other participants' individual scores remain private. Revises V1 Story 3.4 and V1 Story 6.1. Rationale: Naur Theory Building learning surface; AI-era reality of solo human reviewer. See Design Principle 9. | — | — | — |
| 6 | **Resolved (rev 4).** PRCC always uses `/assessments/[aid]`; FCS always uses `/projects/[pid]/assessments/[aid]`. The PRCC assessment may carry a `project_id` (when the repo is linked) but the link is purely a context-source pointer and does not embed in the URL. Restores the V11 invariant of one URL per assessment type. See Design Principle 3. | — | — | — |
| 7 | **Resolved (rev 5).** PRCC is org-members-only in V12. Non-org-member PR authors are not enrolled as participants; reviewers (org members) still answer; gate is on reviewer answers. The OSS-maintainer use case (Soft mode for external contributors) is real but deferred to V13 with its own design. See "What We Are NOT Building" entry. Push back via L484 review marker if this is wrong. | — | — | — |
| 8 | **Resolved (rev 5).** Artefact extraction stays bundled into Story 2.2 ACs. PRCC reuses existing FCS extraction code (token budget V5 E1, agentic retrieval V2 E17). The "> 50 files" V1 heuristic is dropped — the actual bound is the model's context window, enforced by the existing extraction pipeline. See Story 2.2. | — | — | — |
| 9 | **Open (new in rev 5).** Skip marker token. Replaces V1's automatic skip rules (min PR size, exempt-pattern auto-skip, trivial-commit heuristic). Options on Story 2.7 `[Review]` marker: (a) `[skip-prcc]` only; (b) `[skip-prcc]` + variants; (c) repurpose `[skip ci]`. | Author UX, parser simplicity, collision with CI tools | (a) explicit token; (b) lenient parser; (c) reuse `[skip ci]` | Author learnability vs collision risk |
| 10 | **Open (new in rev 5).** Trigger model — when does PRCC fire on a PR? Options on Story 2.8 `[Review]` marker: (a) open / ready-for-review (current default); (b) merge-time only (L336 radical); (c) hybrid with `[defer-prcc]`. | Author workflow, PR staleness, GitHub merge UX integration | (a) open/ready; (b) merge-time; (c) hybrid | Webhook surface, author iteration cycle, reviewer ordering |
| 11 | **Open (new in rev 5).** Forgotten skip marker — admin retroactive skip path. Options on Story 2.7 `[Review]` marker: (a) author/admin adds `[skip-prcc]` in subsequent comment → webhook re-evaluates; (b) admin uses in-app "Skip PRCC" action only. Recommend supporting both. | UX for skipping after assessment generated | (a) comment marker; (b) in-app only | Comment-parser surface, admin friction |

---

## Next Steps

1. Address remaining `[Review]` markers (rev 5) — four open, all design choices on the new skip / trigger model:
   - **Story 2.7** — Skip marker token (OQ 9) and forgotten-marker retroactive path (OQ 11).
   - **Story 2.8** — Trigger model: open/ready vs merge-time vs hybrid (OQ 10).
   - **Cross-Cutting §Security** — Confirmation that org-members-only is acceptable for V12 (OQ 7 closed pending push-back from L484).
2. Gate 1 sign-off once those four resolve.
3. Write acceptance criteria (Step 4) — including the V1-contract notes captured under Stories 2.1, 2.8, the visibility contract under Story 3.1, the Check Run display contract under Story 2.3, the access matrix under Story 3.4, and the §Skip semantics under Story 2.7.
4. Gate 2: full document review.

---

*This document is an artefact that will be used in our own Feature Comprehension Score assessment.*
