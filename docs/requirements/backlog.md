# Backlog — Triage List

Capture point for gaps, ideas, and small enhancements. Items here are untriaged.
When ready to work on, create a GitHub issue and move to the project board.

## Format

```
### [Short title]
- **Source:** [how it was found — bug investigation, dogfooding, drift scan, etc.]
- **Type:** gap | enhancement | idea
- **Affected area:** [component or story reference]
- **Summary:** [1-2 sentences]
- **Issue:** #N (when promoted)
```

---

## Items

### Post-creation participant management

- **Source:** /bug investigation 2026-04-23
- **Type:** gap
- **Affected area:** assessment participant lifecycle
- **Summary:** No UI or API for adding/removing participants after an assessment is created. The DB schema supports it (`status: 'removed'`, `removed_at` column) but no application code implements the transitions. No explicit requirement covers post-creation management — Story 3.1 scopes add/remove to "before confirming".
- **Issue:** —

### Project entity — grouping of repositories with shared context

- **Source:** session 2026-04-23
- **Type:** idea
- **Affected area:** org configuration, prompt pipeline, dashboard
- **Summary:** Introduce a Project entity as a layer between Organisation and Repository. A project groups multiple repositories and carries shared prompt context: domain vocabulary and common documentation (e.g. architecture overview, ADRs, domain glossary). All assessments for repos in the project inherit this context during rubric generation.
- **Prior art in codebase:**
  - `v1-requirements.md` glossary explicitly defers this: "Repository = project in V1; Team entity / team management is out of scope."
  - `v1-prompt-changes.md` anticipated it: `organisation_contexts` table has a nullable `project_id FK` placeholder column, with Phase 2 lookup `WHERE org_id = $1 AND project_id IS NULL` and a V2 lookup `WHERE org_id = $1 AND project_id = $2` already documented.
- **Scope when this gets designed:**
  - New `projects` table: `id`, `org_id`, `name`, `description`.
  - Many-to-many `project_repositories` join table (a repo may belong to one project).
  - Project-level `organisation_contexts` rows (vocabulary, common docs) — the FK is already reserved.
  - Org Admin UI: create/manage projects, assign repos, edit shared context.
  - Config inheritance: repo-level config overrides project-level, project-level overrides org-level (same pattern as current `COALESCE(rc.fcs_question_count, oc.fcs_question_count)` in `functions.sql`).
  - Dashboard: project-level comprehension aggregate across member repos.
- **Issue:** —

### Sprint-boundary assessment cadence

- **Source:** Storey 2026 — Triple Debt Sprint Canvas (session 2026-04-23)
- **Type:** idea
- **Affected area:** assessment creation / results
- **Summary:** Support running FCS at sprint start (baseline) and retro (post-sprint) as a paired workflow, so the score measures comprehension gain or loss over a sprint rather than a point-in-time audit. Would require linking two assessments on the same feature and displaying the delta. Positions FCS as a sprint instrument rather than an audit tool.
- **Issue:** —

### Transactive memory probe

- **Source:** Storey 2026 — Triple Debt Sprint Canvas (session 2026-04-23)
- **Type:** idea
- **Affected area:** assessment configuration / results
- **Summary:** Allow an assessment to designate a named module owner (the person who "should" be able to explain it). The owner's score on their own module becomes the primary signal. Turns "assign an owner" from a process gesture into a measurable commitment. Relates to bus-factor detection use case already in marketing notes.
- **Issue:** —

### Intent artifact trigger from low layer-2 scores

- **Source:** Storey 2026 — Triple Debt Sprint Canvas (session 2026-04-23)
- **Type:** idea
- **Affected area:** results / recommendations
- **Summary:** When a completed assessment scores low on Naur layer 2 (design justification) questions, surface a specific recommendation: "Low design justification score — consider capturing an ADR this sprint." Connects FCS output to a concrete team action and links to the intent debt framing in v2-requirements-proposed-additions.md.
- **Issue:** —

### Adaptive question count based on feature size

- **Source:** session 2026-04-23
- **Type:** idea
- **Affected area:** assessment configuration / rubric generation pipeline
- **Summary:** The current hard cap of 5 questions (enforced in DB schema `BETWEEN 3 AND 5`, Zod schema `min(3).max(5)`, and org config default) is insufficient for larger features. Three refinement options to consider during requirements:
  - **A — Raise the static cap:** Change constraint to `3–15`, let Org Admins pick a fixed number. Simple but doesn't adapt to feature size.
  - **B — Adaptive count from artefact signals:** Derive question count from proxies already in the assembled artefact set (`fileCount`, `prCount`). Example tiers: 1–2 PRs / <10 files → 5 questions; 3–5 PRs / 10–25 files → 8; 6+ PRs / 25+ files → 10–12. Engine-only change, no new data collection.
  - **C — Minimum per Naur layer:** Instead of a total count, enforce a floor per layer (e.g. 2 per layer = 6 minimum). The prompt already enforces "at least one per layer" — this raises that floor adaptively for larger features.
  - **Recommended direction:** B + C combined — adaptive total count from artefact signals, with a per-layer minimum floor. Cap becomes configurable (3–15) but the default is computed. Most aligned with Naur framing: bigger feature = more layers of theory to probe.
- **Issue:** —

### Sprint-over-sprint comprehension trend

- **Source:** Storey 2026 — cognitive debt framing (session 2026-04-23)
- **Type:** idea
- **Affected area:** organisation dashboard / analytics
- **Summary:** Track team-level comprehension scores across sprints to surface longitudinal patterns (e.g. "comprehension drops after sprint 3 of every quarter"). Builds on the per-feature historical view but aggregates to sprint cadence. Requires sprint tagging on assessments. The signal this produces — cognitive debt trend — is what Storey's framework identifies as the team-level health indicator FCS is best positioned to measure.
- **Issue:** —
