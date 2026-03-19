# 0013. Context File Resolution Strategy

**Date:** 2026-03-19
**Status:** Accepted
**Deciders:** LS, Claude

## Context

The artefact pipeline includes supplementary context files — design docs, ADRs, requirements — fetched
from the repo and included alongside PR artefacts to improve question quality. Three unresolved questions
were identified during implementation of `GitHubArtefactSource` (#47):

1. **Config scope** — `context_file_patterns` currently lives on `org_config` (org-level). But repos
   within the same org can have very different doc structures (monorepo vs. microservice, different
   conventions). An org-level pattern like `docs/adr/*.md` would silently return nothing for a repo
   that stores ADRs under `architecture/decisions/`.

2. **Which SHA to fetch at** — The current implementation uses `perPR[0].headSha` (the HEAD commit of
   the first PR's feature branch). The LLD (section 2.5) says "HEAD of the target branch". These are
   different. Context files are repo-level documentation that lives on `main` — a feature branch HEAD
   is the wrong reference point.

3. **PR-specific context file changes** — If a PR modifies a file that matches a context pattern (e.g.,
   an ADR is updated as part of the feature), the current approach would fetch the `main` version and
   miss the update. For multi-PR FCS assessments, only the first PR's HEAD is used — subsequent PRs are
   not scanned for context file changes.

Related decisions: [0008](0008-data-model-multi-tenancy.md) (multi-tenancy data model),
[0011](0011-artefact-extraction-strategy.md) (artefact extraction strategy).

## Options Considered

### Option A: Org-level config only, target branch HEAD (minimal fix)

Keep `context_file_patterns` on `org_config`. Fix the SHA to use the target branch HEAD (`main`) instead
of `perPR[0].headSha`. Do not detect PR-specific context file changes.

- **Pros:** Simple — no schema change, no per-PR scanning logic
- **Cons:** Org-wide patterns won't match repos with different doc structures; PR-updated docs are missed
- **Implications:** Orgs with heterogeneous repos must use broad patterns or get empty context files

### Option B: Repo-level config override, target branch HEAD

Add `context_file_patterns` to a per-repo config (new `repo_config` table or column on `repositories`).
Org-level patterns remain as the default; repo-level patterns override if set. Fetch at target branch HEAD.
Still no PR-specific detection.

- **Pros:** Each repo can define its own doc structure; org default works as a sensible fallback
- **Cons:** PR-updated docs are still missed; onboarding friction (repo admin must configure per repo)
- **Implications:** Schema migration needed; config resolution logic (org default → repo override)

### Option C: Repo-level config + target branch HEAD + PR-specific override

Same as Option B for config scope and base SHA. Additionally: for each PR, check which changed files
match the context patterns — if any do, include those PR versions instead of (or in addition to) the
`main` version. For multi-PR FCS, scan all PRs.

- **Pros:** Captures design doc updates that are part of the feature; most accurate context for assessment
- **Cons:** Adds per-PR scanning logic; "override vs. supplement" semantics need defining; more complex
- **Implications:** Richer artefact quality signal; better FCS questions when docs evolve with the feature

## Decision

**Option C — repo-level config, target branch HEAD as baseline, PR-specific override for modified context files.**

Reasoning:

1. **Repo-level config is necessary for correctness.** Org-level patterns are a convenience default but
   will fail silently for repos that don't match the org's assumed doc structure. Per-repo override is
   the minimum needed to be accurate. The org default remains useful for orgs with a uniform layout.

2. **Target branch HEAD is the right baseline.** Context files are stable documentation on `main`.
   A PR's feature branch HEAD may not have the latest merged docs from other concurrent PRs. `main`
   HEAD always reflects the canonical current state of the project's knowledge.

3. **PR-specific detection matters for FCS.** FCS assessments measure feature-level comprehension.
   If the feature included updating an ADR or design doc, that updated document is part of the feature's
   artefact set — not fetching it produces a worse assessment. For single PRCC assessments the impact
   is lower, but the logic is identical.

4. **"Override" semantics:** if a PR modifies a file matching a context pattern, the PR version
   replaces the `main` version for that file. This reflects the intended final state of the document
   as part of the feature. For multi-PR FCS, the latest PR (by merge date) wins, consistent with the
   file content merge strategy (ADR 0011 / LLD section 2.6).

## Consequences

- **`repositories` table needs a `context_file_patterns` column** (`text[] DEFAULT NULL`). `NULL` means
  "use org default". Schema migration required before the config service layer is built.
- **`org_config.context_file_patterns` becomes the org-level default** — no change to existing column,
  semantics clarified.
- **Config resolution in the adapter/service:** `repo_patterns ?? org_patterns ?? []`
- **`fetchContextFiles` must accept a target branch ref** (`main` or the repo's default branch), not
  `perPR[0].headSha`. The `PRExtractionParams` interface needs a `defaultBranch` field, or the adapter
  resolves it via a separate API call.
- **`extractSinglePR` must identify context file changes within each PR** by intersecting `changedFiles`
  with the resolved context patterns, and include those as PR-specific overrides.
- **For multi-PR FCS, all PRs are scanned** — not just the first. The merge strategy (last PR wins by
  merge date) applies to context file overrides as it does to file contents.
- **We explicitly chose NOT to supplement (add PR version alongside main version)** — override is
  simpler and avoids duplicate content. The PR version is the more relevant one for assessment purposes.
- **LLD section 2.5 must be updated** to reflect this strategy.
- **Open issue:** `PRExtractionParams` does not currently carry `defaultBranch`. This must be added
  before the context file fetch is corrected. The webhook handler knows the default branch from the
  GitHub webhook payload (`repository.default_branch`).
