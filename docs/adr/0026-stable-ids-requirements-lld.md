# 0026. Stable IDs for Requirements Stories and LLD Sections

**Date:** 2026-04-29
**Status:** Accepted
**Deciders:** LS / Claude

## Context

Cross-artefact traceability — knowing which LLD section implements which requirement,
and which source files delivered it — is currently computed dynamically by `/drift-scan`
using LLM inference each time. This works but is expensive, non-deterministic, and cannot
catch broken links mechanically.

The SPDD-inspired staged rollout plan (`local-docs/2026-04-29-spdd-staged-rollout-plan.md`)
identifies this as a genuine gap: story numbers (2.1) are positional, not identities.
Renumbering a story after review silently breaks any reference to it. There is no
lightweight way to verify that an LLD section still maps to the requirement it was
written to satisfy.

Two stages of the rollout plan depend on stable identifiers:

- **Stage 1** — mint slugs for every story in the pilot epic's requirements doc, so
  that any future artefact can reference a story by a stable anchor rather than a
  position number.
- **Stage 2** — emit anchors on LLD Part B sections and write a coverage manifest that
  links requirements → LLD sections → source files.

This ADR records the identifier format, placement rules, and scope conventions for both
stages so that the `/requirements` and `/lld` skills can implement them consistently.

Prior decisions that influence this one:

- **ADR-0018** — Epic/task organisation. Stories are already numbered within epics
  (1.1, 1.2 …); this ADR adds a parallel slug identity, it does not replace numbering.
- **ADR-0019** — Feature evaluator agent. The evaluator verifies AC coverage; stable
  IDs make that verification deterministic rather than text-match-based.
- **ADR-0021** — Project bootstrap pipeline. Requirements and LLD are formal pipeline
  artefacts; IDs must survive the full pipeline without renaming pressure.

## Options Considered

### Option 1: No stable IDs — keep position-based references

Continue using story numbers (2.1) and LLD heading text as identifiers. Drift-scan
infers coverage via LLM each time.

- **Pros:** Zero overhead; no convention to maintain.
- **Cons:** Position numbers change when stories are reordered or inserted. LLM
  coverage inference is non-deterministic and cannot verify broken links mechanically.
  Impossible to build a machine-readable coverage manifest (Stage 2) without stable
  keys.

### Option 2: Numeric IDs (`REQ-001`, `LLD-001`)

Auto-increment integers assigned sequentially across all epics.

- **Pros:** Short; unambiguous.
- **Cons:** Sequence resets are awkward across versions. Cannot infer epic or task
  context from the ID alone; harder to read in diffs and grep output.

### Option 3: Hierarchical slug IDs (`REQ-<epic-slug>-<story-slug>`, `LLD-<epic-id>-<section-slug>`)

Human-readable slugs derived from the epic and story/task names.

- **Pros:** Self-documenting — the ID encodes context. Survives story reordering (the
  slug stays the same even if the number changes). Greppable by epic slug. Aligns with
  the naming already used for LLD files (`lld-<epic-slug>-<task-slug>.md`).
- **Cons:** Slightly longer than numeric IDs. Slug collision is possible if two stories
  have near-identical names; resolved by adding a disambiguating suffix.

## Decision

**Option 3 — hierarchical slug IDs.**

### REQ- anchors (requirements stories)

Format: `REQ-<epic-slug>-<story-slug>`

- `<epic-slug>`: lower-kebab-case of the epic name, e.g. `project-management`.
- `<story-slug>`: lower-kebab-case of the story name, e.g. `create-project`.
- Full example: `REQ-project-management-create-project`.

Placement: an HTML anchor immediately before the story's `###` heading:

```markdown
<a id="REQ-project-management-create-project"></a>

### Story 1.1: Create a project
```

The story number (1.1) is retained for human reading and dependency ordering.
The slug is the stable linkable identity.

Scope: project-wide. Originally piloted on V11 (Stage 1 of the SPDD-inspired rollout
plan); promoted project-wide on 2026-05-04 after the V11 pilot landed cleanly and the
V12 requirements doc was written following the same convention. All new requirements
docs from V12 onwards MUST emit REQ- anchors on every story heading. Existing pre-V11
requirements docs are not retrofitted (no value in churning historical artefacts);
new artefacts and revisions follow the convention.

### LLD- anchors (LLD Part B sections)

Format: `LLD-<epic-id>-<section-slug>`

- `<epic-id>`: the canonical epic identifier as used in the LLD file name
  (`lld-<epic-id>-<short-name>.md` — e.g. `v11-e11-1`, `v11-e11-2`).
- `<section-slug>`: lower-kebab-case of the Part B section heading, e.g.
  `projects-api-create-list`, `fcs-create-api`, `schema`. Must be unique within the file.
- Full example: `LLD-v11-e11-1-projects-api-create-list`.

> **As-implemented note (2026-05-01).** The original draft of this ADR contemplated
> one LLD file per task, with the task slug embedded in the anchor. In practice the
> project ships **one LLD per epic** (see `lld-v11-e11-1-project-management.md`,
> `lld-v11-e11-2-fcs-scoped-to-projects.md`), each containing one Part B section per
> task. The anchor format above reflects the as-implemented convention. The `<task-slug>`
> component is dropped — task identity is carried by the section slug.

Placement: an HTML anchor immediately before the Part B section heading:

```markdown
<a id="LLD-v11-e11-1-projects-api-create-list"></a>

### B.3 — Task T1.3: Projects API (create + list)
```

### Coverage manifest

A YAML file `docs/design/coverage-<epic-id>.yaml` (e.g. `coverage-v11-e11-1.yaml`)
maps requirements to LLD sections:

```yaml
epic: <epic-id>
entries:
  - req: REQ-<epic-slug>-<story-slug>
    lld: lld-<epic-id>-<short-name>.md#LLD-<epic-id>-<section-slug>
    issue: null      # issue tracker number (e.g. GitHub issue #N); populated by /feature-end
    files: []        # populated by /feature-end after merge
    status: Approved # Draft | Approved | Implemented | Revised
```

The manifest is written by `/lld` (entries with empty `files`, `issue: null`, `status: Approved`)
and updated by `/feature-end` (issue number and file paths set, `status: Implemented`).
Detailed mechanics are owned by the relevant skills; this ADR records the schema
contract only.

## Consequences

- Story numbers remain unchanged — no renumbering churn. Slugs are additive metadata.
- Any artefact that needs to reference a requirement links to the anchor rather than
  the heading text. This makes broken references detectable with `grep`.
- LLD file naming convention (already `lld-<epic>-<task>.md` per ADR-0018) now
  doubles as the namespace for LLD anchors — no new naming system to learn.
- Project-wide as of 2026-05-04 (V11 pilot succeeded; V12 written under the same
  convention). Pre-V11 requirements docs not retrofitted — the cost of churning
  historical artefacts outweighs the marginal benefit, since drift detection on those
  versions is not the active workflow.
- Downstream skills must propagate REQ- anchors: `/kickoff` lists `Requirements
  covered:` per epic in the plan and per epic issue body; `/architect` and `/lld`
  carry them into LLD Part B sections (already required by this ADR); the
  `requirements-design-drift` agent uses anchor presence/absence as its mechanical
  coverage check (no longer pure LLM inference).
- `/requirements` skill must emit REQ- anchors when writing story headings (Step 3).
- `/lld` skill must emit LLD- anchors on Part B sections and initialise the coverage
  manifest (Stage 2).
- `/lld-sync` skill must preserve existing LLD- anchors when updating sections in-place,
  add LLD- anchors to any new Part B sections it introduces, and flip the matching
  coverage manifest entry's `status` to `Revised` when a Correction changes a section
  (Stage 2+).
- `/feature-end` skill must populate `files` and flip `status` in the manifest
  (Stage 3).
- Slug collision resolution: if two stories in the same epic produce the same slug,
  append `-2`, `-3` etc. Document the collision in a comment next to the anchor.
