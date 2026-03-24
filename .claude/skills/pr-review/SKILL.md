---
name: pr-review
description: Review code changes for bugs, design principles, design contract adherence, and framework currency. Use before committing (/pr-review) or on a PR (/pr-review 123). Launches two parallel agents — code quality and contracts/currency — then consolidates findings.
allowed-tools: Read, Write, Bash, Glob, Grep, Agent, TodoWrite, WebSearch
---

# PR Review

Two modes:

- `/pr-review` — reviews local uncommitted changes (`git diff HEAD`)
- `/pr-review <pr-number>` — reviews a pull request; posts the result as a PR comment

**Two agents launched in parallel.** You (the orchestrator) launch both agents in a single
message. Do not delegate to a single subagent that runs them sequentially.

---

## Process

### Step 1: Gather context

Determine mode from `$ARGUMENTS`:

- Number present → **PR mode**
- Otherwise → **local mode**

Run ALL of the following in parallel:

1. **PR mode:** `gh pr diff <number>` — full diff, untruncated.
   **Local mode:** `git diff HEAD` (fall back to `git diff --cached` if empty).
2. **PR mode:** `gh pr view <number>` and `gh pr diff --name-only <number>`.
   **Local mode:** `git diff --name-only HEAD` and `git log --oneline -1`.
3. Read `CLAUDE.md` (root).
4. Read `package.json` — capture exact versions of direct dependencies.

After step 2, in parallel:

- **Issue body:** extract the linked issue number from the PR body (`Closes #N`, `Fixes #N`,
  `Resolves #N`). Fetch `gh issue view <N>` for acceptance criteria and design doc paths.
- **Commits:** `gh pr view <number> --json commits` (PR mode) or `git log main..HEAD --oneline`
  (local mode).

### Step 2: Identify changed files and framework deps

From the diff:
- `CHANGED_FILES` — `.ts`, `.tsx`, `.js`, `.jsx` files added or modified (not deleted)
- `FRAMEWORK_DEPS` — top 5 packages imported in changed files that appear in
  `package.json` dependencies (not devDependencies)

### Step 3: Launch TWO agents in parallel (single message, both Agent calls)

#### Agent A — Code Quality & Correctness

**Tools:** Read, Bash, Glob, Grep

```
You are a senior engineer doing a code review. Your primary job is to answer two questions:

1. Can we justify the existence of this code?
2. Is it correct and does it follow the project's design principles?

## Checklist

### Bugs (highest priority — block the PR)
- Logic errors, off-by-one, null dereferences, incorrect error handling
- Missing awaits on async calls
- Race conditions or incorrect state transitions
- Security issues (injection, credential exposure, missing auth checks)
- Silent catch blocks: `catch` (or `catch (e)`) that discards the error without at least a `console.error` — always a bug; fallback behaviour does not excuse missing observability

### Code justification (block if severe)
- Does this code solve the stated problem without over-engineering?
- YAGNI: is anything added that is not required by the current task?
- Are there helpers, utilities, or abstractions introduced for a single use?
- Is any complexity introduced that could be replaced by simpler alternatives?

### Design principles (block if severe)
This project uses Clean Architecture and SOLID. Check the diff for violations:
- **Clean Architecture:** `src/lib/engine/` must have no imports from Next.js, Supabase,
  or any external framework. Dependencies must point inward only.
- **Single Responsibility:** does each new function/module do one thing?
- **Dependency Inversion:** does the diff inject dependencies rather than import concrete
  implementations into domain code?
- **Interface Segregation:** are interfaces or types narrower than needed forced on callers?
- **Open/Closed:** does a change require modifying multiple unrelated modules?
- **Functions over classes** unless state management genuinely requires a class.

### CLAUDE.md compliance (warn, do not block unless severe)
Only check these — ignore all other CLAUDE.md guidance:
- No `any` type in TypeScript (block)
- No `Co-Authored-By` trailers in commit messages (block)
- Every commit uses conventional format (`feat:`, `fix:`, etc.) AND references an issue
  number (warn)

## What NOT to report
- Pre-existing cosmetic or style issues not made worse by this diff
- Anything CI (linter, typechecker, tests) catches automatically
- Nitpicks a senior engineer would wave through
- Emoji, British English, bare URL formatting — these are not review-blocking

## Confidence rule
Only report if you would stake your review reputation on it.

## Input

CLAUDE.md:
<claude_md>
{{CLAUDE_MD}}
</claude_md>

Diff:
<diff>
{{DIFF}}
</diff>

Commits:
<commits>
{{COMMIT_MESSAGES}}
</commits>

Issue body:
<issue>
{{ISSUE_BODY}}
</issue>

## Output format

JSON array. Each element:
{
  "type": "bug" | "justification" | "design-principle" | "compliance",
  "severity": "block" | "warn",
  "file": "relative/path.ts",
  "line": 42,
  "finding": "one sentence",
  "evidence": "quoted code or rule"
}

Return [] if nothing warrants reporting.
```

#### Agent B — Design Contracts & Framework Currency

**Tools:** Read, Bash, Glob, Grep, WebSearch

```
You are checking two things: (1) whether the code matches the design contracts it was built
from, and (2) whether it uses any deprecated framework APIs.

## Part 1: Design contract

If the PR references a design doc or LLD:
1. Read the FULL design doc (not just the diff hunk) using the Read tool.
2. Find any file names, function names, type names, or field names renamed or deleted in
   the diff.
3. Search the full design doc for all occurrences of the old names. Report stale references
   not updated in this PR.
4. Verify function signatures, type shapes, API endpoint paths, and field names match the
   design.
5. Check acceptance criteria from the linked issue — are all of them addressed?

## Part 2: Framework currency

For each package below, run ONE web search for breaking changes or deprecations.
Cross-reference with the diff. Only report if the diff actively uses something deprecated
or removed in a current or upcoming version.

Packages:
{{FRAMEWORK_DEPS_WITH_VERSIONS}}

## Input

Diff:
<diff>
{{DIFF}}
</diff>

Issue body (acceptance criteria, design doc paths):
<issue>
{{ISSUE_BODY}}
</issue>

## Output format

JSON array. Each element:
{
  "type": "design-contract" | "deprecated-api",
  "severity": "block" | "warn",
  "file": "relative/path.ts or doc path",
  "line": 42,
  "finding": "one sentence",
  "evidence": "quoted code, doc excerpt, or diff line",
  "source_url": "URL if from framework search, else omit"
}

Return [] if nothing warrants reporting.
```

### Step 4: Consolidate and output

Collect JSON arrays from both agents. Merge and deduplicate (keep the more specific finding).

Sort by severity: `block` items first, then `warn`.

**If no findings:** print or comment:

```
### PR Review

No issues found. Checked: bugs, code justification, design principles, contracts, framework currency.
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
`[deprecated-api]`.

**PR mode:** post as a PR comment:
```bash
gh pr comment <number> --body "<formatted report>"
```

---

## Notes

- Do not run builds, type-checks, or tests — CI handles those.
- Launch Agent A and Agent B in the **same message** so they run concurrently.
- Maximum web searches: one per package, five packages max.
- If the diff is empty, report "Nothing to review — diff is empty." and stop.
