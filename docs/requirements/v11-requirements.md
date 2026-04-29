# Feature Comprehension Score — V11 Requirements: Projects

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.5 |
| Status | Draft — Structure |
| Author | LS / Claude |
| Created | 2026-04-29 |
| Last updated | 2026-04-29 (rev 5) |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-04-29 | LS / Claude | Initial structure draft |
| 0.2 | 2026-04-29 | LS / Claude | Address review comments: drop org context fallback for FCS; fix Org Member role; rewrite navigation model (admin vs member); add OQ 3 (PRCC project scoping) and OQ 4 |
| 0.3 | 2026-04-29 | LS / Claude | Resolve all OQs: PRCC deferred; add Config Model section (V1 repo config split); exempt file patterns apply to FCS; nullable repo→project FK as sole foundation work; fix Roles table and Cross-Cutting Concerns |
| 0.4 | 2026-04-29 | LS / Claude | Address review comments: Config Model clarification (PRCC settings don't exist yet); add Repo Admin role; last-visited project persistence (Story 4.6); archive = soft delete; minimise-changes design principle; Story 2.2 rewrite; remove org fallback from Story 3.4 and Epic 3 description; clarify Story 1.4 metadata scope; Story 2.4 entry points |
| 0.5 | 2026-04-29 | LS / Claude | Clarify Repo Admin mechanics: repo selector filtered to user's admin repos; API enforces repo-level access on assessment creation; Story 2.1 and Cross-Cutting Concerns updated |

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
| **My Pending Assessments** | A cross-project view showing all FCS assessments where the signed-in user has a pending submission. Shows project name as a label on each item. No project filter — the view is already scoped to the signed-in user's assignments. |
| **Org Admin** | A user with admin or owner role in the GitHub organisation. Can create and manage projects, configure project context, and create FCS assessments. |
| **Org Member** | A user with member role in the org. Sees all FCS assessments they are invited to, across all projects, in a single queue. Does not have a project management view. |

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
| **Repo Admin** | Persistent | A GitHub org member with admin access to at least one repository in the org. Can create FCS assessments within existing projects. When creating an assessment, the repo selector shows only repos where they hold GitHub admin access — not all org repos. Cannot create, edit, or archive projects or configure project settings. GitHub repo membership is checked at runtime — no separate user management. |
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

### Story 1.1: Create a project

**As an** Org Admin,
**I want to** create a named project with a description,
**so that** I can group FCS assessments for a team initiative and give the LLM focused context.

*(Acceptance criteria in next pass)*

---

### Story 1.2: List projects

**As an** Org Member,
**I want to** see a list of all projects in my organisation,
**so that** I can navigate to a project's dashboard to view its assessments.

*(Acceptance criteria in next pass)*

---

### Story 1.3: View project dashboard

**As an** Org Member,
**I want to** view a project's dashboard showing its FCS assessments,
**so that** I can see all assessments related to that initiative in one place.

*(Acceptance criteria in next pass)*

> **Note:** This is the per-project assessment list. The cross-project view (all pending assessments filterable by project) is covered in Story 2.3.

---

### Story 1.4: Edit a project

**As an** Org Admin,
**I want to** edit a project's name and description,
**so that** I can keep the project metadata accurate as the initiative evolves.

*(Acceptance criteria in next pass)*

> **Note:** Name and description are the only project-level metadata fields. Context settings (glob patterns, domain notes, question count) are managed separately on the project settings page (Epic 3, Story 3.5).

---

### Story 1.5: Archive a project

**As an** Org Admin,
**I want to** archive a project that is no longer active,
**so that** it no longer appears in the active project list but its historical assessments are preserved.

*(Acceptance criteria in next pass)*

> **Yes — archive = soft delete.** Sets an `archived_at` timestamp on the project row. Archived projects are excluded from the active project list and cannot have new assessments created under them, but all existing assessments and their data are retained and remain accessible via direct URL.

---

## Epic 2: FCS Scoped to Projects [Priority: High]

All FCS assessments must belong to a project. This epic wires the project FK into the FCS creation flow, scopes assessment lists to the project, and provides a cross-project pending view for participants.

**Rationale:** Core product change. Without this, projects are empty containers. Depends on Epic 1.

### Story 2.1: Create FCS assessment within a project

**As an** Org Admin or Repo Admin,
**I want to** create an FCS assessment from within a project's dashboard,
**so that** the new assessment is automatically associated with that project.

*(Acceptance criteria in next pass)*

> **Note:** The assessment creation form and flow are unchanged from the existing FCS creation flow. The only addition is that `project_id` is pre-populated from the current project context and passed to the API on submit.
>
> **Repo selector scoping:** Org Admins see all org repos (unchanged). Repo Admins see only the repos in the org where they hold GitHub admin access. The repo list is fetched from the GitHub API using the authenticated user's token and filtered accordingly. No new UI — the same repo selector component, different data.

---

### Story 2.2: Project-scoped FCS assessment list

**As an** Org Admin or Repo Admin,
**I want to** see all FCS assessments belonging to the current project when I view a project's dashboard,
**so that** I can track assessment status and progress for that initiative without mixing in assessments from other projects.

*(Acceptance criteria in next pass)*

---

### Story 2.3: My Pending Assessments cross-project view

**As an** Assessment Participant,
**I want to** see all FCS assessments where I have a pending submission — across all projects — when I sign in,
**so that** I can find and complete my outstanding assessments without knowing which project they belong to.

*(Acceptance criteria in next pass)*

---

### Story 2.4: Project-scoped assessment URLs

**As an** Assessment Participant,
**I want to** access my assessment via a URL that includes the project context (`/projects/[pid]/assessments/[aid]`),
**so that** deep-links in invitation emails and navigation from My Pending Assessments both resolve correctly in the project-first URL structure.

*(Acceptance criteria in next pass)*

> **Note:** Assessment pages are reachable from two entry points: (1) an invitation email link, and (2) the My Pending Assessments page (Story 2.3). Both paths use the same `/projects/[pid]/assessments/[aid]` URL.

---

## Epic 3: Project Context & Config [Priority: High]

Moves context configuration from org level to project level. Each project gets its own glob patterns, domain notes, and question count. There is no org-level fallback for FCS — if a project has no context configured, rubric generation proceeds with no injected context.

**Rationale:** Core quality driver. Project-scoped context produces more targeted LLM questions. Depends on Epic 1. Can be delivered in parallel with Epic 2.

### Story 3.1: Configure project-level context file glob patterns

**As an** Org Admin,
**I want to** configure a list of file glob patterns on a project (e.g. `docs/adr/*.md`, `docs/design/*.md`),
**so that** the LLM receives the relevant architecture documents from the repositories chosen during FCS creation.

*(Acceptance criteria in next pass)*

---

### Story 3.2: Configure project-level domain notes

**As an** Org Admin,
**I want to** write free-text domain notes for a project (vocabulary, architectural principles, focus areas, exclusions),
**so that** the LLM question generator has structured context about the project's domain and known design decisions.

*(Acceptance criteria in next pass)*

---

### Story 3.3: Configure project-level question count override

**As an** Org Admin,
**I want to** override the number of FCS questions generated for a project (3–5),
**so that** high-complexity projects can request more questions while simpler ones stay lean.

*(Acceptance criteria in next pass)*

---

### Story 3.4: FCS rubric generation uses project context

**As a** FCS system,
**I want to** use project-level context (glob patterns, domain notes, question count) when generating rubric questions,
**so that** every FCS assessment uses the context configured for its project.

*(Acceptance criteria in next pass)*

> **No org-level fallback.** If a project has no context configured, rubric generation proceeds with no injected context. Org context is not consulted. (See Design Principle 4.)
---

### Story 3.5: View project settings page

**As an** Org Admin,
**I want to** view and edit all project context and configuration on a single settings page,
**so that** I can understand what context the LLM will receive and make adjustments without navigating multiple sections.

*(Acceptance criteria in next pass)*

---

## Epic 4: Navigation & Routing [Priority: High]

Updates the application shell — NavBar, breadcrumbs, root redirect, and URL structure — to reflect the project-first model.

**Rationale:** User-visible change that ties all other epics together. Can be partially delivered in parallel with Epics 1–3, but the full routing change blocks the `/assessments` deprecation.

### Story 4.1: NavBar "Projects" link

**As an** Org Member,
**I want to** see a "Projects" link in the NavBar that navigates to `/projects`,
**so that** projects are the primary navigation destination after sign-in.

*(Acceptance criteria in next pass)*

---

### Story 4.2: Projects list page at `/projects`

**As an** Org Member,
**I want to** see a projects list page at `/projects`,
**so that** I have a stable entry point to all projects in my org.

*(Acceptance criteria in next pass)*

---

### Story 4.3: Breadcrumbs for project-scoped routes

**As an** Org Member,
**I want to** see breadcrumbs on project-scoped pages (e.g. `Projects > Payment Service > Assessment #12`),
**so that** I can orient myself within the navigation hierarchy and navigate up easily.

*(Acceptance criteria in next pass)*

---

### Story 4.4: Root redirect — role-aware and last-project-aware

**As an** authenticated user,
**I want to** be redirected to the most relevant destination when I visit the root `/`,
**so that** sign-in places me in the right context immediately without extra navigation.

*(Acceptance criteria in next pass)*

> **Redirect rules (implicit, no UI choice required):**
> - **Org Admin / Repo Admin with a last-visited project** → redirect to that project's dashboard (see Story 4.6).
> - **Org Admin / Repo Admin with no last-visited project** → redirect to `/projects`.
> - **Org Member (no admin)** → redirect to `/assessments` (My Pending Assessments).
---

### Story 4.6: Last-visited project persistence

**As an** Org Admin or Repo Admin,
**I want to** be taken directly to my last-visited project when I sign in,
**so that** I resume where I left off without navigating from the projects list.

*(Acceptance criteria in next pass)*

> **Implementation note:** The last-visited `project_id` is stored in browser `localStorage` (client-side, no DB write). Cleared on sign-out. Falls back to `/projects` if the stored ID is invalid or the project has been archived.

---

### Story 4.5: Deep-link compatibility for invitation URLs

**As an** Assessment Participant,
**I want to** follow an invitation email link and land on the correct assessment page within the project-first URL structure,
**so that** the change in URL shape does not break my ability to reach my assessment.

*(Acceptance criteria in next pass)*

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

---

## Next Steps

After Gate 1 approval: acceptance criteria will be written for all stories using Given/When/Then format, followed by a testability validation pass (Gate 2).
