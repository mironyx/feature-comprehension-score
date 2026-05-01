---
name: lld
description: Generate Low-Level Design documents for implementation plan sections. Produces LLDs with implementation-level detail, file paths, internal types, and task breakdowns. Use for preparing a phase or section before implementation.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
---

# Low-Level Design — Generation Skill

Generates implementation-ready Low-Level Design documents from the implementation plan and high-level design.

## Arguments

`$ARGUMENTS` determines the scope:

- **Epic mode** (e.g., `epic 45`, `epic <number>`): Generate **one LLD per epic** containing one Part B section per task. This is the primary mode for new work. Reads the epic issue, identifies tasks, and produces `docs/design/lld-<epic-id>-<short-name>.md` (e.g. `lld-v11-e11-2-fcs-scoped-to-projects.md`).
- **Phase mode** (e.g., `phase2`, `phase 2`): Generate LLDs for ALL sections in the phase. Legacy mode for existing phase-based work.
- **Section mode** (e.g., `2.3`, `2.1`): Regenerate or refine a single section's LLD. Use after reviewing phase output.
- **No arguments**: Ask the user which epic, phase, or section to target.

## Process

### Step 0: Resolve version

Determine the version slug `v<N>` from `$ARGUMENTS` or by asking the user (e.g. `epic 45 v11` ⇒ `v11`). All version-scoped paths derive from it:

- Requirements: `docs/requirements/v<N>-requirements.md`
- High-level design: `docs/design/v<N>-design.md`
- Implementation plan: newest match for `docs/plans/*-v<N>-*.md` (use `ls -t` if multiple)

If any of these are missing, stop and ask. Do not guess.

### Step 0b: Read context

**Always read first (both modes):** `docs/design/kernel.md` — the curated catalogue of canonical helpers, types, and composition roots. The LLD must reference kernel entries by import path in its "Reused helpers — DO NOT re-implement" table at the top of Part B; code samples elsewhere must call kernel symbols by name, never inline their bodies. If a topic in scope is not yet covered by the kernel, flag it as an Open Question and propose the entry — do not silently invent a new helper.

`/architect` inherits this step via "Follow the LLD template from /lld" — do not duplicate the rule there.

**Epic mode:**

1. Read the epic issue: `gh issue view <number>`. Extract the task list and scope.
2. For each task issue, read the issue body: `gh issue view <task-number>`.
3. Read the resolved HLD. Identify relevant sections.
4. Read existing LLDs in `docs/design/` to understand the established format and avoid duplication.
5. Read relevant ADRs from `docs/adr/`.
6. Read the resolved requirements file.
7. Read existing source code in `src/` to understand what already exists.

**Phase mode:**

1. Read the resolved implementation plan. Extract all sections for the target phase.
2. Read the resolved HLD. Identify which L4 contract sections are relevant.
3. Read existing LLDs in `docs/design/` to understand the established format and avoid duplication.
4. Read relevant ADRs from `docs/adr/` referenced by the phase sections.
5. Read the resolved requirements file for the stories referenced.
6. Read existing source code in `src/` to understand what already exists.

### Step 0c: Optional context brief via subagent

For large epics (≥ 4 tasks, or touching ≥ 3 layers), delegate context-gathering to the `feature-dev:code-explorer` agent **instead of** doing the reads above directly. Hand it: the epic/task issue numbers, the resolved doc paths, and the scope summary. Ask it to return a structured brief:

- HLD sections in scope (with anchors)
- Existing LLDs that overlap or constrain this work
- Existing `src/` files/modules already implementing parts of this scope (with paths)
- Existing helpers/types/services that should be reused (not re-implemented)
- ADRs that bind decisions
- Open questions the LLD must surface

Keep the brief in your context; do not re-read the underlying files unless the brief points to a specific section you need verbatim. This keeps the main context clean for the actual design work.

For small epics (1–3 tasks, single layer), skip the subagent and read directly.

### Step 1: Overview (epic mode or phase mode)

Before generating individual LLDs, produce a brief analysis for the user:

- List all sections in the phase with their inferred layers (DB / BE / FE)
- Identify cross-cutting concerns (e.g., auth touches DB + BE + FE)
- Identify dependency ordering (e.g., 2.1 DB schema must exist before 2.2 auth)
- Identify shared foundations (e.g., types used across multiple sections)
- Propose which sections need a full LLD vs which are sufficiently covered by the HLD

Present this overview and **wait for user confirmation** before generating the LLD files.

### Step 2: Generate LLD

**Epic mode:** Generate **one file per epic**, with one Part B section per task within it. File naming: `docs/design/lld-<epic-id>-<short-name>.md` where `<epic-id>` is the canonical epic identifier (`v11-e11-2`) and `<short-name>` is a lower-kebab-case description (`fcs-scoped-to-projects`). Established convention — see existing `lld-v11-e11-1-project-management.md` and `lld-v11-e11-2-fcs-scoped-to-projects.md`.

**Phase mode:** Generate a **single file per phase** containing all sections. Each implementation plan section becomes a top-level heading within the file. File naming: `docs/design/lld-phase-<N>-<short-name>.md`.

**Stable LLD anchors (per ADR-0026):** every Part B section heading must be preceded by an HTML anchor:

```markdown
<a id="LLD-v11-e11-2-fcs-create-api"></a>

### B.2 — Task T2.2: FCS create API
```

- Format: `LLD-<epic-id>-<section-slug>` — uppercase `LLD-` prefix, the epic identifier as in the file name, then a section slug.
- `<section-slug>` is lower-kebab-case of the Part B section heading (e.g. `fcs-create-api`, `schema`, `pending-queue`). It must be unique within the file.
- Emit anchors only on Part B section headings — not on Part A, not on the document title, not on sub-sub-headings inside a section.
- On collision, append `-2`, `-3` and add an HTML comment explaining the collision.
- **Scope:** pilot epics only (those tagged for the structured-prompt rollout). Existing LLDs are not retrofitted unless the Stage 7 retro promotes the convention project-wide.

**Layer inference rules** — determine which layers a section needs by examining its content:
- **DB**: Mentions tables, migrations, RLS, schema, database functions, seed data
- **BE**: Mentions API routes, middleware, server-side logic, webhooks, services, ports/adapters
- **FE**: Mentions pages, components, UI, forms, navigation, client-side state

**DRY principle** — do NOT duplicate content from the HLD. Instead:
- Reference HLD sections by link: `See [v1-design.md §4.2](v1-design.md#42-database-schema---l4-contracts)`
- Only add implementation-level detail the HLD does not contain: file paths, internal function signatures, component trees, state machines, error handling strategies, internal types not in the public contract

**Section mode** (`/lld 2.3`): Update the relevant section within the existing phase LLD file rather than creating a new file.

**Cross-cutting LLDs** (e.g., `lld-artefact-pipeline.md`) remain as standalone files when they span multiple phases or cover a topic orthogonal to the phase structure.

### Step 2.5: Self-critique pass

After producing the draft LLD (or each LLD in epic mode), run a critical re-read against the checklist below **before** moving to task breakdown. For each item that fails, fix the LLD in place. Do not skip — write the checklist results inline as a temporary "Critique" comment block, then remove it once issues are addressed.

Be adversarial. The goal is to find the gaps a future `/feature` run will fall into, not to pat yourself on the back.

- **Acceptance ↔ BDD ↔ Invariant coverage.** Does every Acceptance Criterion map to at least one BDD spec? Does every Invariant have a `Verification` method that is *executable* (test, type check, grep, lint) — not "code review" or "manual check"?
- **Internal decomposition is concrete.** For every non-trivial route or component, is every function/class/helper named with a signature? "Service does X" is a failure — name `serviceFn(ctx, params): Promise<T>` and its private helpers.
- **Type contracts match the DB.** For any type referencing a DB column or enum, did I grep `src/types/database.types.ts` and confirm the LLD type matches? Mismatches cause `as unknown as` casts downstream.
- **Test seams.** No `fetchImpl?: typeof fetch` or similar HTTP-injection seams in `*Deps` interfaces. Use MSW. Only inject genuine behavioural dependencies (e.g. `getInstallationToken`).
- **Task sizing.** Does each task plausibly fit in < 200 lines of diff? If unsure, split. Tasks > 200 lines are the single biggest cause of bad `/feature` runs.
- **No HLD duplication.** Is anything in Part B copy-pasted from the HLD? Replace with a link.
- **Open decisions surfaced.** Are there design questions still unresolved that the LLD silently picks a side on? List them at the top of the LLD as "Open questions" and flag to the user — do not decide in the LLD.
- **Layer placement.** For each behaviour, is it in the right layer (DB constraint vs API guard vs UI guard)? Defence-in-depth is fine but the *primary* enforcement layer must be explicit.
- **Error paths.** Is there at least one BDD spec per non-trivial error case, or did I only spec the happy path?
- **Existing code reuse.** Did I grep for existing helpers/types/services that already do part of this work? Re-implementing what exists is the second-biggest cause of bad `/feature` runs.
- **Reused helpers table is mandatory** when the LLD touches any module that already has helpers (auth/membership/gate, API context, validation, response, error handling, supabase clients). Add a "Reused helpers — DO NOT re-implement" table to Part B.0 listing each helper, its import path, and what re-implementing pattern it replaces. Inline code samples elsewhere in the LLD must call these helpers by name — not show the inlined query body. Rationale: `/feature` agents follow LLD code samples literally; if the sample reads `from('user_organisations').select('github_role, ...')`, the agent will write that query even when a `getOrgRole` helper exists. The table at B.0 is the agent's first stop.
- **No raw queries against shared tables in code samples.** For `user_organisations`, `projects`, `repositories`, or any RLS-gated table, the LLD's code samples must use the canonical helper from the Reused helpers table, not an inline `.from(...).select(...)`. The only exception is when no helper covers the exact shape needed — and in that case, the LLD must explicitly say so and propose either extending an existing helper or adding a new one (with its signature) to the table.

### Step 3: Task breakdown

The LLD ends with a single `## Tasks` section covering all sections in the phase. Tasks should be:

- Concrete and implementable in a single PR (target < 200 lines)
- Ordered by dependency (earlier tasks unblock later ones)
- Sized appropriately — split large work, combine trivial items
- Written with enough context for the `/feature` skill to pick them up

Each task entry follows this format:

```markdown
### Task N: [Short title]

**Issue title:** [Title for the GitHub issue]
**Layer:** DB | BE | FE
**Depends on:** Task M (if any), or — (no dependencies)
**Stories:** [requirement story numbers]
**HLD reference:** [link to relevant HLD section]

**What:** [1-2 sentences on what to implement]

**Acceptance criteria:**
- [ ] [Concrete, testable criterion]
- [ ] [Another criterion]

**BDD specs:**
```
describe('[context]')
  it('[behaviour]')
```

**Files to create/modify:**
- `src/path/to/file.ts` — [what this file does]
```

### Step 3b: Execution order

After defining all tasks, produce an **Execution Order** section that makes parallelism
explicit. This section has two parts:

1. **Dependency DAG** — a mermaid `graph LR` showing which tasks block which. This is the
   primary visual for human reviewers.

2. **Execution waves table** — groups tasks into numbered waves. All tasks within a wave
   can run in parallel; a wave starts only after all predecessor waves complete. This is
   the primary artifact for `/feature-team`.

```markdown
## Execution Order

### Dependency DAG

` ` `mermaid
graph LR
  T1[Task 1: Schema migration] --> T3[Task 3: Service layer]
  T2[Task 2: Auth helper] --> T4[Task 4: API route]
  T3 --> T4
  T3 --> T5[Task 5: Webhook handler]
` ` `

### Execution Waves

| Wave | Tasks | Blocked by | Notes |
|------|-------|------------|-------|
| 1 | Task 1, Task 2 | — | No dependencies — start immediately, parallelisable |
| 2 | Task 3 | Wave 1 (Task 1) | |
| 3 | Task 4, Task 5 | Wave 2 (Task 3) | Parallelisable — no shared files |
```

**Rules for wave assignment:**

- A task with no `Depends on` goes into Wave 1.
- A task whose dependencies are all in Wave N goes into Wave N+1.
- Tasks in the same wave must not modify the same files (otherwise they cannot run in parallel safely). If two otherwise-independent tasks share files, place the smaller one in the next wave and note the reason.
- If all tasks are sequential (each depends on the previous), there is one task per wave — still produce the table for consistency.

### Step 3c: Coverage manifest (epic mode, pilot epics only)

After the LLD is generated, write a coverage manifest at
`docs/design/coverage-<epic-id>.yaml` (e.g. `coverage-v11-e11-2.yaml`) linking requirements stories to LLD sections.

Schema (per ADR-0026):

```yaml
epic: <epic-id>
entries:
  - req: REQ-<epic-slug>-<story-slug>
    lld: lld-<epic-id>-<short-name>.md#LLD-<epic-id>-<section-slug>
    issue: null      # GitHub issue number; populated by /feature-end
    files: []        # populated by /feature-end after merge
    status: Approved # Draft | Approved | Implemented | Revised
```

Rules:

- One entry per REQ- anchor in the pilot epic's requirements doc. Read REQ- anchors with
  `grep -o 'id="REQ-[^"]*"' docs/requirements/v*-requirements.md`.
- The `lld:` value points at the Part B section that satisfies the story. If a story is
  satisfied across multiple sections, pick the primary one and note the others in a YAML
  comment.
- Initial `files: []` and `status: Approved` — `/feature-end` populates them at merge time.
- If a story has no implementing LLD section yet (deferred or carried by a future task),
  emit the entry with `lld: null` and `status: Draft`, and flag it in the Step 1 overview.

**Verify before exit:**

1. Every REQ- anchor in the requirements doc has a manifest row.
2. Every non-null `lld:` value resolves to an actual `<a id="LLD-...">` anchor in the named file
   (`grep -F 'id="<anchor>"' <file>`).
3. The manifest is committed alongside the LLD files in the same change.

### Step 4: Cross-references (epic mode and phase mode)

Add a `## Cross-References` section at the end of the phase LLD (before Tasks) noting:
- **Internal dependencies** between sections within this phase (as anchor links)
- **External dependencies** on other phase LLDs or cross-cutting LLDs (as file links)
- **Shared types or interfaces** that span multiple sections

## LLD Template

The full template — Document Control, Part A (Purpose / Behavioural Flows / Structural Overview / Invariants / Acceptance / BDD / HLD coverage), Part B (Database / Backend / Frontend with internal decomposition), Cross-References, Tasks, and Execution Order — lives in [`template.md`](template.md). Read it once at the start of a run and follow it verbatim. Do not paraphrase from memory.

Key points the template encodes (do not violate):

- **Two parts.** Part A is reviewer-readable and self-contained; Part B is for the `/feature` agent and adds file paths, types, function signatures, and internal decomposition.
- **Diagrams are required**, not decorative — sequence diagram per non-trivial flow, classDiagram per new module boundary.
- **Invariants** must each have an executable verification method.
- **Internal decomposition** names every function ≥ a few lines with its signature, before implementation begins.


## Guidelines

- The LLD is an **implementation guide**, not a design discussion. Decisions should already be made in the HLD and ADRs. If you find an undecided question, flag it to the user rather than deciding in the LLD.
- **Part A is the shared foundation.** Both the human reviewer and the implementing agent read Part A. For the reviewer, it is sufficient on its own to build theory. For the agent, it provides the conceptual model that Part B's details depend on. Part A must be self-contained: a reviewer who reads only Part A should understand what the feature does, how the parts interact, what must always be true, and how success is verified.
- **Part B extends Part A with implementation precision.** The `/feature` agent reads both parts. Part B adds file paths, types, function signatures, and decomposition rules. A human reviewer may scan Part B for completeness but does not need to review it line-by-line.
- **Diagrams are not optional decoration.** Sequence diagrams and structural overviews are primary review artefacts. Generate them whenever the "when required" conditions are met. Use mermaid syntax so they render in GitHub and editors.
- **Invariants must be verifiable.** Every invariant needs a verification method (test, type check, grep, lint rule). If you cannot state how to verify it, it is not an invariant — it is a wish.
- Keep LLDs focused and concise. If a section is just "see HLD", that's fine — it confirms the HLD is sufficient.
- Task granularity: each task should be completable in one `/feature` cycle. If a task would produce > 200 lines of changes, split it.
- BDD specs in tasks should be concrete enough for the `/feature` skill to write tests directly from them.
- Use British English in all documentation.
- **No `fetchImpl` in dependency interfaces.** Do not add `fetchImpl?: typeof fetch` to `*Deps` interfaces as a test seam — use MSW for HTTP mocking instead (project convention, CLAUDE.md). Only inject real behavioural dependencies (e.g. `getInstallationToken`).
