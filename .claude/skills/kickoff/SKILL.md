---
name: kickoff
description: Bootstrap a new project from a requirements document. Produces the HLD (Levels 1–3), load-bearing ADRs, and the implementation plan, with human gates after each. Use at the very start of a project, before /architect. See ADR-0021.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Skill, TodoWrite
---

# Kickoff — Project Bootstrap

Takes a requirements document and produces the design artefacts needed before
`/architect` can generate LLDs and `/feature` can implement. Owns the
**Levels 1–3** of the design-down process (Capabilities, Components,
Interactions) at project-wide scope.

See [ADR-0021](../../../docs/adr/0021-project-bootstrap-pipeline.md) for the
rationale and [docs/process/engineering-process.md](../../../docs/process/engineering-process.md)
for where this fits in the full lifecycle.

**Model:** Use Opus (the latest Claude model) for this skill and any sub-agents
it spawns. When launching agents, pass `model: "opus"`.

**Usage:**

- `/kickoff` — reads the most recent file in `docs/requirements/`
- `/kickoff docs/requirements/v1-requirements.md` — reads a specific
  requirements file

## When to use

Run once per project (or once per major version) when:

- A requirements document exists in `docs/requirements/`
- No HLD exists yet, or the existing HLD is stale and being rewritten for a
  new version
- No implementation plan exists for this version

If an HLD and plan already exist and you only need per-epic LLDs, use
`/architect` instead.

## Inputs and outputs

**Inputs:**

- `docs/requirements/*.md` — user stories, acceptance criteria, constraints
- Existing `docs/adr/` — do not contradict accepted ADRs
- Existing `CLAUDE.md` — project conventions to preserve

**Outputs (in order):**

1. `docs/design/v1-design.md` — HLD covering Capabilities, Components,
   Interactions (Levels 1–3)
2. `docs/adr/NNNN-*.md` — one ADR per load-bearing decision the HLD forces
3. `docs/plans/YYYY-MM-DD-v1-implementation-plan.md` — phased plan derived
   from the HLD
4. GitHub epic issues plus Phase 0 task issues on the project board
5. Updated `CLAUDE.md` — fills in project-specific blocks (phase, stack,
   verification commands, project structure)

## Human gates

**Four** mandatory stop points. Do not proceed past any gate without explicit
user approval.

1. After the HLD is drafted — user reviews the drift-scan coverage matrix
2. After each ADR is drafted — user approves or rejects each individually
3. After the implementation plan is drafted — user reviews the second drift
   scan
4. After Phase 0 epics and task issues are proposed — user confirms before
   anything is created on the board

## Process

Execute these steps sequentially. Use `TodoWrite` to track progress.

### Step 1: Read inputs and orient

1. If `$ARGUMENTS` contains a file path, use that. Otherwise find the most
   recent `docs/requirements/*.md` file by modification date.
2. Read the requirements document fully. Extract: user stories, acceptance
   criteria, non-functional constraints, explicit technology choices, explicit
   non-goals.
3. List existing ADRs (`ls docs/adr/`) and read any that look load-bearing
   (auth, stack, storage, deployment). Do not re-decide what is already
   decided.
4. Read the current `CLAUDE.md` to understand project conventions.
5. Check for existing design artefacts:
   - `docs/design/v1-design.md` — if present, confirm with the user whether
     this run is a rewrite or an abort
   - `docs/plans/` — same check
6. Present a short orientation summary: what exists, what is missing, what
   will be produced. Wait for user confirmation before proceeding.

### Step 2: Draft the HLD (Levels 1–3)

Produce `docs/design/v1-design.md` with three sections matching the
design-down levels.

#### Level 1 — Capabilities

For each user story or requirement group, name the capability it delivers at
system level. One short paragraph per capability. No components yet, no
technology. Example: "Assess a feature: the system shall ingest a GitHub PR
reference and return a comprehension score with per-dimension breakdown."

Cross-check every requirement has at least one capability covering it. Flag
any requirement with no capability — this is where AI bias toward novel
problems shows up.

#### Level 2 — Components

Decompose the capabilities into components. For each component:

- **Name** and one-line purpose
- **Responsibilities** (bullet list, 3–6 items)
- **Non-responsibilities** (what it explicitly does not do) — this is the
  single most valuable section for catching boundary errors later
- **Depends on** (other components, external services)

Include a Mermaid component diagram showing the dependency graph.

Keep components abstract. "GitHub adapter" is a component; "Octokit 22.1.0" is
an implementation detail that belongs in an ADR.

#### Level 3 — Interactions

For the top 3–5 user flows, produce a sequence diagram (Mermaid) showing how
components collaborate. Include at least: the happy path for the primary
capability, the primary error path, and any flow that crosses a trust
boundary (auth, external API).

Each diagram is accompanied by a short prose walkthrough naming the
contracts that will need to be pinned down at Level 4 (but do not specify
them here).

#### HLD commit

```bash
git add docs/design/v1-design.md
git commit -m "docs: HLD v1 — capabilities, components, interactions"
```

### Step 3: Gate 1 — drift scan and human review

Run the `requirements-design-drift` agent against the requirements and the
freshly written HLD. The agent produces a coverage matrix: which requirement
maps to which capability and component.

Present the coverage matrix to the user. Flag:

- Uncovered requirements (critical — AI bias signal)
- Over-covered requirements (spec bloat)
- Components with no requirement (scope creep)

**Stop. Wait for explicit user approval before proceeding to Step 4.** The
user may direct patches to the HLD — apply them and re-run the drift scan
until the user is satisfied.

### Step 4: Propose and draft load-bearing ADRs

From the HLD, identify the decisions that are load-bearing — the ones that
shape multiple components or constrain future choices. Typical categories:

- Runtime / hosting
- Primary datastore
- Authentication and authorisation
- External service integration pattern
- Test strategy (unit/integration/E2E mix)
- Observability and logging
- Any framework choice that appears in multiple components

Present the proposed ADR list to the user with a one-line rationale per
entry. Wait for confirmation of the list before drafting any ADR.

For each confirmed ADR:

1. Use `/create-adr` to produce the ADR. Follow the project's ADR format and
   numbering (check `docs/adr/` for the next number).
2. Commit the ADR:
   ```bash
   git add docs/adr/NNNN-*.md
   git commit -m "docs: ADR-NNNN <title>"
   ```
3. **Stop after each ADR. Wait for explicit user approval** before drafting
   the next one. Small ADRs reviewed individually are cheaper to fix than a
   batch.

Do not draft ADRs for decisions that are not load-bearing. Those belong in
LLDs (Level 4) and are produced later by `/architect`.

### Step 5: Draft the implementation plan

Produce `docs/plans/YYYY-MM-DD-v1-implementation-plan.md` derived **from the
HLD**, not from the requirements directly. The plan's job is to sequence the
delivery of components and contracts, not activities.

Structure:

- **Phases** — typically Phase 0 (scaffolding / infra), Phase 1 (first
  end-to-end slice), Phase 2+ (additional capabilities). Each phase has a
  stated goal and exit criteria.
- **Per phase: epics** — each epic maps to a component or a capability slice
  from the HLD. Reference the HLD section explicitly.
- **Per epic: rough task list** — not enriched issues yet, just the shape of
  the work. `/architect` will turn these into LLDs later.
- **Dependencies** — explicit ordering between phases and between epics
  within a phase.
- **Cross-references** — every epic links to the HLD section and any ADRs it
  depends on.

Commit:

```bash
git add docs/plans/YYYY-MM-DD-v1-implementation-plan.md
git commit -m "docs: v1 implementation plan"
```

### Step 6: Gate 2 — second drift scan and human review

Run `requirements-design-drift` again, this time checking that the plan
covers the HLD (and therefore, transitively, the requirements). Present the
second coverage matrix.

**Stop. Wait for explicit user approval before proceeding to Step 7.** Apply
any requested patches and re-run until satisfied.

### Step 7: Bootstrap Phase 0 on the board

Create the GitHub artefacts — but only for Phase 0. Later phases stay
epic-level until their turn, to avoid generating stale issues upfront.

1. Propose the list of epics and Phase 0 tasks to the user with a summary
   table. **Wait for confirmation** before creating anything.
2. For each epic (all phases), create an epic issue using the shared script:
   ```bash
   BODY=$(cat <<'EOF'
   ## Scope
   ...

   ## Success criteria
   ...

   ## HLD reference
   docs/design/<design-doc>.md#<anchor>

   ## Related ADRs
   - ADR-NNNN ...

   ## Tasks
   - [ ] (to be added)
   EOF
   )
   RESULT=$(./scripts/gh-create-issue.sh \
     --title "Epic E<N>.<M>: <name>" \
     --body "$BODY" \
     --labels "epic,phase-<N>,area:<area>" \
     --add-to-board)
   # RESULT is "created:<number>" or "exists:<number>"
   ```
3. For Phase 0 epics only, create task issues using the shared script:
   ```bash
   BODY=$(cat <<'EOF'
   ## Parent epic
   #<epic-number>

   ## Design reference
   docs/design/lld-<epic-slug>.md

   ## Acceptance criteria
   - [ ] ...

   ## BDD specs
   ```
   describe('...')
     it('...')
   ```
   EOF
   )
   RESULT=$(./scripts/gh-create-issue.sh \
     --title "<task title>" \
     --body "$BODY" \
     --labels "phase-0,area:<area>,kind:task" \
     --add-to-board)
   ```
4. Update epic bodies with their task checklists.

### Step 8: Update CLAUDE.md

Fill in the project-specific blocks the template version of CLAUDE.md left
open:

- Current phase (set to Phase 0)
- Tech stack (derived from ADRs)
- Verification commands (type check, tests, lint, build)
- Project structure (directories that exist or will exist)

Commit:

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — project-specific configuration"
```

### Step 9: Write session log

Follow `.claude/skills/shared/session-log.md`. Use `<skill>=kickoff` and `<slug>=<project-slug>`. Include gate outcomes (drift scan verdicts from Steps 3 and 6) in the "What didn't go to plan" or a dedicated subsection.

### Step 10: Report and stop

Summarise to the user:

- HLD file produced
- ADRs produced (numbers and titles)
- Implementation plan file
- Epics created (all phases) and task issues created (Phase 0 only)
- Board state
- Drift scan verdicts (both runs)
- Suggested next step: run `/architect --epics E0` to produce LLDs for Phase 0

**Stop here.** Do not proceed to `/architect` or `/feature` automatically.
Project bootstrap is a deliberate, gated process — the user drives the
transition to implementation.

## Guidelines

- **Do not implement.** This skill produces design and planning artefacts
  only. Zero production code.
- **HLD before plan, always.** A plan drafted before the HLD plans activities
  rather than component deliveries. See ADR-0021.
- **One ADR at a time.** Batching ADR drafts makes review expensive and
  encourages rubber-stamping. Draft, commit, wait for approval, repeat.
- **Phase 0 only on the board.** Do not generate issues for later phases.
  They go stale before `/architect` ever touches them.
- **Respect existing ADRs.** If requirements contradict an accepted ADR, stop
  and ask — do not silently re-decide.
- **Drift scans are gates, not decoration.** Do not proceed past Step 3 or
  Step 6 without running the agent and showing the user the matrix.
- **British English** in all documentation.
- **Reference, do not duplicate.** The HLD references requirements; ADRs
  reference the HLD; the plan references both. Every artefact has exactly
  one source of truth.
- **Do not invent requirements.** If the requirements document is ambiguous,
  stop and ask rather than inferring.
- **Keep the HLD proportional.** Three levels covering the main shape of the
  system — not an exhaustive design. Level 4 detail belongs in LLDs produced
  by `/architect`, not here.
- **No Co-Authored-By trailers** in commit messages.
