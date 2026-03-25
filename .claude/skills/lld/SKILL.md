---
name: lld
description: Generate Low-Level Design documents for implementation plan sections. Produces LLDs with implementation-level detail, file paths, internal types, and task breakdowns. Use for preparing a phase or section before implementation.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
---

# Low-Level Design — Generation Skill

Generates implementation-ready Low-Level Design documents from the implementation plan and high-level design.

## Arguments

`$ARGUMENTS` determines the scope:

- **Phase mode** (e.g., `phase2`, `phase 2`): Generate LLDs for ALL sections in the phase. This is the primary mode — produces the full picture with cross-cutting concerns and task breakdowns.
- **Section mode** (e.g., `2.3`, `2.1`): Regenerate or refine a single section's LLD. Use after reviewing phase output.
- **No arguments**: Ask the user which phase or section to target.

## Process

### Step 0: Read context

1. Read the implementation plan: `docs/plans/2026-03-09-v1-implementation-plan.md`. Extract all sections for the target phase.
2. Read the high-level design: `docs/design/v1-design.md`. Identify which L4 contract sections are relevant.
3. Read existing LLDs in `docs/design/` to understand the established format and avoid duplication.
4. Read relevant ADRs from `docs/adr/` referenced by the phase sections.
5. Read relevant requirements from `docs/requirements/v1-requirements.md` for the stories referenced.
6. Read existing source code in `src/` to understand what already exists.

### Step 1: Phase overview (phase mode only)

Before generating individual LLDs, produce a brief analysis for the user:

- List all sections in the phase with their inferred layers (DB / BE / FE)
- Identify cross-cutting concerns (e.g., auth touches DB + BE + FE)
- Identify dependency ordering (e.g., 2.1 DB schema must exist before 2.2 auth)
- Identify shared foundations (e.g., types used across multiple sections)
- Propose which sections need a full LLD vs which are sufficiently covered by the HLD

Present this overview and **wait for user confirmation** before generating the LLD files.

### Step 2: Generate LLD

Generate a **single file per phase** containing all sections. Each implementation plan section becomes a top-level heading within the file. This keeps cross-references co-located and gives a full picture of the phase.

**Layer inference rules** — determine which layers a section needs by examining its content:
- **DB**: Mentions tables, migrations, RLS, schema, database functions, seed data
- **BE**: Mentions API routes, middleware, server-side logic, webhooks, services, ports/adapters
- **FE**: Mentions pages, components, UI, forms, navigation, client-side state

**DRY principle** — do NOT duplicate content from the HLD. Instead:
- Reference HLD sections by link: `See [v1-design.md §4.2](v1-design.md#42-database-schema---l4-contracts)`
- Only add implementation-level detail the HLD does not contain: file paths, internal function signatures, component trees, state machines, error handling strategies, internal types not in the public contract

**File naming**: `docs/design/lld-phase-<N>-<short-name>.md`
Example: `docs/design/lld-phase-2-web-auth-db.md`

**Section mode** (`/lld 2.3`): Update the relevant section within the existing phase LLD file rather than creating a new file.

**Cross-cutting LLDs** (e.g., `lld-artefact-pipeline.md`) remain as standalone files when they span multiple phases or cover a topic orthogonal to the phase structure.

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
**Depends on:** Task M (if any)
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

### Step 4: Cross-references (phase mode only)

Add a `## Cross-References` section at the end of the phase LLD (before Tasks) noting:
- **Internal dependencies** between sections within this phase (as anchor links)
- **External dependencies** on other phase LLDs or cross-cutting LLDs (as file links)
- **Shared types or interfaces** that span multiple sections

## LLD Template

One file per phase. Each implementation plan section becomes a top-level heading.

```markdown
# Low-Level Design: Phase N — [Phase Name]

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.1 |
| Status | Draft |
| Author | LS / Claude |
| Created | [today's date] |
| Parent | [v1-design.md](v1-design.md) |
| Implementation plan | [Phase N](../plans/2026-03-09-v1-implementation-plan.md) |

---

## N.1 [Section Name]

**Stories:** [story numbers]
**Layers:** DB | BE | FE

### HLD coverage assessment
- [Section X.Y] — sufficient, referenced only
- [Section X.Z] — needs extension, detailed below

### [Layer: Database] (if applicable)

See [v1-design.md §N.N](v1-design.md#section-anchor) for [schema/RLS/functions].

[Only what the HLD doesn't cover: migration file strategy, seed data, test isolation, etc.]

### [Layer: Backend] (if applicable)

See [v1-design.md §N.N](v1-design.md#section-anchor) for [contracts].

#### File structure
` ` `
src/lib/module/
  file.ts          — [purpose]
  file.test.ts     — [what it tests]
` ` `

#### Internal types
[Types not in the public L4 contract but needed for implementation]

#### Function signatures
[Key internal functions with their signatures and behaviour]

#### Internal decomposition — [route or component]

For every non-trivial API route or component, add an explicit internal decomposition section
**before implementation begins**. Name every function, class, or interface that will exist
internally and state what is forbidden.

```
Controller (stays in route.ts, ≤ 5 lines):
- Calls auth helper — creates and owns all infrastructure clients (supabase, adminSupabase, githubClient)
- Calls service, passing clients as parameters
- Returns json(result) (or json(result, { status: 201 }) for creation)

Service ([endpoint]/service.ts):
- Exported: `serviceFn(supabase, adminSupabase, params): Promise<ResponseType>` — [one-line purpose]
- Receives all clients as parameters — never creates them internally (dependency injection)

  Private helpers (≤ 20 lines each):
  - `helperName(params): ReturnType` — [purpose and error behaviour]

Extracted to helpers.ts (if applicable):
- `pureFunction(...)` — [why extracted: testability, reuse]

> **Constraint:** The service must never call createClient(), createServiceClient(), or any infrastructure factory. Clients are created once at the controller boundary and injected downward. A service that creates its own client cannot be unit-tested without a live database.

> **Constraint:** [other hard limits, e.g. "do not create parameter structs whose only purpose is to bundle arguments — use a named type only when the parameters represent a genuine domain concept"]

Do NOT:
- [specific anti-pattern to avoid]
```

Use `> **Constraint:**` for notes written **before** implementation (hard limits for the implementing
agent). Use `> **Implementation note (issue #N):**` only to document decisions made **after**
implementation — these are historical records, not pre-implementation guidance.

#### Error handling
[Error cases, codes, and recovery strategies]

### [Layer: Frontend] (if applicable)

See [v1-design.md §N.N](v1-design.md#section-anchor) for [contracts].

#### Component tree
` ` `
PageComponent
  ├── SubComponent
  │   └── ChildComponent
  └── AnotherComponent
` ` `

#### Page routes
| Route | Component | Data fetching | Auth |
|-------|-----------|--------------|------|

#### UI states
| State | Trigger | Display |
|-------|---------|---------|
| Loading | Initial fetch | Skeleton |
| Error | API failure | Error message + retry |
| Empty | No data | Empty state message |
| Success | Data loaded | Content |

#### Client state
[What state lives on the client, how it's managed]

---

## N.2 [Next Section Name]

[Same structure as above]

---

## Cross-References

### Internal (within this phase)
- §N.1 depends on: —
- §N.2 depends on: [§N.1](#n1-section-name)
- ...

### External
- Depends on: [lld-artefact-pipeline.md](lld-artefact-pipeline.md) (if applicable)
- Depended on by: Phase M LLD (if applicable)

### Shared types
[Types used across multiple sections in this phase]

---

## Tasks

[Task entries per the format in Step 3, covering ALL sections in the phase]
```

## Guidelines

- The LLD is an **implementation guide**, not a design discussion. Decisions should already be made in the HLD and ADRs. If you find an undecided question, flag it to the user rather than deciding in the LLD.
- Keep LLDs focused and concise. If a section is just "see HLD", that's fine — it confirms the HLD is sufficient.
- Task granularity: each task should be completable in one `/feature` cycle. If a task would produce > 200 lines of changes, split it.
- BDD specs in tasks should be concrete enough for the `/feature` skill to write tests directly from them.
- Use British English in all documentation.
