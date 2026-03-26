---
description: Review code changes for bugs, design principles, design contract adherence, framework currency, and design conformance. Use before committing (/pr-review) or on a PR (/pr-review 123). Covers code quality, contracts/currency, and design conformance sequentially, then consolidates findings.
---

# PR Review

Two modes:
- `/pr-review` — reviews local uncommitted changes (`git diff HEAD`)
- `/pr-review 123` — reviews a pull request; posts the result as a PR comment

Note: Claude Code runs three review agents in parallel. In Windsurf the same three dimensions are
covered sequentially by Cascade itself — the output format is identical.

## Process

### Step 1: Gather context

Determine mode from the user's message (number present → PR mode, otherwise → local mode).

Run in parallel where possible:

**Get the diff:**
- PR mode:
  ```powershell
  gh pr diff <number>
  ```
- Local mode:
  ```powershell
  git diff HEAD
  ```
  Fall back to `git diff --cached` if empty.

**Get changed file list:**
- PR mode:
  ```powershell
  gh pr diff --name-only <number>
  gh pr view <number>
  ```
- Local mode:
  ```powershell
  git diff --name-only HEAD
  git log --oneline -1
  ```

**Read project context:**
- Read `CLAUDE.md` (root)
- Read `package.json` — capture exact versions of direct dependencies

**Get issue body** (PR mode): extract the linked issue number from `Closes #N` / `Fixes #N` / `Resolves #N` in the PR body. Then:
```powershell
gh issue view <N>
```

From the diff, identify:
- `CHANGED_FILES` — `.ts`, `.tsx`, `.js`, `.jsx` files added or modified (not deleted)
- `FRAMEWORK_DEPS` — top 5 packages imported in changed files that appear in `package.json` dependencies

### Step 2: Review — Code Quality & Correctness

Check the diff for:

**Bugs (highest priority — block the PR):**
- Logic errors, off-by-one, null dereferences, incorrect error handling
- Missing awaits on async calls
- Race conditions or incorrect state transitions
- Security issues (injection, credential exposure, missing auth checks)
- Silent catch blocks that discard errors without at least a `console.error` — always a bug

**Code justification (block if severe):**
- Does this code solve the stated problem without over-engineering?
- YAGNI: is anything added that is not required by the current task?
- Are there helpers or abstractions introduced for a single use?

**Design principles (block if severe):**
- **Clean Architecture:** `src/lib/engine/` must have no imports from Next.js, Supabase, or any external framework
- **Single Responsibility:** does each new function/module do one thing?
- **Dependency Inversion:** are dependencies injected rather than imported as concrete implementations?
- **Interface Segregation:** are interfaces narrower than needed forced on callers?
- **Open/Closed:** does a change require modifying multiple unrelated modules?
- **Functions over classes** unless state management genuinely requires a class

**CLAUDE.md compliance (warn, do not block unless severe):**
- No `any` type in TypeScript (block)
- No `Co-Authored-By` trailers in commit messages (block)
- Every commit uses conventional format AND references an issue number (warn)

**What NOT to report:**
- Pre-existing cosmetic/style issues not made worse by this diff
- Anything CI (linter, typechecker, tests) catches automatically
- Nitpicks a senior engineer would wave through

### Step 3: Review — Design Contracts & Framework Currency

**Design contract check:**
If the PR references a design doc or LLD:
1. Read the FULL design doc (not just the diff hunk).
2. Find any file names, function names, type names, or field names renamed or deleted in the diff.
3. Search the full design doc for all occurrences of old names. Report stale references not updated in this PR.
4. Verify function signatures, type shapes, API endpoint paths, and field names match the design.
5. Check acceptance criteria from the linked issue — are all of them addressed?

**Framework currency check:**
For each of the top 5 framework deps identified in Step 1, check whether the diff actively uses
something deprecated or removed. Search for known breaking changes if uncertain.

Only report if the diff actively uses something deprecated or removed in a current/upcoming version.

### Step 4: Review — Design Conformance

For each changed source file (`.ts`, `.tsx`):

1. Look for a header comment: `// Design reference: <path> §<section>`
   If absent, skip design-conformance checks for that file (but still check silent-swallow and diagnostics).

2. Read the referenced LLD section. Extract every function name explicitly specified (code blocks, bullet lists, "Internal decomposition" tables). Build `DESIGNED_FUNCTIONS`.

3. From the diff, collect every function declared in changed files (`function foo(`, `const foo = (`, methods). Build `IMPLEMENTED_FUNCTIONS`.

4. **Flag unspecified functions:**
   - **If the LLD has an internal decomposition section:** any function in `IMPLEMENTED_FUNCTIONS` not in `DESIGNED_FUNCTIONS` without a `// Justification:` comment → **block**.
   - **If the LLD has NO internal decomposition section:** unspecified exported/public functions → **block**; unspecified private helpers → **warn** (LLD gap).

5. **Silent catch/swallow check:**
   Scan the diff for `catch` blocks where the error is ignored entirely or not passed to `console.error` / `logger.error`. Each match → **block**.

6. **Diagnostics check:**
   Read `.diagnostics/<relative-path>.json` for each changed file (if it exists). Surface any Error or Warning severity finding as a **warn** finding.

### Step 5: Consolidate and output

Merge all findings from Steps 2–4. Deduplicate (keep the more specific finding). Sort: `block` items first, then `warn`.

**If no findings:**
```
### PR Review

No issues found. Checked: bugs, code justification, design principles, contracts, framework currency, design conformance.
```

**If findings exist:**
```
### PR Review

#### Blockers (N)

**[type] file.ts:line**
<finding>
> <evidence>

#### Warnings (N)

**[type] file.ts:line**
<finding>
> <evidence>
```

Types: `[bug]`, `[justification]`, `[design-principle]`, `[compliance]`, `[design-contract]`,
`[deprecated-api]`, `[unspecified-function]`, `[silent-swallow]`, `[diagnostic]`.

**PR mode:** post the report as a PR comment:
```powershell
gh pr comment <number> --body "<formatted report>"
```

## Notes

- Do not run builds, type-checks, or tests — CI handles those.
- If the diff is empty, report "Nothing to review — diff is empty." and stop.
- Maximum framework searches: one per package, five packages max.
- Only report if you would stake your review reputation on it.
