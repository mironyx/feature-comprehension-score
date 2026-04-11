---
name: requirements
description: Transform discovery output or a freeform brief into a structured requirements document with epics, prioritised user stories, and testable acceptance criteria. Use after /discovery (or standalone for smaller projects) and before /kickoff.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, TodoWrite, WebSearch, WebFetch, Agent
---

# Requirements — Structured Requirements Generation

Takes a discovery document or a freeform brief and produces a structured
requirements document with epics, user stories, acceptance criteria, and
priority ordering. Bridges the gap between problem exploration and project
bootstrap.

```
/discovery  →  /requirements  →  /kickoff  →  /architect  →  /feature
```

For smaller projects without a discovery doc, accepts a freeform prompt or
brief directly.

**Model:** Use Opus (the latest Claude model) for this skill and any sub-agents
it spawns. When launching agents, pass `model: "opus"`.

**Usage:**

- `/requirements` — reads the most recent `docs/discovery/v*-discovery.md`
- `/requirements docs/discovery/v2-discovery.md` — reads a specific discovery
  doc
- `/requirements` (with existing requirements doc) — re-reads the doc,
  addresses `[Review]` comments, and continues from where it stopped
- `/requirements "Brief description of what needs building"` — works from a
  freeform prompt when no discovery doc exists

## When to use

- After `/discovery` has produced a finalised discovery document
- For smaller projects where a full discovery cycle is unnecessary — provide a
  freeform brief instead
- When requirements need a major rewrite for a new version

If structured requirements already exist in `docs/requirements/` and only need
minor updates, edit them directly rather than re-running this skill.

## Inputs and outputs

**Inputs (one of):**

- `docs/discovery/v{N}-discovery.md` — structured discovery document (preferred)
- Freeform brief — a prompt argument describing what needs building (for
  smaller projects)
- Human feedback via `[Review]` inline comments in an existing requirements doc

**Outputs:**

- `docs/requirements/v{N}-requirements.md` — structured requirements document

## Review comments

The human reviewer adds feedback directly in the requirements document using
blockquote markers:

```markdown
> **[Review]:** This story is too broad — split into setup and configuration
```

When the skill is re-invoked (or continues after a gate), it:

1. Scans the document for all `[Review]` markers
2. Addresses each one (update, split, remove, or explain why not)
3. Removes the resolved `[Review]` markers
4. Presents a summary of what changed

## Human gates

**Two** mandatory stop points.

1. **After structure** (Step 3) — glossary, roles, and epic/story structure are
   drafted (titles and one-line descriptions, no ACs yet). The human validates:
   are these the right epics and stories? Is the priority ordering sensible?
2. **After full document** (Step 5) — acceptance criteria are written and
   testability validation is complete. The human validates: are the ACs
   testable and complete?

## Process

Execute these steps sequentially. Use `TodoWrite` to track progress.

### Step 1: Read inputs and orient

1. Determine the input source:
   - If `$ARGUMENTS` contains a file path, use that.
   - If `$ARGUMENTS` contains a quoted string or freeform text (not a file
     path), treat it as a brief.
   - Otherwise, find the most recent `docs/discovery/v*-discovery.md` by
     modification date.
2. Read the input fully. Extract:
   - **From a discovery doc:** vision, boundaries (Is / Is Not), personas,
     user journeys, feature catalogue, MVP sequencer.
   - **From a freeform brief:** core concept, target users, stated
     constraints, known scope boundaries, any explicit non-goals.
3. Check for an existing requirements doc
   (`docs/requirements/v*-requirements.md`):
   - If present, check for `[Review]` markers. If found, this is a review
     cycle — jump to the **Review cycle** section below.
   - If present with no markers, confirm with the user: rewrite or update
     specific sections?
4. Check for existing project artefacts (`docs/design/`, `docs/adr/`,
   `docs/plans/`) — if substantial artefacts exist, warn the user that
   requirements changes may drift from existing design. Confirm they want to
   proceed.
5. Present a short orientation: what input was found, how many features/
   journeys it contains, and the two-gate process. Wait for user confirmation.

### Step 2: Domain clarification (freeform brief only)

If working from a freeform brief (not a discovery doc), do light research to
fill gaps:

1. Use `WebSearch` for 2–3 targeted searches on the problem domain.
2. Identify likely user roles and primary workflows.
3. Draft a brief scope summary (5–10 bullet points) and present to the user
   for confirmation before proceeding.

Skip this step entirely when working from a discovery doc — that research is
already done.

### Step 3: Draft document structure

Create `docs/requirements/v{N}-requirements.md` with the following sections.
At this stage, epics and stories have titles and one-line descriptions only —
no acceptance criteria yet.

#### Header

```markdown
# <Project Name> — V{N} Requirements

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.1 |
| Status | Draft — Structure |
| Author | LS / Claude |
| Created | YYYY-MM-DD |
| Last updated | YYYY-MM-DD |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | YYYY-MM-DD | LS / Claude | Initial draft |

---
```

#### Glossary

Define domain-specific terms used throughout the document. 5–15 entries
typical. Source from the discovery doc's domain research or from the brief.

```markdown
## Glossary

| Term | Definition |
|------|-----------|
| **Term** | One-line definition |
```

#### Roles

Identify user roles from personas (discovery) or from the brief. For each:

```markdown
## Roles

| Role | Type | Description |
|------|------|-----------|
| **Role Name** | Persistent / Contextual | What this role does |
```

- **Persistent** roles exist across the system (e.g., Admin, User)
- **Contextual** roles are situational (e.g., Author on a specific PR)

Include notes on role relationships and permission boundaries.

#### Epics and stories (structure only)

Organise features into epics. Each epic groups related stories into a
deliverable capability.

**Priority ordering:** Epics are numbered in priority order (highest first).
Within each epic, stories are numbered in dependency/priority order. State
the rationale for the ordering.

```markdown
## Epic 1: <Name> [Priority: High]

<One paragraph describing the epic's scope and why it's prioritised here.>

### Story 1.1: <Name>

**As a** <role>,
**I want to** <action>,
**so that** <value>.

*(Acceptance criteria in next pass)*

---
```

**Mapping rules:**

- **From discovery doc:** each Wave 1 feature → stories within epics.
  Wave 2 features → separate epics or a "V2" appendix section depending on
  scope. Wave 3+ → out of scope, referenced in a "Future" section.
- **From freeform brief:** identify natural capability groups and create
  epics. If the brief is thin, propose 3–5 epics and ask for confirmation.

#### Cross-cutting concerns

A section for requirements that span multiple epics (security, performance,
observability, accessibility). These become constraints or non-functional
requirements rather than user stories.

```markdown
## Cross-Cutting Concerns

### Security
- <requirement>

### Performance
- <requirement>

### Observability
- <requirement>
```

#### Commit

```bash
git add docs/requirements/v{N}-requirements.md
git commit -m "docs: v{N} requirements structure — epics, stories, roles"
```

### Gate 1 — Structure review

Present to the user:

- Epic count and priority ordering with rationale
- Story count per epic
- Role summary
- Mapping coverage: which discovery features/journeys are covered, which are
  deferred
- Any open questions or ambiguities found during structuring

Ask explicitly: **"Are these the right epics and stories? Is the priority
ordering sensible? Any [Review] comments before I write acceptance criteria?"**

**Stop. Wait for explicit user approval.** The user may:

- Approve and continue
- Add `[Review]` comments in the doc and re-invoke `/requirements`
- Reorder priorities, merge/split epics, add/remove stories

### Step 4: Write acceptance criteria

For each story, write acceptance criteria in Given/When/Then format:

```markdown
**Acceptance Criteria:**

- Given <precondition>, when <action>, then <outcome>.
- Given <precondition>, when <action>, then <outcome>.
```

**INVEST check** — as you write each story, verify:

| Property | Check |
|----------|-------|
| **Independent** | Can this story be implemented without requiring another story in the same epic to be done first? If not, note the dependency. |
| **Negotiable** | Are the ACs specific enough to test but flexible enough to allow implementation choices? |
| **Valuable** | Does the story deliver value to at least one role? |
| **Estimable** | Is the scope clear enough that a developer could estimate effort? |
| **Small** | Can this story be implemented in a single PR (< 200 lines)? If not, consider splitting. |
| **Testable** | Does every AC have a clear pass/fail condition? |

Add **Notes** after ACs where useful: technical constraints, references to
discovery findings, dependencies on other stories.

Update the document status:

```markdown
| Status | Draft — Complete |
```

#### Commit

```bash
git add docs/requirements/v{N}-requirements.md
git commit -m "docs: v{N} requirements — acceptance criteria"
```

### Step 5: Testability validation

Scan every acceptance criterion in the document and evaluate testability.
This is the evaluator step — catch problems before they propagate to design
and implementation.

**For each AC, check:**

1. **Specific outcome** — does the AC state a concrete, observable result?
   Fail: "the system handles errors gracefully." Pass: "given an invalid
   token, the API returns 401 with error body `{error: 'unauthorized'}`."
2. **Precondition clarity** — is the Given clause specific enough to set up
   in a test? Fail: "given a typical user." Pass: "given an authenticated
   user with Org Admin role."
3. **No vague qualifiers** — flag: "appropriate", "reasonable", "user-
   friendly", "fast", "secure" without measurable criteria.
4. **Completeness** — are negative cases covered? (invalid input, permission
   denied, not found, concurrent access)

**Output a testability report** as a table:

```markdown
### Testability Validation

| Epic | Story | AC # | Issue | Suggested fix |
|------|-------|------|-------|---------------|
| 1 | 1.2 | 3 | Vague: "appropriate message" | Specify the message or error code |
| 2 | 2.1 | — | Missing negative case | Add AC for invalid input |
```

If issues are found:

1. Fix them in-place in the requirements document
2. Note the fixes in the change log
3. Commit:
   ```bash
   git add docs/requirements/v{N}-requirements.md
   git commit -m "docs: v{N} requirements — testability fixes"
   ```

If no issues are found, state that explicitly.

### Gate 2 — Full document review

Present to the user:

- Total story count and AC count
- Testability report (issues found and fixed)
- Any stories that were split or merged during AC writing
- INVEST violations found and how they were addressed
- Open questions or ambiguities that need human decision

Ask explicitly: **"Are the acceptance criteria testable and complete? Any
[Review] comments before I finalise?"**

**Stop. Wait for explicit user approval.** The user may:

- Approve — the requirements doc is ready for `/kickoff`
- Add `[Review]` comments and re-invoke `/requirements`
- Request changes to specific ACs or stories

### Step 6: Finalise

After Gate 2 approval:

1. Update the status to `Final` and bump the version
2. Add a "Next steps" section:

```markdown
## Next steps

1. Run `/kickoff docs/requirements/v{N}-requirements.md` to produce HLD,
   ADRs, and implementation plan
```

3. If a V2 / Future section exists, note it as input for future discovery
   cycles
4. Commit:
   ```bash
   git add docs/requirements/v{N}-requirements.md
   git commit -m "docs: finalise v{N} requirements"
   ```
5. Report to the user: what was produced, key decisions, and suggested next
   step.

**Stop here.** Do not proceed to `/kickoff` automatically.

---

## Review cycle

When re-invoked on a requirements doc that has `[Review]` markers:

1. Read the full document
2. Grep for `> **[Review]:**` markers
3. For each marker:
   - Read the comment and the surrounding context
   - Determine the appropriate action: update AC, split story, merge stories,
     reprioritise, add missing case, or push back with reasoning
   - Apply the change
   - Remove the `[Review]` marker
4. Present a summary: which markers were found, what changed for each
5. If the document was at Gate 1 (status: `Draft — Structure`), continue to
   Step 4
6. If the document was at Gate 2 (status: `Draft — Complete`), re-run
   testability validation (Step 5) and re-present Gate 2 summary
7. Commit changes:
   ```bash
   git add docs/requirements/v{N}-requirements.md
   git commit -m "docs: address requirements review comments"
   ```

---

## Output format reference

The output follows the format established by `docs/requirements/v1-requirements.md`.
Key conventions:

- Epics are numbered sequentially: `## Epic 1:`, `## Epic 2:`
- Stories use dotted numbering within their epic: `### Story 1.1:`,
  `### Story 1.2:`
- ACs use Given/When/Then in bullet list format
- Notes and technical mechanism sections appear after ACs where relevant
- Cross-cutting concerns appear after all epics
- V2/Future items appear in an appendix section, clearly separated from V1
  scope
- Change log tracks every revision with version, date, author, and summary

---

## Guidelines

- **Requirements, not design.** This skill produces what the system must do,
  not how it's built. No components, no architecture, no technology choices.
  Those belong in `/kickoff` and `/architect`.
- **Discovery informs, does not dictate.** The discovery doc is input, not
  gospel. Challenge feature priorities, split oversized features, and add
  missing cases. The requirements doc is the authoritative scope statement.
- **INVEST is a lens, not a ceremony.** Check properties as you write. Do
  not produce a separate INVEST compliance report — fix issues inline.
- **Priority is a point of view.** State the rationale for epic ordering
  explicitly so the human can challenge it. Consider: user value, technical
  dependency, risk reduction, and learning value.
- **Testable means automatable.** Every AC should be expressible as an
  automated test. If you cannot describe the test setup and assertion, the
  AC is too vague.
- **British English** in all documentation.
- **Small stories.** Target stories that fit in a single PR (< 200 lines).
  If a story feels large, split it. Prefer more small stories over fewer
  large ones.
- **Negative cases matter.** For every happy-path AC, consider: what happens
  with invalid input? Missing permissions? Concurrent access? Network
  failure? Not every story needs all of these, but the omission should be
  deliberate.
- **Do not invent requirements.** If the discovery doc or brief is ambiguous,
  stop and ask the user rather than inferring. Flag ambiguities in the Gate
  presentations.
- **Keep it proportional.** A small project gets a concise requirements doc.
  Do not inflate three features into enterprise-scale epics.
- **Reference, do not duplicate.** Point to the discovery doc for background
  context rather than restating research findings.
- **No Co-Authored-By trailers** in commit messages.
