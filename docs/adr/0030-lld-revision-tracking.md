# 0030. LLD Revisions via Architect Addendum + lld-sync Reconciliation

**Date:** 2026-05-03
**Status:** Accepted
**Deciders:** LS / Claude

## Context

Requirements evolve after LLDs ship. v11-requirements rev 10 adds ACs to seven
already-implemented stories — the four V11 LLDs must absorb the new work
without rewriting the body. This is the first time we've hit it; the pattern
will repeat on every later revision.

The LLD body is detailed and load-bearing. Editing it surgically from
`/architect` is risky — the implementing agent often picks an approach that
diverges from the LLD's prescription, leaving the LLD ahead of the code with
no clean reconciliation path. We want a flow that:

- Lets `/architect` describe new work without touching the LLD body.
- Lets `/feature-core` read both the prior design and the new intent in one
  place, exercising judgement.
- Restores a single source of truth after the work ships, by reconciling the
  LLD body against actual shipped code.

## Decision

`/architect` writes the LLD as today — Part A (human-facing overview) and
Part B (implementation contract sections). When invoked against a prior LLD
to absorb a requirements revision, it appends a `## Pending changes — Rev N`
section to Part B and updates Part A to reflect the new revision scope so a
human reading the doc sees the full picture. `/lld-sync` reconciles Part B
against shipped code after merge — that includes removing shipped Rev X
blocks and updating the body where the implementation diverged.

Authorship boundary:

- **`/architect`** writes Part A and Part B initially; on revision, extends
  Part A to mention the new scope and appends a Rev X section to Part B.
- **`/lld-sync`** reconciles Part B against shipped code (existing
  responsibility) and removes shipped Rev X blocks. Does not edit Part A.

### How `/architect` detects the delta

`/architect` is invoked with an **explicit intent** to compare revisions —
either a flag or a clear prompt phrasing such as "update LLDs for rev 10
against rev 9". When this intent is present, `/architect`:

- Diffs the requirements file across the two revisions (using `git diff` or
  by reading both versions).
- Filters the diff to content under REQ-anchors. Trusts agent judgement to
  ignore prose polishing, change-log churn, and frontmatter noise.
- Writes a `## Pending changes — Rev X` section at the end of each affected
  LLD.

Greenfield invocations (no prior LLD) behave as today — full design pass, no
diff.

### Rev X section format

Appended at the end of Part B:

```markdown
---

## Pending changes — Rev 2

> Implementation guidance for new/changed ACs from v11-requirements rev 10.
> `/lld-sync` removes this section once the work has shipped.

### Story 1.3 — Settings affordance prominence
<file paths, component reuse, anti-patterns, contracts as for any Part B section>

### Story 2.2 — Actions column parity
<...>
```

Part A (the human overview) is updated in place to mention the new revision
and what it covers — typically a one-line bullet under a "Recent revisions"
heading, or a short paragraph extension to the existing summary. Part A is
narrative; specifics live in Rev X under Part B.

Multiple revisions stack as additional `## Pending changes — Rev N` sections
if `/architect` runs again before sync. `/lld-sync` removes them
independently as their work ships (partial sync allowed).

### Skill obligations

- **`/architect`** — when invoked with a compare-revisions intent and a prior
  LLD exists, extend Part A with the new revision scope and append a Rev X
  section to Part B. Trust the agent to filter requirements-diff noise.
- **`/feature-core`** — reads the LLD as it does today. The Rev X section is
  another Part B section; the agent treats the LLD's content as guidance
  (existing posture). No special handling for Rev X.
- **`/lld-sync`** — after merge, reconciles Part B against shipped code
  (existing behaviour), removes Rev X blocks for shipped REQs, deletes the
  Rev X section heading once empty, and updates the manifest's
  `lld_revision` for the affected entries. Does not edit Part A.

These are clarifications of existing skill responsibilities — `/architect`
already writes LLDs; `/lld-sync` already reconciles body and status. No new
mechanics, only sharper rules.

### Manifest extension (one additive field)

```yaml
- req: REQ-<...>
  lld: lld-<...>.md#LLD-<...>
  issue: 444
  files: [...]
  status: Approved | Implemented | Revised   # unchanged from ADR-0026
  lld_revision: r2                           # the revision currently shipped (matches body)
```

`lld_revision` reflects the **current state of the code** — the revision the
LLD body expresses, which by `/lld-sync` invariant equals what shipped. It is
written only by `/lld-sync`. `/architect` does not touch this field; the
addendum's Rev X label is the unshipped intent.

Missing `lld_revision` on legacy entries is valid and means "possibly out of
sync — last shipped revision unknown". `/architect` and `/lld-sync` may treat
this as `r1` for diff-bound purposes.

## Consequences

- Part B is always trustworthy: post-sync the body reflects shipped code,
  and unshipped intent lives only in Rev X sections.
- Part A always reflects the latest scope a human cares about — including
  in-flight revisions.
- `/feature-core` requires no behaviour change. The LLD is read as today;
  Rev X is just another Part B section.
- Re-implementation case (rare): work from the body alone, ignore Rev X.
- Incremental case (common): work from body + Rev X.
- One operational risk: if `/lld-sync` is skipped after a merge, Rev X
  becomes stale. Mitigation: `/feature-end` invokes `/lld-sync` before
  closing the feature.
- Stacking is supported by construction — independent Rev X sections, each
  removable on partial sync.

## Relationship to ADR-0026

ADR-0026 fixed the REQ-/LLD- anchor format and the coverage-manifest schema
(`req`, `lld`, `issue`, `files`, `status`). This ADR adds **one** additive
manifest field (`lld_revision`) and pins the Rev X addendum convention
inside the LLD body. Anchor format unchanged. Status enum unchanged. Skill
ownership boundaries unchanged. Existing manifests remain valid (missing
`lld_revision` interpreted as "possibly out of sync, treat as r1 for diff
purposes").

## Alternatives considered

- **Separate per-revision file** (`lld-<epic>-rev2.md`). Cleaner lifecycle —
  born, used, deleted — but introduces N+1 files per epic over time, requires
  `/feature-core` and `/lld-sync` to discover and stitch them together, and
  complicates issue references. Rejected in favour of the single-file
  addendum.
- **Surgical edits to Part B body by `/architect` on revision.** Rejected —
  Part B is detailed and load-bearing; the implementing agent often diverges
  from prescriptions; reconciling Part B ahead of the code has no clean path
  back. The Rev X addendum keeps the body stable until `/lld-sync` runs.
  `/architect` still updates Part A in place, because Part A is narrative.
- **Auto-detection of revision delta by `/architect`.** Rejected in favour
  of explicit user intent ("compare revs N → M"). Simpler skill behaviour;
  user controls when the delta pass runs.
