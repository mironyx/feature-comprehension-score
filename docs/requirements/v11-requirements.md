# Feature Comprehension Score — V11 Requirements: Projects

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.7 |
| Status | Draft — Complete |
| Author | LS / Claude |
| Created | 2026-04-29 |
| Last updated | 2026-04-30 (rev 7) |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-04-29 | LS / Claude | Initial structure draft |
| 0.2 | 2026-04-29 | LS / Claude | Address review comments: drop org context fallback for FCS; fix Org Member role; rewrite navigation model (admin vs member); add OQ 3 (PRCC project scoping) and OQ 4 |
| 0.3 | 2026-04-29 | LS / Claude | Resolve all OQs: PRCC deferred; add Config Model section (V1 repo config split); exempt file patterns apply to FCS; nullable repo→project FK as sole foundation work; fix Roles table and Cross-Cutting Concerns |
| 0.4 | 2026-04-29 | LS / Claude | Address review comments: Config Model clarification (PRCC settings don't exist yet); add Repo Admin role; last-visited project persistence (Story 4.6); archive = soft delete; minimise-changes design principle; Story 2.2 rewrite; remove org fallback from Story 3.4 and Epic 3 description; clarify Story 1.4 metadata scope; Story 2.4 entry points |
| 0.5 | 2026-04-29 | LS / Claude | Clarify Repo Admin mechanics: repo selector filtered to user's admin repos; API enforces repo-level access on assessment creation; Story 2.1 and Cross-Cutting Concerns updated |
| 0.6 | 2026-04-30 | LS / Claude | Address review batch: Repo Admin can create/edit projects (not archive); Story 1.1 only `name` required, other settings optional with defaults; admin-only roles on Stories 1.2, 1.3, 1.4, 4.1, 4.2, 4.3 (Org Members work the queue, not the project list); add Story 2.3a project filter on My Pending Assessments; collapse Stories 3.1–3.3 + 3.5 into a single Story 3.1 (combined config + settings page edit); rename "override" → "configure" for question count; clarify org-context tables retained but inert; sign-out clearing of last-visited is intentional (no DB persistence) |
| 0.7 | 2026-04-30 | LS / Claude | Add REQ- anchors per ADR-0026; write Given/When/Then acceptance criteria for all 18 stories; testability validation pass (no blocking issues); add OQ 5 (legacy URL redirect scope); status → Draft — Complete |

---

## Context / Background

The product is currently organised around **organisations** as the primary tenant boundary. Every FCS assessment, repository, and context configuration belongs to an org. This is appropriate for multi-tenancy isolation, but it does not reflect how engineering teams actually work: a team owns a named initiative (a product area, service, or programme), and their assessments should be grouped under that initiative rather than floating at the organisational level.

V11 introduces **Projects** as the primary unit for FCS assessments. A project is a named initiative within an org. It owns its FCS assessments and carries its own context configuration — the architecture documents, domain notes, and question count settings that the LLM uses when generating comprehension questions. This allows different product teams within the same GitHub organisation to configure independent context without polluting each other's assessment quality.

PRCC (PR Comprehension Check) remains org/repo-scoped in this version. The assignment of webhook-triggered assessments to projects requires a separate design (deferred).

No data migration is required — the product is not yet in production.

---

## Glossary

| Term | Definition |
|------|-----------|
| **Project** | A named initiative within an org that groups related FCS assessments and carries its own context configuration. Projects are children of organisations. |
| **FCS Assessment** | A Feature Comprehension Score assessment created manually, targeting a set of merged PRs. In V11, every FCS assessment must belong to a project. |
| **PRCC Assessment** | A PR Comprehension Check triggered automatically by a GitHub webhook. Remains org/repo-scoped in this version. |
| **Project Context** | The per-project configuration injected into the LLM rubric prompt: context file glob patterns, domain notes, and question count. Each project defines its own context independently; there is no org-level fallback for FCS context. |
| **Org Context** | Organisation-level context (glob patterns + domain notes). Exists in the schema but is not actively used in V11. PRCC context (when implemented) will either reference project context or introduce its own configuration. |
| **Project Dashboard** | The project's main page, showing the FCS assessment list and creation entry-point for that project. Scoped to one project at a time. A combined cross-project admin view is a future enhancement; the data model supports it without schema changes. |
| **My Pending Assessments** | A cross-project view showing all FCS assessments where the signed-in user has a pending submission. Shows project name as a label on each item. Filterable by project (Story 2.3a). |
| **Org Admin** | A user with admin or owner role in the GitHub organisation. Full project lifecycle access including archive; configures project context; creates FCS assessments. |
| **Repo Admin** | A GitHub org member with admin access to at least one repo in the org. Can create and edit projects, configure project context, and create FCS assessments (within their admin repos). Cannot archive projects. |
| **Org Member** | A user with member role in the org and no repo admin access. Sees only the FCS assessments they are invited to, in a single queue. No project list, project dashboard, or settings access. |

---

## Design Principles / Constraints

1. **Org is the tenant boundary.** Projects are children of organisations. All RLS policies and data isolation remain at org level. Projects do not introduce a new security boundary.
2. **PRCC product features are deferred from V11.** No PRCC product behaviour changes in this version. The `project_id` FK on PRCC assessments remains nullable (already supported in schema) — the only foundation work needed to avoid future rework. Repos may carry a nullable `project_id` reference as a schema-level link to a project; this is not surfaced in the V11 UI.
3. **Existing schema hook.** `organisation_contexts.project_id` is already nullable in the schema, anticipating this change. Use it for project-level domain notes rather than creating a new table.
4. **No org-level fallback for FCS context.** Project context is the sole LLM configuration source for FCS assessments. If a project has no context configured, the assessment proceeds with no injected context. There is no org-level fallback. Org context exists only for PRCC. This keeps the resolution logic simple and removes a configuration source that has no clear use case for FCS.
5. **No migration.** Product is not in production. No backward-compatibility shims or default-project creation.
6. **Small PRs.** Each story targets < 200 lines of change.
7. **Minimise changes to existing code.** V11 should prefer additive changes (new tables, new routes, new components) over rewrites of existing flows. Refactor existing code only where the project model strictly requires it.

---

## Config Model

Settings from the V1 repo-level config (Story 1.3) are split in V11. This table is the reference for which settings live where; it governs Epic 3 story scope.

| Setting | V11 location | Notes |
|---------|-------------|-------|
| PRCC enabled/disabled | Repo | Unchanged. PRCC deferred. |
| Enforcement mode (Soft/Hard) | Repo | Unchanged. PRCC deferred. |
| Score threshold (Hard mode) | Repo | Unchanged. PRCC deferred. |
| Question count for PRCC | Repo | Unchanged. PRCC deferred. |
| Minimum PR size for PRCC | Repo | Unchanged. PRCC deferred. |
| Exempt file patterns | Repo | Applies to both PRCC and FCS rubric generation (files excluded from context fetching). |
| Question count for FCS | **Project** | Moves to project settings (Story 3.3). |
| Context file glob patterns | **Project** | New; was org-level in V1 (Story 3.1). |
| Domain notes | **Project** | New; was org-level in V1 (Story 3.2). |
| Repo → project link | Repo (schema only) | New nullable FK on repo. Foundation for future PRCC project scoping. Not surfaced in UI in V11. |

Repo-level settings remain editable via the `/organisation` settings page. Project-level settings are on the `/projects/[id]/settings` page.

> **Note:** PRCC repo-level settings (rows 1–5 above) do not exist in the current codebase — they are listed here as a reference for future PRCC implementation. Only repo registration exists today. Exempt file patterns (row 6) are a new V11 addition, required for FCS context fetching; there is no existing UI for them.

---

## Roles

| Role | Type | Description |
|------|------|-----------|
| **Org Admin** | Persistent | GitHub org admin/owner. Full access: create, edit, and archive projects; configure project context and settings; create FCS assessments. |
| **Repo Admin** | Persistent | A GitHub org member with admin access to at least one repository in the org. Can create and edit projects, configure project settings, and create FCS assessments within projects. When creating an assessment, the repo selector shows only repos where they hold GitHub admin access — not all org repos. Cannot archive projects. GitHub repo membership is checked at runtime — no separate user management. |
| **Org Member** | Persistent | Any authenticated GitHub org member (neither org admin nor repo admin). Can view and submit assessments they have been invited to. No project management access. When explicitly added to an FCS assessment, this role is referred to as **Assessment Participant** — same person, contextual label. |

> **Role determination:** Org Admin and Repo Admin status are derived from the authenticated user's GitHub role (existing pattern). There is no in-app user management. An Org Admin automatically satisfies Repo Admin permissions and sees all org repos in the repo selector.

---

## Navigation Model

Navigation differs by role. Admins are project-centric (they manage projects and create assessments). Members are assessment-centric (they work their queue and do not manage projects).

### Org Admin

After sign-in, admins land on `/projects`.

```
NavBar: [FCS logo]  [Projects]  [Organisation]  [Org: Acme v]  [User v]

/projects                              ← All projects list
/projects/new                          ← Create project form
/projects/[id]                         ← Project dashboard — FCS assessment list
/projects/[id]/assessments/new         ← Create FCS assessment
/projects/[id]/assessments/[aid]       ← Assessment detail / answering form
/projects/[id]/assessments/[aid]/results
/projects/[id]/assessments/[aid]/submitted
/projects/[id]/settings                ← Project context & config

/organisation                          ← Org settings: repos registration, PRCC config, members
```

- `/projects/[id]/assessments/[aid]/results` — results page for a completed assessment.
- `/projects/[id]/assessments/[aid]/submitted` — confirmation page shown to a participant immediately after submitting.
- Last-visited project is persisted per user (see Story 4.6). On sign-in, admins are redirected to their last-visited project rather than the generic `/projects` list.

### Org Member

After sign-in, members land on `/assessments` (My Pending Assessments). Members do not browse a project list — they work their assessment queue. Project name is shown on each assessment item; the list is filterable by project.

```
NavBar: [FCS logo]  [My Assessments]  [Org: Acme v]  [User v]

/assessments                           ← My Pending Assessments (cross-project, filterable by project)
/projects/[id]/assessments/[aid]       ← Assessment detail (reached via list or invitation link)
/projects/[id]/assessments/[aid]/results
/projects/[id]/assessments/[aid]/submitted
```

> **PRCC deferred.** PRCC assessments do not appear in `/assessments` in V11. The member queue is FCS-only. PRCC participants continue to use invitation links directly. No member-facing PRCC list view in V11.


---

## Epic 1: Project Management [Priority: High]

Projects are the new top-level container for FCS work. This epic covers all lifecycle operations for the project entity.

**Rationale:** Foundation epic. Navigation, FCS scoping, and context configuration all depend on projects existing. Must be delivered first.

<a id="REQ-project-management-create-project"></a>

### Story 1.1: Create a project

**As an** Org Admin or Repo Admin,
**I want to** create a project, providing a name and description and optionally any other settings,
**so that** I can group FCS assessments for a team initiative and give the LLM focused context.

**Acceptance Criteria:**

- Given an authenticated Org Admin viewing `/projects/new`, when they submit the form with name `"Payment Service"` and no other fields, then a project is created in their org with that name, default question count, default comprehension level `"conceptual"`, empty glob patterns, and empty domain notes; the user is redirected to `/projects/[id]`.
- Given a Repo Admin submits the form with name + description + glob patterns + domain notes + question count, when the API processes the request, then all submitted values are persisted on the project and its `organisation_contexts` row.
- Given the form is submitted with no name or a name longer than 200 characters, when the API validates, then it returns a 400 with a validation error and no project row is created.
- Given an Org Member POSTs to the project creation endpoint, when the API authorises, then it returns 403 and no project row is created.
- Given two projects with the same name are submitted in the same org, when the second is processed, then it is accepted (project names are not unique within an org).

> **Note:** Only **name** is required on creation. Description and all context settings (glob patterns, domain notes, question count, comprehension level) are optional and have system defaults — e.g. comprehension level defaults to "conceptual", question count defaults to the configured baseline. All optional settings can be edited later on the project settings page (Story 3.1).

---

<a id="REQ-project-management-list-projects"></a>

### Story 1.2: List projects

**As an** Org Admin or Repo Admin,
**I want to** see a list of all projects in my organisation,
**so that** I can navigate to a project's dashboard to view its assessments.

**Acceptance Criteria:**

- Given an Org Admin in org Acme with three active projects, when they navigate to `/projects`, then the page renders a list of those three projects, each showing name, description, and last-updated timestamp.
- Given a Repo Admin signed into the same org, when they view `/projects`, then they see all active projects in the org (the list is not filtered by their repo admin scope).
- Given a project has been archived, when an admin views `/projects`, then the archived project does not appear in the list.
- Given an Org Member requests `/projects`, when the route resolves, then the response is a redirect to `/assessments` (admin-only route).
- Given the org has no active projects, when an admin views `/projects`, then the page shows an empty state with a "Create project" call to action.

> **Note:** Org Members do not access this list — they work the cross-project assessment queue (Story 2.3). The projects list is admin-only.

---

<a id="REQ-project-management-view-project-dashboard"></a>

### Story 1.3: View project dashboard

**As an** Org Admin or Repo Admin,
**I want to** view a project's dashboard showing its FCS assessments,
**so that** I can see all assessments related to that initiative in one place.

**Acceptance Criteria:**

- Given an admin navigates to `/projects/[id]` for an active project, when the page renders, then it shows the project name and description with an inline edit affordance, the FCS assessment list (Story 2.2), and a "New assessment" entry point.
- Given a project has no FCS assessments, when its dashboard loads, then the assessment list shows an empty state with a "Create the first assessment" call to action.
- Given an admin requests `/projects/[id]` where `id` does not exist or belongs to another org, when the route resolves, then the response is a 404.
- Given a project is archived, when an admin opens its dashboard via direct URL, then the dashboard renders an archived banner and the "New assessment" entry point is hidden; existing assessments remain listed and reachable.
- Given an Org Member requests `/projects/[id]`, when the route resolves, then they are redirected to `/assessments`.

> **Note:** This is the per-project assessment list. The cross-project view (all pending assessments filterable by project) is covered in Story 2.3.

---

<a id="REQ-project-management-edit-project"></a>

### Story 1.4: Edit a project

**As an** Org Admin or Repo Admin,
**I want to** edit a project's name and description,
**so that** I can keep the project metadata accurate as the initiative evolves.

**Acceptance Criteria:**

- Given an admin clicks the inline edit affordance on `/projects/[id]` and submits a new name and description, when the API processes the change, then the project row is updated and the dashboard re-renders with the new values.
- Given the submitted name is empty or longer than 200 characters, when the API validates, then it returns a 400 and the project is unchanged.
- Given a Repo Admin submits an edit, when the API authorises, then the change is accepted (Repo Admins can edit metadata).
- Given an Org Member POSTs to the edit endpoint, when the API authorises, then it returns 403 and the project is unchanged.
- Given the request body includes context settings (glob patterns, domain notes, question count), when the inline edit endpoint processes the request, then those fields are ignored — only `name` and `description` are mutated by this endpoint.

> **Note:** Name and description are edited inline on the project dashboard (small form, header pencil icon). Context settings (glob patterns, domain notes, question count) are edited on the project settings page (Story 3.1) because they share a richer editor surface (multi-line notes, glob list editor, defaults). Same data model — different UI surfaces, kept separate to keep each PR small and the dashboard header lightweight.

---

<a id="REQ-project-management-archive-project"></a>

### Story 1.5: Archive a project

**As an** Org Admin,
**I want to** archive a project that is no longer active,
**so that** it no longer appears in the active project list but its historical assessments are preserved.

**Acceptance Criteria:**

- Given an Org Admin invokes archive on an active project, when the API processes the request, then `archived_at` is set on the project row and the project is excluded from `/projects`.
- Given an admin attempts to create an FCS assessment under an archived project, when the API processes the request, then it returns a 422 and no assessment is created.
- Given a project has existing assessments, when it is archived, then those assessments remain accessible at their existing URLs and their data is unchanged.
- Given a Repo Admin invokes archive, when the API authorises, then it returns 403 and the project remains active.
- Given an already-archived project, when archive is invoked again, then the operation is a no-op (`archived_at` is not changed) and the response is 200.

> **Yes — archive = soft delete.** Sets an `archived_at` timestamp on the project row. Archived projects are excluded from the active project list and cannot have new assessments created under them, but all existing assessments and their data are retained and remain accessible via direct URL.

---

## Epic 2: FCS Scoped to Projects [Priority: High]

All FCS assessments must belong to a project. This epic wires the project FK into the FCS creation flow, scopes assessment lists to the project, and provides a cross-project pending view for participants.

**Rationale:** Core product change. Without this, projects are empty containers. Depends on Epic 1.

<a id="REQ-fcs-scoped-to-projects-create-fcs-assessment"></a>

### Story 2.1: Create FCS assessment within a project

**As an** Org Admin or Repo Admin,
**I want to** create an FCS assessment from within a project's dashboard,
**so that** the new assessment is automatically associated with that project.

**Acceptance Criteria:**

- Given an admin on `/projects/[id]/assessments/new` completes the existing FCS form and submits, when the API processes the request, then a new assessment row is created with `project_id = [id]` and the user is redirected to the assessment detail page.
- Given an Org Admin opens the create form, when the repo selector loads, then it lists all repos in the org returned by the GitHub API for the authenticated user.
- Given a Repo Admin opens the create form, when the repo selector loads, then it lists only repos in the org where the GitHub API reports the user as having admin permission.
- Given a Repo Admin submits the form with a repo where they do not hold GitHub admin permission (e.g. by tampering with the request), when the API authorises, then it returns 403 and no assessment is created.
- Given the API receives an assessment creation request without `project_id`, when validation runs, then it returns a 400 and no assessment is created.
- Given an Org Member POSTs to the assessment creation endpoint, when the API authorises, then it returns 403 and no assessment is created.

> **Note:** The assessment creation form and flow are unchanged from the existing FCS creation flow. The only addition is that `project_id` is pre-populated from the current project context and passed to the API on submit.
>
> **Repo selector scoping:** Org Admins see all org repos (unchanged). Repo Admins see only the repos in the org where they hold GitHub admin access. The repo list is fetched from the GitHub API using the authenticated user's token and filtered accordingly. No new UI — the same repo selector component, different data.

---

<a id="REQ-fcs-scoped-to-projects-project-scoped-assessment-list"></a>

### Story 2.2: Project-scoped FCS assessment list

**As an** Org Admin or Repo Admin,
**I want to** see all FCS assessments belonging to the current project when I view a project's dashboard,
**so that** I can track assessment status and progress for that initiative without mixing in assessments from other projects.

**Acceptance Criteria:**

- Given a project with five FCS assessments, when an admin opens the project dashboard, then the list shows exactly those five assessments with status, creation date, and creator.
- Given two projects A and B each with assessments, when an admin views project A's dashboard, then no assessment from project B appears in the list.
- Given a project with no assessments, when its dashboard loads, then the assessment list shows the empty-state component.
- Given the assessment list query, when it executes, then it filters by `project_id` matching the current route's project (verifiable via the API request payload or query log).

---

<a id="REQ-fcs-scoped-to-projects-my-pending-assessments"></a>

### Story 2.3: My Pending Assessments cross-project view

**As an** Assessment Participant,
**I want to** see all FCS assessments where I have a pending submission — across all projects — when I sign in,
**so that** I can find and complete my outstanding assessments without knowing which project they belong to.

**Acceptance Criteria:**

- Given a participant has pending submissions on three FCS assessments across two projects, when they navigate to `/assessments`, then the page lists those three assessments, each labelled with its project name.
- Given a participant has submitted one of the three assessments, when they reload `/assessments`, then the submitted assessment no longer appears in the list.
- Given a participant has no pending FCS assessments, when they view `/assessments`, then the page shows an empty state.
- Given an assessment belongs to an archived project and the participant has a pending submission on it, when they view `/assessments`, then the assessment still appears in the list (archive does not remove participation obligations).
- Given the page is rendered in V11, when the list loads, then it contains only FCS assessments — no PRCC items appear.

---

<a id="REQ-fcs-scoped-to-projects-filter-pending-by-project"></a>

### Story 2.3a: Filter My Pending Assessments by project

**As an** Assessment Participant,
**I want to** filter the My Pending Assessments list by project,
**so that** I can focus on assessments belonging to a specific initiative when my queue is long.

**Acceptance Criteria:**

- Given a participant has pending assessments across three projects, when they open the project filter on `/assessments`, then the filter offers "All projects" plus exactly those three projects (not the full org project list).
- Given a participant selects a project from the filter, when the list re-renders, then it shows only assessments belonging to that project.
- Given a participant selects "All projects", when the list re-renders, then all pending assessments are shown.
- Given a participant has pending assessments in only one project, when the page renders, then the filter control is hidden (single-option picker is not shown).

> **Note:** Filter is a single-select project picker, populated from the distinct projects represented in the participant's pending list (not the full org project list — keeps the picker scoped and avoids leaking project names the user has no relationship to). "All projects" is the default.

---

<a id="REQ-fcs-scoped-to-projects-project-scoped-assessment-urls"></a>

### Story 2.4: Project-scoped assessment URLs

**As an** Assessment Participant,
**I want to** access my assessment via a URL that includes the project context (`/projects/[pid]/assessments/[aid]`),
**so that** deep-links in invitation emails and navigation from My Pending Assessments both resolve correctly in the project-first URL structure.

**Acceptance Criteria:**

- Given an invitation email contains a link to `/projects/[pid]/assessments/[aid]`, when the participant clicks it (and is signed in), then they reach the assessment page directly.
- Given a participant clicks an assessment item in `/assessments`, when navigation completes, then the resulting URL is `/projects/[pid]/assessments/[aid]` (project-first shape).
- Given a request to `/projects/[pid]/assessments/[aid]` where `aid` does not belong to `pid`, when the route resolves, then the response is 404 (project/assessment mismatch is not silently corrected).
- Given an authenticated user navigates to `/projects/[pid]/assessments/[aid]/results` or `.../submitted`, when the route resolves, then the project-scoped path renders the corresponding existing page.

> **Note:** Assessment pages are reachable from two entry points: (1) an invitation email link, and (2) the My Pending Assessments page (Story 2.3). Both paths use the same `/projects/[pid]/assessments/[aid]` URL.

---

## Epic 3: Project Context & Config [Priority: High]

Moves context configuration from org level to project level. Each project gets its own glob patterns, domain notes, and question count. There is no org-level fallback for FCS — if a project has no context configured, rubric generation proceeds with no injected context.

**Rationale:** Core quality driver. Project-scoped context produces more targeted LLM questions. Depends on Epic 1. Can be delivered in parallel with Epic 2.

<a id="REQ-project-context-and-config-configure-project-context-and-settings"></a>

### Story 3.1: Configure project context and settings

**As an** Org Admin or Repo Admin,
**I want to** configure a project's context and settings on a single settings page — context file glob patterns (e.g. `docs/adr/*.md`), free-text domain notes (vocabulary, architectural principles, focus areas, exclusions), and the FCS question count (3–5),
**so that** the LLM question generator has the right context and the right output volume for the project.

**Acceptance Criteria:**

- Given an admin on `/projects/[id]/settings` edits the glob patterns, domain notes, and question count and saves, when the API processes the request, then values are persisted to the `organisation_contexts` row keyed by `project_id`.
- Given a project has no prior context row, when an admin opens settings, then the form renders with empty glob patterns, empty domain notes, and the system default question count selected.
- Given the question count submitted is outside 3–5, when validation runs, then the API returns 400 with a range error and the row is not modified.
- Given a glob pattern is unparseable (e.g. malformed bracket expression), when validation runs, then the API returns 400 identifying the offending pattern and the row is not modified.
- Given a Repo Admin saves changes, when the API authorises, then the changes are accepted (Repo Admins can configure project context).
- Given an Org Member requests `/projects/[id]/settings`, when the route resolves, then they are redirected to `/assessments` (admin-only route).

> **Note:** All three settings live on one settings page (`/projects/[id]/settings`) and one edit form. Combined into a single story to keep PR overhead low — the underlying data model is one row in `organisation_contexts` keyed by `project_id`.
>
> **Question count is a configuration, not an override.** There is no org-level baseline being overridden — each project sets its own count, defaulting to the system default if unset.

---

<a id="REQ-project-context-and-config-rubric-uses-project-context"></a>

### Story 3.2: FCS rubric generation uses project context

**As a** FCS system,
**I want to** use project-level context (glob patterns, domain notes, question count) when generating rubric questions,
**so that** every FCS assessment uses the context configured for its project.

**Acceptance Criteria:**

- Given an FCS assessment is created in project P configured with glob `docs/adr/*.md` and domain notes `"use British English"`, when rubric generation runs, then the LLM prompt contains the file content matched by `docs/adr/*.md` and the domain notes string verbatim.
- Given the project has question count = 4, when rubric generation completes, then the assessment has exactly 4 generated questions persisted.
- Given a project has no `organisation_contexts` row (no context configured), when rubric generation runs, then no context block is included in the LLM prompt, and the org-level context table is not queried.
- Given exempt file patterns are configured at repo level (e.g. `**/*.test.ts`), when context fetching runs for a project glob that would otherwise match those files, then the matched files are excluded from the prompt context.
- Given rubric generation has run for an assessment, when the assessment row is inspected, then the resolved context glob list, domain notes, and question count used at generation time match the project's configuration at the time of creation.

> **No org-level fallback.** If a project has no context configured, rubric generation proceeds with no injected context. Org context is not consulted (see Design Principle 4). The org-level context tables remain in the schema for now — they are inert for FCS in V11 and may be repurposed for PRCC later. No table drops in V11.

---

## Epic 4: Navigation & Routing [Priority: High]

Updates the application shell — NavBar, breadcrumbs, root redirect, and URL structure — to reflect the project-first model.

**Rationale:** User-visible change that ties all other epics together. Can be partially delivered in parallel with Epics 1–3, but the full routing change blocks the `/assessments` deprecation.

<a id="REQ-navigation-and-routing-navbar-projects-link"></a>

### Story 4.1: NavBar "Projects" link

**As an** Org Admin or Repo Admin,
**I want to** see a "Projects" link in the NavBar that navigates to `/projects`,
**so that** projects are the primary navigation destination after sign-in.

**Acceptance Criteria:**

- Given an Org Admin or Repo Admin is signed in, when any page renders, then the NavBar contains a "Projects" link with `href="/projects"`.
- Given an Org Member is signed in, when any page renders, then the NavBar shows "My Assessments" (linking to `/assessments`) instead of "Projects".
- Given an admin is on a project-scoped route, when they click the "Projects" link, then they navigate to `/projects` via the existing client-side router (no full-page reload).

> **Note:** Org Members do not see the Projects link — their NavBar shows "My Assessments" instead (see Navigation Model).

---

<a id="REQ-navigation-and-routing-projects-list-page"></a>

### Story 4.2: Projects list page at `/projects`

**As an** Org Admin or Repo Admin,
**I want to** see a projects list page at `/projects`,
**so that** I have a stable entry point to all projects in my org.

**Acceptance Criteria:**

- Given an admin requests `/projects` directly (deep link or bookmark), when the route resolves, then the projects list page (Story 1.2) renders without redirect.
- Given an Org Member requests `/projects` directly, when the route resolves, then they are redirected to `/assessments`.
- Given an unauthenticated visitor requests `/projects`, when the route resolves, then the existing sign-in redirect runs and resumes at `/projects` after auth (admin) or `/assessments` (member).

---

<a id="REQ-navigation-and-routing-breadcrumbs"></a>

### Story 4.3: Breadcrumbs for project-scoped routes

**As an** Org Admin or Repo Admin,
**I want to** see breadcrumbs on project-scoped pages (e.g. `Projects > Payment Service > Assessment #12`),
**so that** I can orient myself within the navigation hierarchy and navigate up easily.

**Acceptance Criteria:**

- Given an admin is on `/projects/[id]/assessments/[aid]`, when the page renders, then breadcrumbs show `Projects > [Project Name] > Assessment #[aid]`, with the first two segments as links.
- Given an admin is on `/projects/[id]/settings`, when the page renders, then breadcrumbs show `Projects > [Project Name] > Settings`.
- Given an admin clicks the project-name breadcrumb segment, when navigation completes, then the URL is `/projects/[id]`.
- Given an Org Member is on `/projects/[id]/assessments/[aid]`, when the page renders, then no breadcrumb component is rendered.

> **Note:** Breadcrumbs are admin-only. Org Members do not see breadcrumbs — they reach assessments from `/assessments` or invitation links and do not navigate the project hierarchy.

---

<a id="REQ-navigation-and-routing-root-redirect"></a>

### Story 4.4: Root redirect — role-aware and last-project-aware

**As an** authenticated user,
**I want to** be redirected to the most relevant destination when I visit the root `/`,
**so that** sign-in places me in the right context immediately without extra navigation.

**Acceptance Criteria:**

- Given an authenticated Org Admin or Repo Admin has a `lastVisitedProjectId` in localStorage that resolves to an active project in their org, when they visit `/`, then they are redirected to `/projects/[id]`.
- Given an admin has no `lastVisitedProjectId` stored, when they visit `/`, then they are redirected to `/projects`.
- Given an admin has a `lastVisitedProjectId` that does not exist or is archived, when they visit `/`, then the stored value is cleared from localStorage and they are redirected to `/projects`.
- Given an Org Member visits `/`, when the redirect resolves, then they are redirected to `/assessments` regardless of any localStorage value.
- Given an unauthenticated visitor visits `/`, when the redirect resolves, then the existing sign-in flow runs (existing behaviour, unchanged).

> **Redirect rules (implicit, no UI choice required):**
> - **Org Admin / Repo Admin with a last-visited project** → redirect to that project's dashboard (see Story 4.6).
> - **Org Admin / Repo Admin with no last-visited project** → redirect to `/projects`.
> - **Org Member (no admin)** → redirect to `/assessments` (My Pending Assessments).
---

<a id="REQ-navigation-and-routing-last-visited-project"></a>

### Story 4.6: Last-visited project persistence

**As an** Org Admin or Repo Admin,
**I want to** be taken directly to my last-visited project when I sign in,
**so that** I resume where I left off without navigating from the projects list.

**Acceptance Criteria:**

- Given an admin navigates to `/projects/[id]`, when the page mounts, then `lastVisitedProjectId = [id]` is written to `localStorage` under a stable key.
- Given an admin signs out, when sign-out completes, then `lastVisitedProjectId` is removed from localStorage.
- Given the stored project ID points to an archived or deleted project, when root redirect resolves, then the stored value is treated as invalid (covered by Story 4.4) and cleared.
- Given an admin opens the app in a different browser or device, when they visit `/`, then no last-visited value is found and the fallback to `/projects` applies (localStorage is per-browser).

> **Implementation note:** The last-visited `project_id` is stored in browser `localStorage` (client-side, no DB write). Cleared on sign-out — losing the value at sign-out is acceptable; persisting across sign-ins is not worth a DB write at this stage. Falls back to `/projects` if the stored ID is invalid or the project has been archived.
---

<a id="REQ-navigation-and-routing-deep-link-compatibility"></a>

### Story 4.5: Deep-link compatibility for invitation URLs

**As an** Assessment Participant,
**I want to** follow an invitation email link and land on the correct assessment page within the project-first URL structure,
**so that** the change in URL shape does not break my ability to reach my assessment.

**Acceptance Criteria:**

- Given a V11 invitation email contains a link to `/projects/[pid]/assessments/[aid]`, when an authenticated participant clicks it, then they reach the assessment detail page directly (no intermediate redirect).
- Given the participant is unauthenticated when clicking the link, when the route resolves, then the existing sign-in flow runs and after authentication they land on the assessment detail page (the original URL is preserved through the auth round-trip).
- Given the link references a `pid`/`aid` pair that does not exist or where `aid` does not belong to `pid`, when the route resolves, then the response is 404.
- Given an old-shape URL `/assessments/[aid]` is requested (legacy bookmarks or in-flight emails sent before deployment), when the route resolves, then the request is redirected (HTTP 301) to `/projects/[pid]/assessments/[aid]` where `[pid]` is looked up from the assessment row. (See Open Question 5.)

---

## Cross-Cutting Concerns

### Security & Authorisation
- All project data is scoped to `org_id`; existing RLS policies on `assessments` and `organisation_contexts` extend naturally.
- Project creation, edit, archive, and settings are restricted to Org Admin role.
- FCS assessment creation is available to Org Admin and Repo Admin roles. GitHub repo membership is checked at runtime (existing pattern); no in-app role management. When a Repo Admin creates an assessment, the API enforces that every repo selected is one where that user holds GitHub admin access.
- Org Members (non-admin) reach assessments via `/assessments` (their queue) or deep-links. They do not have a project management view. Assessment participants can reach individual assessment pages via invitation link or from the queue; existing assessment RLS access is unchanged.

### Data Integrity
- An FCS assessment must always have a valid `project_id` FK. The API must reject FCS creation requests without a project.
- Archiving a project does not delete or modify its assessments — it only hides the project from active lists.

### Context Resolution
- FCS rubric generation uses project-level context only (glob patterns, domain notes, question count). No fallback to org-level context. If a project has no context configured, rubric generation proceeds with no injected context.
- Exempt file patterns are read from repo-level config and applied during FCS context fetching (files matching the patterns are excluded).

---

## What We Are NOT Building

- **PRCC product features.** No PRCC product behaviour changes in V11. PRCC participants use direct invitation links; no PRCC list view for members. The nullable `project_id` FK on repos and PRCC assessments is the only V11 schema foundation. Full PRCC project scoping is deferred.
- **Repo→project UI mapping.** Repos carry a nullable `project_id` FK in the schema only. No admin UI to assign repos to projects in V11.
- **Copy context from another project.** Not in V11. Can be added in a future epic.
- **Project-level RBAC.** No project-specific roles or membership lists. Access is governed by org-level roles.
- **Multi-org projects.** A project belongs to exactly one org.

---

## Open Questions

| # | Question | Context | Options | Impact |
|---|----------|---------|---------|--------|
| 1 | **Resolved.** PRCC deferred from V11. PRCC items do not appear in the member queue; participants use invitation links. `/assessments` is FCS-only. | — | — | — |
| 2 | **Resolved.** Members land on `/assessments` (My Pending Assessments), not `/projects`. Root redirect differs by role: admin → `/projects`, member → `/assessments`. | — | — | — |
| 3 | **Resolved.** PRCC product features deferred from V11. Foundation: nullable `project_id` FK on repos and PRCC assessments only. No UI change. | — | — | — |
| 4 | **Resolved.** PRCC participants use direct invitation links in V11. No PRCC list view for members. | — | — | — |
| 5 | Are legacy `/assessments/[aid]` redirects required in V11? | Story 4.5 AC 4 specifies a 301 from the legacy shape to the project-first shape. The Context section states the product is not yet in production, so no in-flight invitation emails should exist. The redirect adds a small amount of routing logic but covers any stray bookmarks. | (a) Implement the 301 redirect (current default in AC 4). (b) Drop the legacy route entirely; old-shape URLs return 404. | If (b) is chosen, remove AC 4 from Story 4.5 and shrink the implementation. If (a), the redirect must look up `project_id` from the assessment row. |

---

## Testability Validation

Pass over every acceptance criterion in §Epics 1–4. Outcome: no blocking issues — all ACs name a concrete observable result and a specific precondition, with negative cases covered (auth failure, validation, mismatched IDs, missing data). Notes on judgement calls inlined below.

| Epic | Story | AC # | Issue | Resolution |
|------|-------|------|-------|------------|
| 1 | 1.1 | — | Project name length cap (200 chars) was implicit. | Made explicit in AC 3 (rejected if > 200). |
| 1 | 1.5 | 2 | Error code for archive-create conflict (`409` vs `422`) is an implementation choice. | Specified `422` (validation/state error) — testable as exact status; design may swap once an LLD lands without breaking the AC's spirit. |
| 2 | 2.3 | 4 | "Archived project" semantics for participants required a deliberate stance. | Specified: pending submissions on archived projects remain visible. Rationale: archive hides project from admin lists; obligations on existing assessments are preserved (consistent with Story 1.5 AC 3). |
| 2 | 2.3a | 4 | "Hide filter when only 1 project" is a UI judgement call. | Specified deterministically (hidden when count == 1) so the AC is testable. |
| 4 | 4.5 | 4 | Whether legacy URL support is needed at all. | Captured as Open Question 5; AC 4 describes the redirect *if* it is in scope. |

No vague qualifiers ("appropriate", "user-friendly", "fast") remain. Every AC has a precondition that can be set up in a test and an outcome that can be asserted.

---

## Next Steps

After Gate 2 approval:

1. Resolve Open Question 5 (legacy URL redirect scope).
2. Run `/kickoff docs/requirements/v11-requirements.md` (or `/architect` if the HLD already covers V11) to produce the design artefacts and implementation plan.
