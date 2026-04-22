---
name: bug
description: Investigate a bug from a vague symptom, error message, or behaviour description. Researches the codebase to find root cause, checks for LLD gaps, and creates a well-formed GitHub issue ready for /feature. Use when the user reports a bug, error, unexpected behaviour, or says something like "X is broken", "I'm seeing an error in Y", or "this doesn't work". Also use when the user pastes an error log, stack trace, or describes a symptom without knowing the cause.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent, TodoWrite
---

# Bug — Investigation and Issue Creation

Takes a vague symptom and turns it into a well-formed, actionable GitHub issue.

The value of this skill is the **investigation phase** — going from "something is
wrong" to "here is the root cause, here are the affected files, here is how to
fix it." This is tier 1a of the process defined in
[ADR-0022](../../docs/adr/0022-tiered-feature-process.md).

**Model:** Use Opus (the latest Claude model) for this skill and all sub-agents
it spawns. When launching agents, pass `model: "opus"`.

**Usage:**

- `/bug "users see 500 on the results page"` — investigate from a description
- `/bug src/app/api/scores/route.ts` — investigate a specific file
- `/bug` (with pasted error log in conversation) — investigate from context
- `/bug #301` — investigate an existing issue that lacks root cause analysis

## Process

Execute these steps sequentially.

### Step 1: Parse input and orient

Determine what the user is reporting:

1. **Free-form text** — extract the symptom: error message, unexpected
   behaviour, or affected area.
2. **File path** — the user suspects this file is involved. Read it as a
   starting point.
3. **Issue number** — read the issue with `gh issue view <number>`. Extract
   whatever symptom or context exists.
4. **Conversation context** — if `$ARGUMENTS` is empty, look at recent
   messages for error logs, stack traces, or behaviour descriptions.

State what you understand the symptom to be in one sentence. If ambiguous,
ask the user to clarify before proceeding.

### Step 2: Check for existing issues

Before investigating, check whether this bug is already tracked:

```bash
gh issue list --state open --limit 50 --json number,title,labels
```

Search for issues that match the symptom. If a matching issue exists:

- If it already has root cause analysis, BDD specs, and acceptance criteria:
  stop and report "This is already tracked as #N and is ready for `/feature`."
- If it exists but lacks detail: continue investigation and enrich the
  existing issue instead of creating a new one.

### Step 3: Investigate

This is the core of the skill. Trace from symptom to root cause.

**Start broad, narrow down:**

1. **Locate the symptom** — grep for error messages, find the relevant route
   or component, read the code path.
2. **Trace the call chain** — follow the execution from entry point (route,
   page, component) through services, adapters, and domain logic. Use `Grep`
   and `Read` to follow imports and function calls.
3. **Identify the root cause** — the specific line(s) or logic gap where the
   bug originates. This might be:
   - A missing null check or edge case
   - Incorrect data transformation
   - A race condition or ordering issue
   - A mismatch between what the code does and what the LLD specifies
   - A missing feature that was assumed to exist
4. **Check related tests** — are there tests for this code path? Do they
   cover the failing scenario? If tests exist and pass, the bug might be in
   untested behaviour.

Use `Agent` subagents (subagent_type: "Explore") for broad codebase searches
when the symptom is vague and you need to cast a wide net. Use direct `Grep`
and `Read` when you have specific leads.

**Capture as you go:** note the affected files and the chain of reasoning.
You will need these for the issue body.

### Step 4: Check LLD coverage

Read the relevant LLD(s) in `docs/design/`. The bug often exists because the
design was incomplete or wrong.

- Does the LLD cover this code path?
- Does the LLD specify the behaviour that is broken?
- Is there a gap between what the LLD says and what the code does?

Note the LLD gap (if any) — this goes into the issue body so that `/lld-sync`
or `/architect` can patch it later.

If no LLD exists for the affected area, note that too.

### Step 5: Assess complexity

Based on the investigation, classify the bug:

**Simple** — all of these are true:
- Single component or module affected
- Clear, localised fix (< 50 lines)
- No architectural implications
- Existing tests can be extended to cover the fix

**Complex** — any of these are true:
- Multiple components or modules affected
- Fix requires changing interfaces or contracts
- Architectural decision needed (new pattern, new dependency)
- Cross-cutting concern (auth, data model, shared utility)

### Step 6: Create or enrich the issue

**If enriching an existing issue** (found in Step 2):

```bash
gh issue edit <number> --body "$(cat <<'EOF'
[enriched body — preserves existing content, adds investigation results]
EOF
)"
```

**If creating a new issue:**

Compose the issue body:

```markdown
## Symptom

[What the user observed — error message, unexpected behaviour]

## Root cause

[What the investigation found — specific code, logic gap, or missing handling]

## Affected files

- `src/path/to/file.ts` — [what's wrong here]
- `src/path/to/other.ts` — [relationship to the bug]

## LLD gap

[What the design doc missed or got wrong. Reference the specific LLD file
and section. If no LLD exists, state that.]

Or: No LLD gap — the code diverged from the design.
Or: No LLD covers this area.

## Fix approach

[Concrete description of what to change and why]

## Acceptance criteria

- [ ] [Concrete, testable criterion — Given/When/Then]
- [ ] [Another criterion]

## BDD specs

` ` `ts
describe('[context]', () => {
  it('[behaviour — given/when/then]');
  it('[another behaviour]');
});
` ` `

## Design reference

[Link to relevant LLD, or "none — new LLD section needed"]
```

Create the issue:

```bash
BODY=$(cat <<'EOF'
[composed body]
EOF
)
RESULT=$(./scripts/gh-create-issue.sh \
  --title "fix: [concise bug title]" \
  --body "$BODY" \
  --labels "kind:task" \
  --add-to-board)
```

For **complex** bugs, add the `needs-design` label:

```bash
RESULT=$(./scripts/gh-create-issue.sh \
  --title "fix: [concise bug title]" \
  --body "$BODY" \
  --labels "kind:task,needs-design" \
  --add-to-board)
```

Parse the result — `RESULT` is either `created:<number>` or `exists:<number>`.

### Step 7: Report

Present a concise summary:

```
## Bug investigation: [one-line title]

**Symptom:** [what was reported]
**Root cause:** [what was found]
**Affected files:** [list]
**LLD gap:** [yes/no — brief description]
**Complexity:** Simple | Complex
**Issue:** #N (created | enriched)

### Next step

[For simple bugs:]
Run `/feature <N>` to implement the fix.

[For complex bugs:]
Run `/architect` to design the fix (issue has `needs-design` label),
then `/feature <N>` to implement.
```

**Stop here.** Do not proceed to `/feature` or `/architect` automatically.

## Guidelines

- **Investigate before concluding.** Do not guess the root cause from the
  symptom alone. Read the actual code. Trace the actual call chain. The
  obvious cause is often wrong.
- **Root cause, not symptoms.** The issue should describe WHY the bug
  happens, not just WHAT the user sees. "The API returns 500" is a symptom.
  "The `scoreService` calls `ctx.supabase.from('scores')` without checking
  for null `assessment_id`" is a root cause.
- **LLD gaps matter.** If the design was incomplete, noting this in the issue
  prevents the same class of bug from recurring. This is the feedback loop
  that improves the design process.
- **Do not over-scope.** If the investigation reveals multiple bugs, create
  one issue per bug. Do not bundle unrelated fixes.
- **Respect existing issue content.** When enriching an existing issue,
  preserve context the reporter added. Append investigation results, do not
  replace the original description.
- **British English** in all output.
- **No Co-Authored-By trailers** in commit messages.
- **Check before creating.** Always check for existing issues first.
  Duplicate issues cause confusion.
