---
name: lld-sync
description: Sync the LLD back to the implementation after a feature is complete. Reads the design spec and the actual code, produces a structured diff, and updates the LLD in-place. Run after implementation, before feature-end.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, TodoWrite
---

# LLD Sync — Post-Implementation Design Feedback Loop

Updates the Low-Level Design document to reflect what was actually built, capturing implementation
learnings back into the design so future features start from accurate specs.

**Run after implementation is complete, before `/feature-end`.**

This is the symmetric complement to `/lld` (which generates design _before_ implementation). Together
they close the Theory Building loop: design informs implementation, implementation corrects design.

## Arguments

`$ARGUMENTS` is the issue number (e.g., `52`). If omitted, infer from the current branch name
(`feat/<slug>` → look for `Closes #N` in the most recent PR or branch commits).

## Process

### Step 1: Gather context

1. Determine the issue number from `$ARGUMENTS` or from `git log --oneline -10 | grep -oP '#\d+'`.
2. Read the issue body: `gh issue view <number>`.
   - Extract the **LLD reference** (e.g., `§2.2 Task 3` or the design doc section).
   - Extract the **acceptance criteria** and **BDD specs**.
3. Identify which LLD file covers this issue:
   - Look for `docs/design/lld-phase-*.md` or `docs/design/lld-*.md`.
   - Read the relevant section (use Grep to find the task number/title).
4. Read the PR body for this branch:
   - `gh pr view --json body -q '.body'` (or `gh pr view <number> --json body -q '.body'`).
   - Look for a `## Design deviations` section — these are deliberate departures from the LLD
     that the implementer documented during `/feature-core` Step 3b.
   - Each deviation note explains what the LLD recommended, what was built instead, and why.
     Use these as the primary source for **Corrections** in Step 2.
5. Read all source files created or modified by this feature:
   - Use `git diff --name-only main...HEAD` to get the changed file list.
   - Read each `src/` file that changed.
6. Read the test file(s) to understand what behaviour was actually tested.

### Step 2: Analyse the delta

Compare what the LLD specified vs what was actually built. For each category, list findings:

**Additions** — things built that were not in the LLD spec (new files, new patterns, new decisions):
- Capture the _why_ from commit messages, PR description, or code comments.

**Corrections** — things the LLD got wrong that were fixed during implementation:
- Wrong client types, incorrect file structure, missing constraints, etc.
- These are the most important — they indicate where the design was inadequate.

**Omissions** — things the LLD specified that were not built (deferred, descoped, or superseded):
- Note whether each is deferred to a future issue or permanently dropped.

**Confirmations** — things the LLD specified that were built exactly as designed.
- Only note these if they are non-obvious (worth confirming for future readers).

### Step 3: Update the LLD

Edit the LLD in-place. Be surgical — do not rewrite sections that were correct.

For each Correction and Addition:
1. Update the relevant prose, code snippet, or file structure list.
2. Add a callout where the spec was materially wrong, using this format:
   ```
   > **Implementation note (issue #N):** [What was actually built and why it differed from the spec.]
   ```
3. For file structure changes, update the directory listing.
4. For type/interface changes, update the function signatures or type definitions.

For each Omission:
1. Mark deferred items with: `_(deferred → issue #N)_` or `_(descoped)_`.
2. Do not delete them — future readers benefit from knowing what was considered.

Update the LLD's Document Control table:
- Bump `Version` (e.g., `0.1` → `0.2`).
- Change `Status` from `Draft` to `Revised` (or `Revised` → `Revised v2`).
- Add a `Revised` row: `| Revised | [today's date] | Issue #N |`

### Step 4: Produce the sync report

Print a concise summary to the user:

```
## LLD Sync — Issue #N: [title]

### Corrections (spec was wrong)
- [item]: [what the spec said] → [what was built] — [why]

### Additions (not in spec)
- [item]: [what was added and why]

### Omissions (in spec but not built)
- [item]: [deferred/descoped]

### Confirmations (notable)
- [item]: built as specified

### LLD updated
File: docs/design/lld-phase-N-name.md §N.N
Version: 0.1 → 0.2
```

If there are no Corrections or Additions (spec was fully accurate), say so explicitly — this is
valuable signal that the LLD process is working well.

## Guidelines

- Do not change the LLD's overall structure or rewrite sections that were correct.
- Do not add opinions or recommendations — only record facts about what was built.
- If the LLD covered a section that hasn't been implemented yet (future phase), do not touch it.
- If the issue has no LLD reference, note this and scan for the most relevant LLD section by
  matching file paths and function names.
- Use British English in all documentation.
- The goal is accuracy, not coverage — a short, correct LLD is better than a long, wrong one.
