---
name: pr-review
description: Review code changes for bugs, design principles, design contract adherence, framework currency, and design conformance. Use before committing (/pr-review) or on a PR (/pr-review 123). Launches three parallel agents — code quality, contracts/currency, and design conformance — then consolidates findings.
allowed-tools: Read, Write, Bash, Glob, Grep, Agent, TodoWrite, WebSearch
---

# PR Review

Two modes:

- `/pr-review` — reviews local uncommitted changes (`git diff HEAD`)
- `/pr-review <pr-number>` — reviews a pull request; posts the result as a PR comment

**Three agents launched in parallel.** You (the orchestrator) launch all three agents in a single
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

### Step 3: Launch THREE agents in parallel (single message, all three Agent calls)

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

### Known framework anti-patterns (block or warn as noted — no web search needed)
Scan the diff for these regardless of which frameworks are imported. These are security or
correctness issues disguised as normal usage — a package can be current and non-deprecated
while specific usage patterns within it are wrong.

**Supabase**
- `supabaseAnonKey` or `SUPABASE_ANON_KEY` used in any server-side file (API routes,
  server actions, middleware, `*.server.ts`, files under `src/lib/engine/`, `src/app/api/`).
  The anon key is for client-side only. Server-side must use `SUPABASE_SERVICE_ROLE_KEY`.
  Severity: **block** (security — anon key bypasses RLS on the server even when RLS
  policies exist).
- `createClient` called with anon key in a server context → **block** same reason.
- `.from('table')` without `.select(...)` — returns all columns, exposes schema → **warn**.
- `createClient` on the server without service role key and no evidence of RLS → **warn**.

**Next.js**
- `cookies()`, `headers()` called outside an async server component or route handler → **block**.
- `"use client"` directive on a file that imports server-only modules → **block**.
- `process.env.NEXT_PUBLIC_*` accessed in server-only code (leaks to client bundle) → **warn**.
- `getServerSideProps` in the App Router (Pages Router pattern, wrong paradigm) → **warn**.

**General secrets / env**
- Any hardcoded secret, API key, or token string not referencing `process.env` → **block**.
- `process.env.SOMETHING` used without a null check or fallback in production code → **warn**.

**TypeScript**
- `as unknown as X` double cast — usually hiding a type error → **warn**.
- Non-null assertion `!` on values that could genuinely be null → **warn**.

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
  "type": "bug" | "justification" | "design-principle" | "compliance" | "anti-pattern",
  "severity": "block" | "warn",
  "file": "relative/path.ts",
  "line": 42,
  "finding": "one sentence",
  "evidence": "quoted code or rule"
}

Return [] if nothing warrants reporting.
```

#### Agent B — Design Contracts & Framework Best Practices

**Tools:** Read, Bash, Glob, Grep, WebSearch

```
You are checking two things: (1) whether the code matches the design contracts it was built
from, and (2) whether it uses discouraged or insecure framework patterns.

The distinction from simple deprecation checking matters: a package can be current and
non-deprecated while specific usage patterns within it are considered harmful or superseded
by the framework community. Your job is to catch both.

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

## Part 2: Framework best practices (web search per package)

For each package below, run ONE targeted web search. Frame searches as:
  "<package>@<version> best practices discouraged patterns <year>"
  or "<package>@<version> security recommendations current"

Do NOT limit searches to "deprecated APIs" — you are looking for:
- Security anti-patterns (e.g. using wrong key type server-side, insecure defaults)
- Patterns the framework has moved away from even if not formally deprecated
- Usage that works but violates the framework's current recommended approach
- Known footguns the community has documented

Cross-reference findings with the diff. Only report if the diff actively uses a discouraged
or insecure pattern. Do not report theoretical risks not present in the code.

Examples of the kind of findings to look for (not exhaustive):
- Supabase: anon key in server context, missing RLS, `.from()` without `.select()`
- Next.js: mixing App Router and Pages Router patterns, wrong data fetching strategy
- Prisma: N+1 query patterns, missing transactions on multi-step writes
- Any auth library: insecure token storage, missing CSRF protection

Packages:
{{FRAMEWORK_DEPS_WITH_VERSIONS}}

Maximum web searches: one per package, five packages max.

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
  "type": "design-contract" | "anti-pattern",
  "severity": "block" | "warn",
  "file": "relative/path.ts or doc path",
  "line": 42,
  "finding": "one sentence — include WHY this pattern is discouraged",
  "evidence": "quoted code, doc excerpt, or diff line",
  "source_url": "URL if from framework search, else omit"
}

Return [] if nothing warrants reporting.
```

#### Agent C — Design Conformance

**Tools:** Read, Bash, Glob, Grep

```
You are checking whether the implementation matches the LLD it was built from, and whether
any invented complexity has been justified.

## Step 1: Identify design references

For each changed source file (`.ts`, `.tsx`), look for a header comment of the form:
  // Design reference: <path> §<section>

If no such comment exists on a file, skip design-conformance checks for that file (but still
run the silent-swallow and diagnostics checks below).

## Step 2: Read the LLD

For each design reference found:
1. Read the full referenced doc section using the Read tool.
2. Extract every function name explicitly specified or named in that section (look for
   names in code blocks, bullet lists describing helpers, "Internal decomposition" tables,
   and signatures). Build a list: DESIGNED_FUNCTIONS.

## Step 3: Extract implemented functions

From the diff, collect every function declared in the changed files:
- Named function declarations: `function foo(`
- Arrow-function assignments: `const foo = (` or `const foo = async (`
- Methods in objects or classes

Build a list: IMPLEMENTED_FUNCTIONS.

## Step 4: Flag unspecified functions

First, determine whether the LLD section has an "Internal decomposition" section (a table or
bullet list explicitly naming every private helper). This changes how you classify findings:

**If the LLD has an internal decomposition section:**

For each function in IMPLEMENTED_FUNCTIONS that is NOT in DESIGNED_FUNCTIONS:
- If no justification comment exists → **block** finding. Include both resolution paths in the
  evidence: (a) add a `// Justification:` comment if the function is genuinely necessary, OR
  (b) update the LLD's internal decomposition section if the LLD was wrong and this function
  represents the correct design. The reviewer decides which applies.
- If a justification comment exists → **warn** finding (invented but explained).

Note: do NOT treat the LLD as infallible. If the implementation and the LLD disagree, both
could be wrong. The finding surfaces the gap; the resolution is a human decision.

**If the LLD has NO internal decomposition section:**

The LLD is incomplete — it specified the *what* but not the *how*. Do not block the PR for
unspecified private helpers in this case. Instead:
- For each unspecified function that looks like a reasonable decomposition of a designed step
  → **warn** finding: "LLD gap — update the LLD's internal decomposition section to specify
  this helper or explicitly forbid it."
- For each unspecified exported/public function (visible outside the file) → **block**
  finding regardless, as public API surface should always be designed.

In both cases: exported/public functions are higher risk than private helpers — note this in
the finding.

## Step 5: Silent catch/swallow check

Scan the diff for `catch` blocks where:
- The error variable is ignored entirely (empty catch body, or body that does not reference
  the caught variable), OR
- The error is not passed to at least a `console.error` / `logger.error` / `log.error` call.

For each match: **block** finding. Fallback behaviour does not excuse missing observability.

## Step 6: Diagnostics check

For each changed source file, check whether a diagnostics file exists at
`.diagnostics/<same relative path>`. If the file exists, read it.

Surface any finding at Error or Warning severity as a **warn** finding in your output.
(Info-level diagnostics: omit unless they relate to a function flagged in Step 4.)

## Input

Diff:
<diff>
{{DIFF}}
</diff>

Changed files:
<changed_files>
{{CHANGED_FILES}}
</changed_files>

## Output format

JSON array. Each element:
{
  "type": "unspecified-function" | "silent-swallow" | "diagnostic",
  "severity": "block" | "warn",
  "file": "relative/path.ts",
  "line": 42,
  "finding": "one sentence",
  "evidence": "function name, quoted code, or diagnostic text"
}

For "unspecified-function" findings, include the LLD path in the "evidence" field so the
reviewer can verify quickly.

Return [] if nothing warrants reporting.
```

### Step 4: Consolidate and output

Collect JSON arrays from all three agents. Merge and deduplicate (keep the more specific finding).

Sort by severity: `block` items first, then `warn`.

**If no findings:** print or comment:

```
### PR Review

No issues found. Checked: bugs, code justification, design principles, framework anti-patterns, contracts, framework best practices, design conformance.
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

Types: `[bug]`, `[justification]`, `[design-principle]`, `[compliance]`, `[anti-pattern]`,
`[design-contract]`, `[unspecified-function]`, `[silent-swallow]`, `[diagnostic]`.

**PR mode:** post as a PR comment:
```bash
gh pr comment <number> --body "<formatted report>"
```

### Step 5: Cost

After outputting the review (and posting the PR comment if in PR mode), compute the
**review-only cost** (the delta since the PR was created) and append it to the terminal
output. Do NOT apply labels and do NOT update the PR body — reporting only.

**PR mode** — compute delta:

```bash
# Step 5a: get the current session total
py scripts/query-feature-cost.py "$(python3 - <<'PYEOF'
import os, pathlib, json
PROJECT_KEY = "c--projects-feature-comprehension-score"
claude_dir = pathlib.Path.home() / ".claude" / "projects" / PROJECT_KEY
jsonl_files = sorted(claude_dir.glob("*.jsonl"), key=os.path.getmtime, reverse=True)
if jsonl_files:
    for line in reversed(jsonl_files[0].read_text(encoding="utf-8").splitlines()):
        try:
            obj = json.loads(line)
            if obj.get("type") == "custom-title":
                print(obj["customTitle"])
                raise SystemExit(0)
        except (json.JSONDecodeError, KeyError):
            continue
print("pr-review")
PYEOF
)"
```

```python
# Step 5b: read the baseline cost from the PR body (set at PR creation — never overwrite it)
import re, subprocess
body = subprocess.run(
    ["gh", "pr", "view", "<number>", "--json", "body", "-q", ".body"],
    capture_output=True, text=True
).stdout
match = re.search(r'\*\*Cost:\*\*\s*\$([0-9.]+)', body)
baseline = float(match.group(1)) if match else None
```

```
# Step 5c: compute and print delta
If baseline is available:
  review_cost = current_total - baseline
  print(f"Review-only cost ≈ ${review_cost:.4f}  (session total: ${current_total:.4f})")
Else:
  print(f"Session total: ${current_total:.4f}  (no PR baseline found)")
```

**Local mode** — no PR baseline; just print the session total labelled as "Session cost to date".

If the cost script returns "Prometheus unreachable" or "No session data found", print the
message as-is — do not retry or error. Cost reporting is best-effort.

Append to terminal output (not to the PR comment):

```
---
### Review cost (pr-review v1 — 3 agents)
Review-only cost ≈ $X.XXXX  (session total: $Y.YYYY)
```

**Important:** Do NOT update the PR body `Usage` section with cost figures.
The PR body cost is set once at PR creation (by `/feature` Step 8) and is the baseline
for delta computation. Overwriting it destroys the baseline.

---

## Notes

- Do not run builds, type-checks, or tests — CI handles those.
- Launch Agent A, Agent B, and Agent C in the **same message** so they run concurrently.
- Maximum web searches in Agent B: one per package, five packages max.
- If the diff is empty, report "Nothing to review — diff is empty." and stop.
- Agent C blocks the PR on unspecified functions without justification. If a function has a
  justification comment, it is a warn, not a block — the reviewer decides whether it is
  sufficient.
- The static anti-pattern list in Agent A runs on every review at no extra cost — no web
  search, pattern-matching only. Agent B supplements this with framework-specific research.
- The Supabase anon key check is deliberately **block** not warn: it bypasses RLS silently
  even when RLS policies exist. This is a security issue, not a style preference.
- Add new static anti-patterns to Agent A's checklist as the team discovers them. That
  section is the institutional memory of "things we've learned the hard way."
- Cost is reported in terminal only — never posted to GitHub. Use the v1 vs v2 cost figures
  to decide which skill to standardise on.
