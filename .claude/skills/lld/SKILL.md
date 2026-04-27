---
name: lld
description: Generate Low-Level Design documents for implementation plan sections. Produces LLDs with implementation-level detail, file paths, internal types, and task breakdowns. Use for preparing a phase or section before implementation.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
---

# Low-Level Design — Generation Skill

Generates implementation-ready Low-Level Design documents from the implementation plan and high-level design.

## Arguments

`$ARGUMENTS` determines the scope:

- **Epic mode** (e.g., `epic 45`, `epic <number>`): Generate one LLD per task in the epic. This is the primary mode for new work. Reads the epic issue, identifies tasks, and produces `lld-<epic-slug>-<task-slug>.md` per task.
- **Phase mode** (e.g., `phase2`, `phase 2`): Generate LLDs for ALL sections in the phase. Legacy mode for existing phase-based work.
- **Section mode** (e.g., `2.3`, `2.1`): Regenerate or refine a single section's LLD. Use after reviewing phase output.
- **No arguments**: Ask the user which epic, phase, or section to target.

## Process

### Step 0: Read context

**Epic mode:**

1. Read the epic issue: `gh issue view <number>`. Extract the task list and scope.
2. For each task issue, read the issue body: `gh issue view <task-number>`.
3. Read the high-level design: `docs/design/v1-design.md`. Identify relevant sections.
4. Read existing LLDs in `docs/design/` to understand the established format and avoid duplication.
5. Read relevant ADRs from `docs/adr/`.
6. Read relevant requirements from `docs/requirements/v1-requirements.md`.
7. Read existing source code in `src/` to understand what already exists.

**Phase mode:**

1. Read the implementation plan: `docs/plans/2026-03-09-v1-implementation-plan.md`. Extract all sections for the target phase.
2. Read the high-level design: `docs/design/v1-design.md`. Identify which L4 contract sections are relevant.
3. Read existing LLDs in `docs/design/` to understand the established format and avoid duplication.
4. Read relevant ADRs from `docs/adr/` referenced by the phase sections.
5. Read relevant requirements from `docs/requirements/v1-requirements.md` for the stories referenced.
6. Read existing source code in `src/` to understand what already exists.

### Step 1: Overview (epic mode or phase mode)

Before generating individual LLDs, produce a brief analysis for the user:

- List all sections in the phase with their inferred layers (DB / BE / FE)
- Identify cross-cutting concerns (e.g., auth touches DB + BE + FE)
- Identify dependency ordering (e.g., 2.1 DB schema must exist before 2.2 auth)
- Identify shared foundations (e.g., types used across multiple sections)
- Propose which sections need a full LLD vs which are sufficiently covered by the HLD

Present this overview and **wait for user confirmation** before generating the LLD files.

### Step 2: Generate LLD

**Epic mode:** Generate **one file per task** in the epic. Each task gets its own standalone LLD. File naming: `docs/design/lld-<epic-slug>-<task-slug>.md`.

**Phase mode:** Generate a **single file per phase** containing all sections. Each implementation plan section becomes a top-level heading within the file. File naming: `docs/design/lld-phase-<N>-<short-name>.md`.

**Layer inference rules** — determine which layers a section needs by examining its content:
- **DB**: Mentions tables, migrations, RLS, schema, database functions, seed data
- **BE**: Mentions API routes, middleware, server-side logic, webhooks, services, ports/adapters
- **FE**: Mentions pages, components, UI, forms, navigation, client-side state

**DRY principle** — do NOT duplicate content from the HLD. Instead:
- Reference HLD sections by link: `See [v1-design.md §4.2](v1-design.md#42-database-schema---l4-contracts)`
- Only add implementation-level detail the HLD does not contain: file paths, internal function signatures, component trees, state machines, error handling strategies, internal types not in the public contract

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

### Step 4: Cross-references (epic mode and phase mode)

Add a `## Cross-References` section at the end of the phase LLD (before Tasks) noting:
- **Internal dependencies** between sections within this phase (as anchor links)
- **External dependencies** on other phase LLDs or cross-cutting LLDs (as file links)
- **Shared types or interfaces** that span multiple sections

## LLD Template

The LLD is structured in two parts. **Part A** is for human review — a reviewer can read
Part A alone and build sufficient theory about the feature. **Part B** is for the implementing
agent — detailed enough for `/feature` to produce correct code autonomously.

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

# Part A — Human-Reviewable Design

> Both the human reviewer and the implementing agent read this part.
> For the reviewer, it builds theory about the feature. For the agent, it provides
> the conceptual foundation that Part B's details depend on.
> It answers: what does the feature do, how do the parts interact,
> what must always be true, and how do we know it works.

## N.1 [Section Name]

**Stories:** [story numbers]
**Layers:** DB | BE | FE

### Purpose
[1-3 sentences: what this section delivers and why]

### Behavioural Flows

Sequence diagrams for every non-trivial interaction (>2 components communicating).
Use mermaid `sequenceDiagram` syntax. One diagram per key flow (happy path, error path,
async/webhook flows as needed).

` ` `mermaid
sequenceDiagram
    participant Client
    participant API as API Route
    participant Service
    participant DB as Database

    Client->>API: POST /api/example
    API->>Service: processRequest(ctx, params)
    Service->>DB: query(...)
    DB-->>Service: rows
    Service-->>API: Result
    API-->>Client: 200 OK
` ` `

**When required:** Any flow involving >2 components or services. API routes with
auth + service + DB. Webhook handling chains. Multi-step UI interactions with server calls.

**When optional:** Single-component CRUD. Pure utility functions. Schema-only changes.

### Structural Overview

Module/class dependency diagram showing how the pieces fit together. Use mermaid
`classDiagram` syntax. Works for both class-based and module-based codebases:

- **Classes** — show with methods and relationships (inheritance, composition)
- **Modules** — use `<<module>>` stereotype, show exported functions
- **Interfaces/Ports** — use `<<interface>>`, show who implements them
- **Direction** — arrows show dependency direction (who depends on whom)

` ` `mermaid
classDiagram
    class engine/scoring {
        <<module>>
        +calculateScore(responses) Score
        +buildDimensions(config) Dimension[]
    }
    class ports/github {
        <<interface>>
        +fetchPRs(org, repo) PR[]
    }
    class adapters/github {
        <<module>>
        +createGitHubClient(token) GitHubPort
    }
    engine/scoring --> ports/github : depends on
    adapters/github ..|> ports/github : implements
` ` `

**When required:** Any task that introduces new modules/classes, modifies module boundaries,
or adds new dependencies between existing modules. Changes touching the ports/adapters layer.

**When optional:** Changes within a single existing module that do not alter its public
surface or dependencies.

### Invariants

Hard constraints that the implementation must satisfy. Collected in one place so the
reviewer can sign off on them and automated tools (`/pr-review-v2`, `/feature-evaluator`)
can verify them.

Each invariant should be testable — either by a unit test, a type check, or a lint rule.

| # | Invariant | Verification |
|---|-----------|-------------|
| 1 | [e.g. Service never calls createClient() directly] | [e.g. grep for import; unit test with mock ApiContext] |
| 2 | [e.g. Webhook replay is idempotent — no duplicate rows] | [e.g. test calls handler twice, asserts row count unchanged] |
| 3 | [e.g. Engine module has zero framework imports] | [e.g. grep src/lib/engine/ for 'next', 'supabase'] |

### Acceptance Criteria

- [ ] [Concrete, testable criterion]
- [ ] [Another criterion]

### BDD Specs

` ` `ts
describe('[context]', () => {
  it('[behaviour — given/when/then]');
  it('[another behaviour]');
});
` ` `

### HLD coverage assessment
- [Section X.Y] — sufficient, referenced only
- [Section X.Z] — needs extension, detailed below

---

# Part B — Agent Implementation Detail

> The implementing agent (`/feature`) reads both parts — Part A for the conceptual
> model, Part B for precise file paths, types, function signatures, and decomposition
> rules. A human reviewer may scan Part B for completeness but does not need to
> review it line-by-line.

## N.1 [Section Name] — Implementation

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

> **Constraint:** For any type referencing a DB column, grep `src/types/database.types.ts` to confirm the contract type matches the Supabase-inferred enum or union. Mismatches cause `as unknown as` casts at the call site — fix the type here in the LLD, not downstream in the implementation.

#### Function signatures
[Key internal functions with their signatures and behaviour]

#### Internal decomposition — [route or component]

For every non-trivial API route or component, add an explicit internal decomposition section
**before implementation begins**. Name every function, class, or interface that will exist
internally and state what is forbidden.

```
Controller (stays in route.ts, ≤ 5 lines):
- const ctx = await createApiContext(request)   // per-request composition root: assembles all clients
- return json(await service.fn(ctx, params))    // injects context into service

Service ([endpoint]/service.ts):
- Exported: `serviceFn(ctx: ApiContext, params: ParamType): Promise<ResponseType>` — [one-line purpose]
- Receives ApiContext (DI) — never calls createClient() or any infrastructure factory

  Private helpers (≤ 20 lines each):
  - `helperName(params): ReturnType` — [purpose and error behaviour]

Extracted to helpers.ts (if applicable):
- `pureFunction(...)` — [why extracted: testability, reuse]
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

> **Constraint (server components):** Use module-level render helper functions rather than JSX sub-components inside server component files. Sub-components defined in the same file are opaque to test traversal — `render()` returns a serialised tree, so `screen.getByRole` cannot cross a sub-component boundary. Module-level helpers keep assertions traversable without extra wrapper renders.

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

[Same Part A + Part B structure as above]

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

---

## Execution Order

### Dependency DAG

` ` `mermaid
graph LR
  T1[Task 1: ...] --> T3[Task 3: ...]
  T2[Task 2: ...] --> T3
` ` `

### Execution Waves

| Wave | Tasks | Blocked by | Notes |
|------|-------|------------|-------|
| 1 | Task 1, Task 2 | — | Parallelisable |
| 2 | Task 3 | Wave 1 | |
```

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
