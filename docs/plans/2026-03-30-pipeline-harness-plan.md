# Pipeline & Harness Improvement Plan

## Overview

Fix the critical+high reliability issues from the skills review, build the `/architect` skill, and establish the canonical pipeline: `/create-plan` -> `/architect` -> human design review -> `/feature` (sequential) -> `/pr-review-v2` -> `/feature-end`.

**Two `/feature` modes** (sequential now, parallel later):

- **Sequential (priority — implement now):** No worktrees. Runs in the main workspace with full CodeScene + diagnostics support. Used from VS Code/Windsurf with Claude Code extension.
- **Parallel (future):** Worktrees. Runs without CodeScene. Designed for Claude CLI agent teams. Requires solving OTel per-worktree telemetry. Not in scope for this plan.

**`/feature-cont` is deprecated.** For context exhaustion, use compact (automatic) or switch to a larger model. Keeping items small is the primary mitigation.

## Current State

- 13 custom skills, 2 hooks, 1 PreCompact hook
- Skills review (2026-03-29) found 4 critical, 7 high, 5 medium, 5 low issues
- `/feature` creates worktrees — contradicts CLAUDE.md and breaks diagnostics pipeline
- `/feature-cont` has accumulated bugs (dead `/review` ref, wrong step order) and is rarely used — deprecate
- `/diag` references Windsurf by name and has tool/instruction mismatch
- `/pr-review` v1 still exists alongside v2 — confusing
- `py` vs `python3` inconsistency across skills and hooks
- No `/architect` skill — design happens ad-hoc during `/feature`

**Relevant ADRs:** None yet — logging ADR to be created during MVP Phase 2 work.

## Desired End State

- All skills reference editor-agnostically (no "Windsurf" hardcoding)
- `/feature` works in the main workspace (no worktrees) — sequential mode
- `/feature-cont` deprecated and removed from CLAUDE.md
- `/diag` can both detect and fix (model invocation enabled, Write/Edit tools added)
- `/pr-review` v1 deprecated — v2 is canonical
- `/simplify` prohibition documented in CLAUDE.md
- Session log naming includes issue number to prevent collisions
- Cross-platform Python wrapper used everywhere
- Anti-pattern checklist extracted to shared file
- `/architect` skill exists and produces batch design artefacts from a plan
- Future: parallel `/feature` mode for CLI agent teams (separate plan)

**Verification:**

- `grep -r "worktree" .claude/skills/feature/ .claude/skills/feature-end/` returns zero matches
- `grep -r "windsurf" .claude/skills/ .claude/hooks/` returns zero matches (or only in a generic "editor" wrapper)
- `grep -r '"/review"' .claude/skills/` returns zero matches
- `/feature-cont` is not invocable
- `/feature` on a test issue runs successfully in the main workspace
- `/architect` on the MVP Phase 2 plan produces design artefacts

## Out of Scope

- Parallel `/feature` mode with worktrees (future — needs OTel per-worktree, CLI agent teams design)
- `/feature-cont` bug fixes (skill is being deprecated, not repaired)
- Low-priority review items (#17-#21) unless trivially fixable alongside other work
- MVP Phase 2 feature implementation (separate plan: `docs/plans/2026-03-29-mvp-phase2-plan.md`)
- OTel/Prometheus infrastructure changes

## Approach

Single PR with one commit per logical fix. All changes are to skill files, hooks, settings, and CLAUDE.md — no production code changes. This keeps the PR reviewable while maintaining granular git history.

---

## Phase 1: Foundation Fixes (skills reliability)

All changes target `.claude/skills/`, `.claude/hooks/`, and `CLAUDE.md`. No production code.

### 1a. Cross-platform Python wrapper

**Why first:** Unblocks all other skills that call `py scripts/...`.

**Changes:**

- Create `.claude/hooks/run-python.sh` — tries `py`, `python3`, `python` in order, runs the rest of the arguments.
- Update all `py scripts/...` calls in:
  - `.claude/skills/feature/skill.md` (Steps 1, 8)
  - `.claude/skills/feature-cont/skill.md` (Step 1)
  - `.claude/skills/feature-end/skill.md` (Step 2.5)
  - `.claude/skills/pr-review/skill.md` (Step 5)
  - `.claude/skills/pr-review-v2/skill.md` (Step 5)
- Update `.claude/settings.json` PreCompact hook if it uses `py`.

**Replacement pattern:** `py scripts/foo.py` -> `.claude/hooks/run-python.sh scripts/foo.py`

#### Automated Verification

- [ ] `bash .claude/hooks/run-python.sh --version` prints a Python version on Windows
- [ ] `grep -r '^py ' .claude/skills/` returns zero matches
- [ ] `grep -r '"py ' .claude/settings.json` returns zero matches

#### Manual Verification

- [ ] `/feature` Step 1 (tag-session) runs without error

**Pause here for manual verification before proceeding to next phase.**

### 1b. Remove worktree code from `/feature` and `/feature-end`

**Why:** Sequential mode works in the main workspace. CodeScene and diagnostics need it.

**Changes to `/feature` (`skill.md`):**

- **Step 2:** Replace worktree creation with simple branch creation:
  ```
  git fetch origin main
  git checkout -b feat/<slug> origin/main
  ```
  Remove `WDIR` variable. All paths become relative to repo root (no `(cd "$WDIR" && ...)` wrapping).
- **Steps 3-10:** Remove all `(cd "$WDIR" && ...)` wrappers and `$WDIR`-prefixed paths. Commands run in the repo root.
- **Step 4:** Remove `windsurf --reuse-window` calls (handled by hook — see 1c).
- **Step 6:** Remove `windsurf --reuse-window` calls for missed files (handled by hook).
- **Blocker policy:** Remove worktree-related items.

**Changes to `/feature-end` (`skill.md`):**

- **Step 4:** Remove comment about running from "primary worktree". Merge runs from the repo root.
- **Step 5+6:** Remove worktree cleanup (`git worktree remove`). Keep branch cleanup.

#### Automated Verification

- [ ] `grep -ri "worktree" .claude/skills/feature/ .claude/skills/feature-end/` returns zero matches
- [ ] `grep -r "WDIR" .claude/skills/` returns zero matches

#### Manual Verification

- [ ] Read through `/feature` skill and verify all commands run from repo root

**Pause here for manual verification before proceeding to next phase.**

### 1c. Editor-agnostic references

**Changes:**

- `.claude/hooks/open-in-windsurf.sh` -> `.claude/hooks/open-in-editor.sh`:
  - Try `windsurf`, then `code`, then skip silently.
  - Use `--reuse-window` for whichever editor is found.
- `.claude/skills/diag/skill.md`:
  - Description: "Check VS Code/Windsurf extension diagnostics..." -> "Check diagnostics-exporter output for changed files."
  - Replace all `windsurf --reuse-window` with `.claude/hooks/open-in-editor.sh`.
  - Body text: replace "Windsurf" with "the editor" throughout.
- `.claude/skills/feature/skill.md`: Remove explicit `windsurf` calls (hook handles it).
- `.claude/settings.json`: Update hook filename reference.

#### Automated Verification

- [ ] `grep -ri "windsurf" .claude/skills/` returns zero matches
- [ ] `grep -r "windsurf" .claude/settings.json` returns zero matches (except possibly in the hook filename migration comment)

#### Manual Verification

- [ ] `.claude/hooks/open-in-editor.sh <file>` opens the file in the user's editor

**Pause here for manual verification before proceeding to next phase.**

### 1d. Deprecate `/feature-cont`

**Why:** Context exhaustion is handled by compact (automatic) or switching to a larger model. Keeping items small is the primary mitigation. `/feature-cont` has accumulated bugs and adds maintenance surface.

**Changes:**

- Rename `.claude/skills/feature-cont/skill.md` to `.claude/skills/feature-cont/skill.md.deprecated`.
- Remove `/feature-cont` from CLAUDE.md Custom Skills section.
- Add note to CLAUDE.md: "If context is exhausted mid-feature, compact will preserve state automatically. For large features, prefer breaking the issue into smaller sub-issues."

#### Automated Verification

- [ ] `/feature-cont` is not invocable (skill loader ignores `.md.deprecated`)
- [ ] `grep "feature-cont" CLAUDE.md` returns zero matches (except possibly in change log)

#### Manual Verification

- [ ] CLAUDE.md reflects the deprecation

**Pause here for manual verification before proceeding to next phase.**

### 1e. Fix `/diag` tool contradiction

**Decision:** Enable `/diag` to both detect AND fix. The PostToolUse hook is unreliable (only fires when the file is open in the editor). `/diag` is the authoritative diagnostics check — it needs to be self-contained.

**Changes:**

- Remove `disable-model-invocation: true` from frontmatter.
- Change `allowed-tools` to: `Read, Write, Edit, MultiEdit, Glob, Bash`.
- Keep the "fix every one of them" instruction — it's correct, the tools just weren't available.
- Keep Step 5 (confirm resolution) — `/diag` re-reads diagnostics after fixing to verify.

#### Automated Verification

- [ ] `grep "disable-model-invocation" .claude/skills/diag/skill.md` returns zero matches
- [ ] `grep "allowed-tools" .claude/skills/diag/skill.md` includes Write and Edit

#### Manual Verification

- [ ] Read `/diag` and verify it can detect, fix, and verify resolution

**Pause here for manual verification before proceeding to next phase.**

### 1f. CLAUDE.md updates

**Four changes in one commit:**

1. **`/simplify` prohibition** — add to "How to Work":
   > **Never invoke `/simplify` autonomously.** It is too costly for routine work and redundant with `/pr-review-v2` code quality checks. Only use it if the user explicitly types `/simplify`.

2. **`/pr-review-v2` as canonical** — update Custom Skills section:
   - Change `/pr-review` entry to: `/pr-review` (deprecated) — use `/pr-review-v2` instead.
   - Add `/pr-review-v2` entry with correct description.
   - Remove `/feature-cont` entry. Add note about compact/model switching for context exhaustion.

3. **Session log naming** — update Session Guidance:
   - Change convention from `YYYY-MM-DD-session-N.md` to `YYYY-MM-DD-session-N-<issue-number>.md`.
   - For non-feature sessions (retro, drift-scan): use `YYYY-MM-DD-session-N-<topic>.md` (e.g., `retro`, `drift`).

4. **Future parallel mode note** — add to "How to Work" after the no-worktrees rule:
   > **Future:** A parallel `/feature` mode using worktrees is planned for Claude CLI agent teams (no CodeScene dependency). Not yet implemented.

#### Automated Verification

- [ ] `grep "simplify" CLAUDE.md` shows the prohibition
- [ ] `grep "pr-review-v2" CLAUDE.md` shows it listed as canonical
- [ ] `grep "feature-cont" CLAUDE.md` returns zero matches (except change log)
- [ ] `grep "issue-number" CLAUDE.md` shows the new naming convention

#### Manual Verification

- [ ] Read CLAUDE.md "How to Work" and "Custom Skills" sections

**Pause here for manual verification before proceeding to next phase.**

### 1g. Deprecate `/pr-review` v1

**Changes:**

- Rename `.claude/skills/pr-review/skill.md` to `.claude/skills/pr-review/skill.md.deprecated` (or delete — user preference).
- If keeping: add `# DEPRECATED — use /pr-review-v2` header. Remove from `name:` frontmatter so it is not invocable.
- Update any remaining references in other skills.

#### Automated Verification

- [ ] `/pr-review` is not invocable (skill loader ignores `.md.deprecated` or missing `name:`)

#### Manual Verification

- [ ] Confirm `/pr-review-v2` is the only review skill listed in CLAUDE.md

**Pause here for manual verification before proceeding to next phase.**

---

## Phase 2: Build `/architect` skill

### Design

**Purpose:** Read a plan document and produce all design artefacts in one pass, so `/feature` agents can implement against approved designs.

**Input:** A plan file path (e.g., `docs/plans/2026-03-29-mvp-phase2-plan.md`) or defaults to the most recent plan.

**Decision logic per item:**

| Item type | Artefact produced |
|-----------|-------------------|
| Cross-cutting decision (new technology, convention) | ADR in `docs/adr/` |
| Implementation item with contracts | LLD section (inline `/lld` logic) |
| Design doc update (existing doc needs correction) | Edit to existing `docs/design/` file |
| Simple bug fix | Enriched issue body (root cause, fix approach, affected files) |

**Output:** All artefacts committed on the current branch. One commit per item for granular review.

**Workflow:**

1. Read the plan file.
2. For each item, read referenced issues, design docs, source files.
3. Decide what design artefact is needed (using the table above).
4. Produce the artefact.
5. Commit with message: `docs: design for #<issue> — <summary>`.
6. After all items: report what was produced, stop for human review.

### Changes Required

- Create `.claude/skills/architect/skill.md`
- Update CLAUDE.md Custom Skills section
- Update `docs/plans/2026-03-29-mvp-phase2-plan.md` to reference the new skill

**Allowed tools:** Read, Write, Edit, Bash, Glob, Grep, Skill (for `/create-adr` and `/lld` if needed), TodoWrite

**Usage:**
- `/architect` — reads most recent plan in `docs/plans/`
- `/architect docs/plans/2026-03-29-mvp-phase2-plan.md` — reads specific plan

#### Automated Verification

- [ ] `.claude/skills/architect/skill.md` exists with valid frontmatter
- [ ] `grep "architect" CLAUDE.md` shows the skill listed

#### Manual Verification

- [ ] Run `/architect docs/plans/2026-03-29-mvp-phase2-plan.md` and verify it produces design artefacts for MVP Phase 2 items
- [ ] Each artefact is a separate commit
- [ ] ADR produced for structured logging decision
- [ ] LLD or design update produced for Naur prompt fix

**Pause here for manual verification before proceeding to next phase.**

---

## Phase 3: Extract shared artefacts

### 3a. Anti-pattern checklist

- Extract the ~50-line Supabase/Next.js/secrets/TypeScript anti-pattern list from Agent A prompts.
- Save to `.claude/skills/shared/anti-patterns.md`.
- Replace in `/pr-review/skill.md` (if kept) and `/pr-review-v2/skill.md` with: "Read `.claude/skills/shared/anti-patterns.md` and apply all checks."

### 3b. Cost calculation script

- Extract the inline Python that finds session title from JSONL files.
- Save to `scripts/get-session-id.py`.
- Replace in `/pr-review/skill.md` and `/pr-review-v2/skill.md` Step 5.

#### Automated Verification

- [ ] `.claude/skills/shared/anti-patterns.md` exists
- [ ] `scripts/get-session-id.py` exists and runs
- [ ] Anti-pattern list appears only once in the skills directory (in the shared file)

#### Manual Verification

- [ ] `/pr-review-v2` on a test diff still detects anti-patterns correctly

**Pause here for manual verification before proceeding to next phase.**

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Removing worktrees breaks `/feature` in unexpected ways | `/feature` fails mid-implementation | Test on the P0 bug fix (#133) as first real use after the change |
| Editor-agnostic wrapper doesn't find the editor | Diagnostics hook silently produces nothing | Wrapper exits 0 with a message; `/diag` still works from `.diagnostics/` files |
| Context exhaustion without `/feature-cont` | Feature half-done with no continuation path | Compact handles this automatically; keep items small; switch to larger model if needed |
| `/architect` produces wrong artefact type for an item | Design review catches wrong ADR vs LLD choice | Human reviews all artefacts before `/feature` runs |
| Anti-pattern extraction misses a check | PR review misses a known anti-pattern | Diff the shared file against the original prompts to verify completeness |

## References

- Skills review: `docs/reports/2026-03-29-skills-review.md`
- MVP Phase 2 plan: `docs/plans/2026-03-29-mvp-phase2-plan.md`
- CLAUDE.md: project root
- Memory: `feedback_no_worktrees.md`, `feedback_skip_simplify_small_tasks.md`, `user_editor.md`
