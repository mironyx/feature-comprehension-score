---
name: pr-review
description: Review code changes for bugs, CLAUDE.md compliance, design contract adherence, and framework currency. Use before committing (/pr-review) or on a PR (/pr-review 123). Spawns two parallel agents — correctness and framework freshness — then consolidates findings.
allowed-tools: Read, Write, Bash, Glob, Grep, Agent, TodoWrite, WebSearch
---

# PR Review — Lightweight Code Review

Two modes:

- `/pr-review` — reviews local uncommitted changes (`git diff HEAD`)
- `/pr-review <pr-number>` — reviews a pull request; posts the result as a PR comment

**Two parallel agents.** Agent A checks correctness. Agent B checks whether the
frameworks used in the changed code have deprecated anything you relied on.

---

## Process

### Step 1: Gather context

Determine mode from `$ARGUMENTS`:

- If a number is present → **PR mode**
- Otherwise → **local mode**

Run ALL of the following in parallel:

1. **PR mode:** `gh pr diff <number>` to get the full diff. Do NOT truncate or pipe through `head`.
   **Local mode:** `git diff HEAD` (falls back to `git diff --cached` if empty).
2. **PR mode:** `gh pr view <number>` and `gh pr diff --name-only <number>` for the file list and PR body.
   **Local mode:** `git diff --name-only HEAD` and `git log --oneline -1`.
3. Read `CLAUDE.md` (root).
4. Read `package.json` to capture exact versions of direct dependencies.

After (2), in parallel:

- **Issue body:** extract the linked GitHub issue number from the PR body (look for `Closes #N`,
  `Fixes #N`, `Resolves #N`, or any `#N` reference). If found, fetch `gh issue view <N>` —
  this gives acceptance criteria, design doc paths, and BDD specs for Agent A. If the issue
  number was passed in via `$ARGUMENTS` alongside the PR number (e.g. from `/feature`), use
  that directly.

- **Commit messages:** **PR mode:** `gh pr view <number> --json commits` to get all commit
  messages on the branch. **Local mode:** `git log main..HEAD --oneline`. Pass these to Agent A
  to check that each commit message follows conventional commits and references an issue number.

> **Important:** Always retrieve the complete, untruncated diff. A truncated diff will miss
> changed files and produce an incomplete review. If the diff is very large (> 2000 lines),
> focus Agent A on the TypeScript/JavaScript source files; pass the full file list to Agent B.

### Step 2: Identify changed files and their imports

From the diff (or `--name-only` output), list every source file that was **added or modified**
(ignore deletions, `package-lock.json`, and other lock files). For each TypeScript/JavaScript
source file, extract:

- The package imports (lines beginning with `import … from` or `require(…)`)
- The file's relative path

Produce two lists:
- `CHANGED_FILES` — relative paths of all modified source files (`.ts`, `.tsx`, `.js`, `.jsx`)
- `FRAMEWORK_DEPS` — unique package names imported in those files that also appear in
  `package.json` dependencies (not devDependencies). Limit to the **top 5** by frequency of
  use across the changed files.

### Step 3: Launch two agents in parallel

#### Agent A — Correctness

**Tools:** Read, Bash, Glob, Grep

**Input (pass verbatim):**

```
You are a senior engineer reviewing a code change. Your job is to find real bugs and
violations — not nitpicks, not style issues, not things CI will catch.

## What to check

1. **Bugs** — logic errors, off-by-one, null dereferences, incorrect error handling,
   missing awaits, race conditions. Focus on the diff. Read surrounding context only if
   the diff is ambiguous.

2. **CLAUDE.md compliance** — check the following rules explicitly:
   - Commit messages use conventional commits (`feat:`, `fix:`, `chore:`, etc.) AND reference
     an issue number (e.g. `#42`). Check every commit in the provided commit list.
   - No `Co-Authored-By` trailers in commit messages.
   - No emojis in documentation files unless the user explicitly requested them.
   - Bare URLs in Markdown must be wrapped in angle brackets (`<https://...>`).
   - PR size < 200 lines (warn if exceeded, do not block).
   - British English in documentation.
   - No `any` type in TypeScript.
   Ignore guidance only relevant when writing code (e.g. "ask before assuming").

3. **Design contract** — if the PR/branch references a design doc or LLD, you MUST:
   a. Read the **full** design doc file (not just the diff hunk) using the Read tool.
   b. Identify any entities (file names, function names, variable names, type names) that
      were renamed or deleted in this PR.
   c. Search the full design doc for all occurrences of the old names. Report any stale
      references that were not updated in this PR.
   d. Verify field names, types, function signatures, and API shapes match the design.

## What NOT to report

- Pre-existing issues not touched by this diff
- Anything a linter, typechecker, or test run would catch (assume CI runs those)
- Nitpicks a senior engineer would wave through
- Style preferences not explicitly in CLAUDE.md
- False positives — if you are not confident it is a real issue, omit it

## Confidence rule

Only report an issue if you would stake your review reputation on it. Imagine a senior
engineer reading your comment — would they nod or roll their eyes?

## Input

CLAUDE.md:
<claude_md>
{{CLAUDE_MD}}
</claude_md>

Diff:
<diff>
{{DIFF}}
</diff>

Commit messages on this branch (check each for conventional format + issue reference):
<commits>
{{COMMIT_MESSAGES}}
</commits>

Linked issue body (acceptance criteria, design doc paths, BDD specs — if available):
<issue>
{{ISSUE_BODY}}
</issue>

Design docs referenced in the issue (read and include relevant excerpts):
<design_docs>
{{DESIGN_DOCS}}
</design_docs>

## Output format

Return a JSON array. Each element:
{
  "type": "bug" | "compliance" | "design-contract",
  "file": "relative/path.ts",
  "line": 42,          // approximate line in the diff; omit if not applicable
  "finding": "one sentence describing the issue",
  "evidence": "quote the relevant code or CLAUDE.md rule",
  "confidence": "high" | "certain"   // never include low-confidence items
}

If nothing warrants reporting, return an empty array [].
```

#### Agent B — Framework Freshness

**Tools:** Read, Bash, WebSearch

**Input (pass verbatim):**

```
You are checking whether a code change uses any deprecated or superseded APIs from the
frameworks it depends on. Your goal is to surface real breakage risks from stale usage,
not to audit the whole codebase.

## Packages to check

For each package in the list below:
1. Note the version from package.json.
2. Run ONE targeted web search: "{package} deprecated breaking changes 2025 2026" or
   "{package} v{major} migration guide" or "site:{package-docs-domain} changelog".
   Choose whichever query is most likely to surface breaking changes.
3. Scan the diff for any API calls, import paths, or configuration keys from that package.
4. Cross-reference: does anything in the diff use an API that the search results say is
   deprecated, removed, or replaced in a newer version?

## Packages and versions

{{FRAMEWORK_DEPS_WITH_VERSIONS}}

## Diff

<diff>
{{DIFF}}
</diff>

## What to report

Only report if the diff **actively uses** something that is deprecated or removed in a
version that is current or upcoming. Do not report theoretical risks or hypothetical
future deprecations.

## Output format

Return a JSON array. Each element:
{
  "package": "package-name",
  "current_version": "x.y.z",
  "finding": "one sentence: what is deprecated and what replaces it",
  "diff_evidence": "quote the line(s) from the diff that use the deprecated API",
  "source_url": "URL of the changelog or migration guide you found"
}

If nothing warrants reporting, return an empty array [].
```

### Step 4: Consolidate findings

Collect the JSON arrays from both agents. Merge into a single list.

Apply these final filters — drop anything that is:
- A duplicate of another finding (keep the more specific one)
- Clearly a false positive given full context (e.g. Agent A flagged a `Co-Authored-By`
  but the user explicitly asked for it)

### Step 5: Output

**If no findings remain:** print or comment:

```
### PR Review

No issues found. Checked: correctness, CLAUDE.md compliance, design contracts, framework currency.
```

**If findings exist**, format as:

```
### PR Review

Found N issue(s):

**[type] file.ts:line**
<finding>
> <evidence or diff quote>
<source URL if from Agent B>

...
```

Types displayed as: `[bug]`, `[compliance]`, `[design-contract]`, `[deprecated-api]`.

**PR mode only:** post the result as a PR comment:

```bash
gh pr comment <number> --body "<formatted report>"
```

Do not include emojis. Do not pad with preamble. Keep it short.

---

## Notes

- Do not run builds, type-checks, or tests — CI handles those.
- If Agent B's web search returns no useful results for a package, skip it silently.
- If the diff is empty, report "Nothing to review — diff is empty." and stop.
- Maximum web searches across Agent B: one per package, five packages max = five searches.
- This skill is intentionally lean. When in doubt, omit rather than pad.
