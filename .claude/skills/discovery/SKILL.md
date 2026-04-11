---
name: discovery
description: Explore a problem space from a freeform idea using adapted Lean Inception activities. Produces a structured discovery document with product vision, boundaries, personas, user journeys, features, and MVP sequencing. Use before /kickoff when starting a new project or major version. Web research included.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, TodoWrite, WebSearch, WebFetch, Agent
---

# Discovery — Problem Space Exploration

Takes a freeform idea and explores the problem space through adapted Lean
Inception activities. Produces a structured discovery document that feeds into
`/kickoff` (and eventually a future `/requirements` skill).

Fills the gap in the pipeline:

```
idea.md  →  /discovery  →  discovery.md  →  /kickoff  →  HLD + ADRs + Plan
```

**Model:** Use Opus (the latest Claude model) for this skill and any sub-agents
it spawns. When launching agents, pass `model: "opus"`.

**Usage:**

- `/discovery` — reads the most recent `docs/discovery/*-idea.md` file
- `/discovery docs/discovery/v1-idea.md` — reads a specific idea file
- `/discovery` (with existing discovery doc) — re-reads the doc, addresses
  `[Review]` comments, and continues from where it stopped

## When to use

Run once per project or major version, **before** `/kickoff`, when:

- A human has an idea but no structured requirements yet
- The problem space is not well understood
- You need to validate scope, personas, and MVP boundaries before committing to
  a design

If structured requirements already exist in `docs/requirements/`, skip this and
go straight to `/kickoff`.

## Inputs and outputs

**Inputs:**

- `docs/discovery/*-idea.md` — freeform idea description (a sentence, a
  paragraph, a rough brief — any level of detail)
- Web research — competitive landscape, existing solutions, domain knowledge
- Human feedback via `[Review]` inline comments in the discovery doc

**Outputs:**

- `docs/discovery/v{N}-discovery.md` — structured discovery document covering
  all activities

## Review comments

The human reviewer adds feedback directly in the discovery document using
blockquote markers:

```markdown
> **[Review]:** I think this persona is too broad — split into admin vs viewer
```

When the skill is re-invoked (or continues after a gate), it:

1. Scans the document for all `[Review]` markers
2. Addresses each one (update, split, remove, or explain why not)
3. Removes the resolved `[Review]` markers
4. Presents a summary of what changed

This keeps feedback contextual and traceable.

## Human gates

**Two** mandatory stop points.

1. **After problem space** (Step 3) — vision, boundaries, personas are drafted.
   The human validates: are we exploring the right problem?
2. **After complete doc** (Step 5) — journeys, features, and MVP sequencing are
   drafted. The human validates: is this the right shape to hand to
   requirements/kickoff?

## Lean Inception — adapted activities

The original Lean Inception (Paulo Caroli) is a week-long collaborative
workshop for teams. This adaptation keeps the core activities and their
purpose but fits an AI-assisted context where:

- The "team" is one human + one AI agent
- Domain research is active (web search), not just whiteboard brainstorming
- Activities are sequential document sections, not workshop exercises
- The human reviews asynchronously via `[Review]` comments, not live discussion

### Activities mapped

| # | Lean Inception activity | Discovery section | Adaptation |
|---|------------------------|-------------------|------------|
| 1 | Product Vision | Vision statement | AI drafts from idea + research; human refines |
| 2 | Is / Is Not | Boundaries | Explicit scope table; prevents AI scope creep |
| 3 | Personas | Personas | Research-informed; includes pain points and goals |
| 4 | User Journeys | User journeys | Narrative flows per persona; maps to future user stories |
| 5 | Feature Brainstorm | Feature catalogue | Organised by journey; includes effort/value signals |
| 6 | Sequencer (MVP slicing) | MVP sequencer | Prioritised feature waves; defines what's in V1 vs later |

## Process

Execute these steps sequentially. Use `TodoWrite` to track progress.

### Step 1: Read the idea and orient

1. If `$ARGUMENTS` contains a file path, use that. Otherwise find the most
   recent `docs/discovery/*-idea.md` file by modification date.
2. Read the idea file fully. Extract: the core concept, any stated constraints,
   target users (if mentioned), known competitors (if mentioned), and any
   explicit non-goals.
3. Check for an existing discovery doc (`docs/discovery/v*-discovery.md`):
   - If present, check for `[Review]` markers. If found, this is a review
     cycle — jump to the **Review cycle** section below.
   - If present with no markers, confirm with the user: rewrite or continue
     from a specific section?
4. Check for existing project artefacts (`docs/requirements/`,
   `docs/design/`, `docs/adr/`) — if substantial artefacts exist, warn the
   user that `/discovery` is meant for greenfield exploration and confirm
   they want to proceed.
5. Present a short orientation: what the idea covers, what research directions
   look promising, and the two-gate process. Wait for user confirmation.

### Step 2: Domain research

Use `WebSearch` and `WebFetch` to research:

1. **Existing solutions** — what tools/products already solve this problem?
   Note their approach, strengths, and gaps.
2. **Domain concepts** — key terminology, frameworks, or standards in this
   space.
3. **Target audience** — who faces this problem? How do they currently cope?
4. **Market signals** — is this a growing need? Any recent articles, talks,
   or trends?

Compile research into internal notes (not in the output doc). These inform
every subsequent activity.

Do not over-research. Aim for 3–5 searches that cover the core landscape.
The goal is informed drafting, not exhaustive market analysis.

### Step 3: Draft problem space (Activities 1–3)

Create `docs/discovery/v{N}-discovery.md` with:

#### Header

```markdown
# Discovery: <Project Name>

Date: YYYY-MM-DD
Source: docs/discovery/v{N}-idea.md
Status: Draft — Problem Space

---
```

#### Activity 1 — Vision statement

A single paragraph (3–5 sentences) answering:

- **For** whom?
- **Whose** problem or need?
- **The** product/tool **is** a...
- **That** delivers what value?
- **Unlike** existing alternatives...
- **Our approach** differs because...

This follows Caroli's vision template but in prose, not fill-in-the-blank.

#### Activity 2 — Boundaries (Is / Is Not)

A four-quadrant table:

| | Is | Is Not |
|---|---|---|
| **The product** | What it does / is | What it explicitly does not do / is not |
| **The scope (V1)** | What's in V1 | What's deferred to later |

Each cell contains 3–6 bullet points. The "Is Not" column is the most
valuable — it prevents scope creep in all downstream artefacts.

#### Activity 3 — Personas

For each identified user type (typically 2–4):

```markdown
### Persona: <Name> (<Role>)

**Profile:** One-line description
**Goals:** What they want to achieve (bullet list, 2–4 items)
**Pain points:** What frustrates them today (bullet list, 2–4 items)
**Context:** How/when/where they'd use this product
**Quote:** A representative statement capturing their mindset
```

Personas are research-informed. Reference specific findings from Step 2
where relevant (e.g., "Based on [source], engineering leads spend X hours
per week on...").

#### Commit

```bash
git add docs/discovery/v{N}-discovery.md
git commit -m "docs: discovery problem space — vision, boundaries, personas"
```

### Gate 1 — Problem space review

Present to the user:

- The vision statement
- The boundaries table (highlight the "Is Not" column)
- The personas

Ask explicitly: **"Are we exploring the right problem? Any [Review] comments
before I continue to solution space?"**

**Stop. Wait for explicit user approval.** The user may:

- Approve and continue
- Add `[Review]` comments in the doc and re-invoke `/discovery`
- Redirect the exploration entirely

### Step 4: Draft solution space (Activities 4–6)

Continue the discovery document:

#### Activity 4 — User journeys

For each persona, describe 1–3 key journeys. Each journey is a narrative
flow:

```markdown
### Journey: <Persona> — <Goal>

**Trigger:** What initiates this journey
**Steps:**
1. <Action> → <System response>
2. <Action> → <System response>
3. ...
**Outcome:** What success looks like
**Pain points addressed:** Which persona pain points this resolves
```

Keep journeys at the behavioural level — what happens, not how it's built.
These map directly to user stories in a future requirements document.

#### Activity 5 — Feature catalogue

Extract features from the journeys. Organise by journey, not by technical
component:

```markdown
### Features

| # | Feature | Journey | Personas | Effort | Value | Notes |
|---|---------|---------|----------|--------|-------|-------|
| 1 | ... | J1 | Lead, Dev | M | H | ... |
```

- **Effort:** S / M / L (rough signal, not estimate)
- **Value:** H / M / L (based on persona pain points addressed)
- **Notes:** dependencies, risks, open questions

This is a brainstorm output — include features that might not make V1. The
sequencer (next activity) decides what's in and what's out.

#### Activity 6 — MVP sequencer

Organise features into delivery waves:

```markdown
### MVP Sequencer

#### Wave 1 — Core (minimum viable)
Features: #1, #3, #5
Rationale: <why these are essential for the first usable version>

#### Wave 2 — Enhanced
Features: #2, #7
Rationale: <why these come next>

#### Wave 3+ — Future
Features: #4, #6, #8
Rationale: <why these are deferred>
```

Rules for sequencing:

- Wave 1 must deliver value to at least one persona end-to-end
- Each wave builds on the previous — no wave requires features from a
  later wave
- "Is Not" boundaries from Activity 2 guide what goes to Wave 3+
- Features with high value and low effort are pulled forward; low value and
  high effort are pushed back

Update the document status:

```markdown
Status: Draft — Complete
```

#### Commit

```bash
git add docs/discovery/v{N}-discovery.md
git commit -m "docs: discovery solution space — journeys, features, sequencer"
```

### Gate 2 — Complete discovery review

Present to the user:

- Journey count and coverage (which personas, which goals)
- Feature catalogue summary (total features, effort/value distribution)
- MVP sequencer (wave breakdown with feature counts)
- Any open questions or tensions discovered during drafting

Ask explicitly: **"Is this the right shape? Any [Review] comments before I
finalise?"**

**Stop. Wait for explicit user approval.** The user may:

- Approve — the discovery doc is ready for `/kickoff`
- Add `[Review]` comments and re-invoke `/discovery`
- Request changes to sequencing or scope

### Step 5: Finalise

After Gate 2 approval:

1. Update the status to `Final`
2. Add a "Next steps" section pointing to `/kickoff`:

```markdown
## Next steps

1. Create `docs/requirements/v{N}-requirements.md` from this discovery
   (manually or via future `/requirements` skill)
2. Run `/kickoff docs/requirements/v{N}-requirements.md` to produce HLD,
   ADRs, and implementation plan
```

3. Commit:

```bash
git add docs/discovery/v{N}-discovery.md
git commit -m "docs: finalise discovery for v{N}"
```

4. Report to the user: what was produced, key decisions, and suggested
   next step.

**Stop here.** Do not proceed to `/kickoff` automatically.

---

## Review cycle

When re-invoked on a discovery doc that has `[Review]` markers:

1. Read the full document
2. Grep for `> **[Review]:**` markers
3. For each marker:
   - Read the comment and the surrounding context
   - Determine the appropriate action: update content, split a section,
     add detail, or push back with reasoning
   - Apply the change
   - Remove the `[Review]` marker
4. Present a summary: which markers were found, what changed for each
5. If the document was at Gate 1 (status: `Draft — Problem Space`),
   continue to Step 4
6. If the document was at Gate 2 (status: `Draft — Complete`), re-present
   Gate 2 summary
7. Commit changes:

```bash
git add docs/discovery/v{N}-discovery.md
git commit -m "docs: address discovery review comments"
```

---

## Guidelines

- **Do not write requirements.** This skill explores the problem space and
  catalogues features. Formal user stories with acceptance criteria belong
  in a requirements document (produced later, manually or via a future
  `/requirements` skill).
- **Do not design.** No components, no architecture, no technology choices.
  Those belong in `/kickoff` and `/architect`.
- **Research actively.** Use web search to ground the discovery in real
  domain knowledge, not just the human's initial idea. But keep research
  proportional — 3–5 searches, not 30.
- **British English** in all documentation.
- **"Is Not" is the most valuable column.** Spend disproportionate effort
  on boundaries. Every item in "Is Not" prevents scope creep downstream.
- **Personas are not archetypes.** Ground them in research findings and
  the specific problem space. "Power user" is not a persona.
- **Features, not solutions.** The feature catalogue describes what the
  product does, not how it's built. "Score assessment results" not
  "PostgreSQL aggregation query".
- **Sequencing is opinion.** The MVP sequencer reflects a point-of-view on
  what matters most. State the rationale explicitly so the human can
  challenge it.
- **Keep it proportional.** A simple idea gets a concise discovery doc.
  Do not inflate a straightforward concept into enterprise-scale analysis.
- **Reference, do not duplicate.** If the idea file contains constraints or
  decisions, reference them — do not restate.
