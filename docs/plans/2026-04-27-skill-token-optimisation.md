# Skill Token Optimisation — Design Doc

**Date:** 2026-04-27
**Status:** Proposed
**Scope:** `.claude/skills/` — `feature`, `feature-core`, `feature-team`, `feature-end` and their sub-agents

---

## Problem

The `feature-core` skill runs inside every `/feature` and every `/feature-team` teammate. Three structural patterns cause avoidable token spend on each invocation:

1. **Sub-agent results are unfiltered.** The `test-runner` agent stops raw vitest output from entering the main context during execution, but its *return value* carries the same output back. A typical vitest run with 50+ tests returns 1,000–2,000 lines to the caller.

2. **No return-format contracts on sub-agents** *(originally listed as item 3)*. `test-author`, `feature-evaluator`, and `ci-probe` have no max-line budget in their system prompts, so each returns as much as it reasons necessary — typically 50–200 lines when 5–15 would suffice.

3. ~~**Design docs are re-read across skill boundaries.**~~ *Dropped — on closer inspection, `/feature` and `/feature-team` only read the issue body for validation; design docs are already owned entirely by `/feature-core` Step 3. No duplication exists. See Action 3 below.*

---

## Actions

### Action 1: Create `scripts/vitest-summary.sh`

A filter script that runs vitest and reduces output to a structured summary.

**Output contract:**
- Pass: `PASS 47/47 (3 skipped) — 2.3s`
- Fail: `FAIL 2/47 — [test name]: [first error line]` (one line per failure, max 5 failures shown)

**Usage in `feature-core` Step 4 (light path):**

```bash
bash scripts/vitest-summary.sh <test-file>
```

Replace the `test-runner` sub-agent for single-file runs. Keep the sub-agent only for the multi-command full-suite chain in Step 5 (vitest + tsc + lint combined) — the sub-agent still prevents the *combined* output from entering context; apply Action 2 there.

**Files:**

- `scripts/vitest-summary.sh` — thin wrapper; runs vitest, pipes combined stdout+stderr to the parser, exits with vitest's exit code.
- `scripts/parse-vitest-output.py` — standalone parser; reads stdin, writes compact summary to stdout.

Splitting into two files keeps the bash trivial and makes the parser independently testable: pipe a saved vitest output fixture directly to `parse-vitest-output.py` without running vitest.

**`scripts/vitest-summary.sh` sketch:**

```bash
#!/usr/bin/env bash
set -euo pipefail
npx vitest run "$@" 2>&1 | python3 scripts/parse-vitest-output.py
exit "${PIPESTATUS[0]}"
```

**`scripts/parse-vitest-output.py` sketch:**

```python
import sys, re

raw = sys.stdin.read()
# Strip ANSI colour codes before matching
ansi = re.compile(r'\x1b\[[0-9;]*m')
clean = ansi.sub('', raw)

summary = re.search(r'Tests:\s+.+', clean)
duration = re.search(r'Duration\s+[\d.]+\w+', clean)
# TODO: match vitest's actual failure block format (verify against real output)
fails = re.findall(r'FAIL\s+\S+.*?\n(?:.*?(?:Error|Expected).*?\n)?', clean)

print(summary.group(0) if summary else 'No summary found', end='')
if duration:
    print(f' — {duration.group(0).strip()}')
for f in fails[:5]:
    print(f.strip())
```

> **Note:** The regex patterns are a sketch only. Verify against actual vitest output before finalising — vitest uses `×` symbols and multi-line failure blocks that may not match these patterns as-is.

---

### Action 2: Add output contracts to all sub-agent prompts

Each sub-agent's system prompt (or the `prompt=` string in the skill) gets an explicit return-format contract. The agent still reasons freely internally; only its final return is constrained.

| Agent | Contract (added to end of prompt) |
|---|---|
| `test-runner` | Return only: `PASS N/N — Xs` or `FAIL N — [test]: [first error line]`. Max 10 lines total. Do not echo test output. |
| `test-author` | Return only: the path of the file written + one line per observable property covered. Max 15 lines. |
| `feature-evaluator` | Return only: `PASS` / `PASS WITH WARNINGS` / `FAIL` followed by gap bullets. Max 15 lines. |
| `ci-probe` | Return only: `CI PASS` or `CI FAIL: [check-name]`. Max 5 lines. |

**Where to add:**
- `test-runner`: the contract lives in the standalone agent file `.claude/agents/test-runner.md`, not in a `prompt=` string inside a skill. Edit that file directly.
- `test-author`, `feature-evaluator`, `ci-probe`: the `prompt=` strings live inside `feature-core/SKILL.md` and `feature-team/SKILL.md`. Append the contract as the last line of each agent block.

---

### Action 3: ~~Context guard~~ — DROPPED

**Why dropped:** The original assumption was that `/feature` and `/feature-team` read design docs before calling `/feature-core`, causing ~900 lines of duplication. This is wrong.

Reading the actual skill files:
- `/feature` Step 1 runs `gh issue view` only to **validate** that a design reference and acceptance criteria exist. It does not read the design docs themselves.
- `/feature-team` Step 1 does the same — `gh issue view --json title,body,labels` for validation only.
- Design docs are read exclusively in `/feature-core` Step 3. The system is already correctly designed.

The only real duplication is one `gh issue view` call in the `/feature` same-conversation path (~50–200 tokens). That is not worth the complexity of a guard.

**No changes needed.**

---

### Action 4: Reduce `/diag` result verbosity

`/diag` currently reports all findings including Info-level diagnostics. Info/Hints are actionable in sequential mode (the default workflow), but `/diag` is not actionable at all when running inside worktrees — the diagnostics extension requires files to be open in the editor, which does not happen in worktree branches. The token saving here therefore only applies to the sequential `/feature` path. Change the reporting rule:

- **Errors / Warnings:** always report.
- **Info / Hints:** suppress from output unless `--verbose` flag is passed.
- **CodeScene scores ≥ 9.0:** replace "clean — no action needed" per-file lines with a single summary line: `4 files scored ≥ 9.0 ✓`.

This is a pure text-output change in `diag/SKILL.md` Step 4.

---

## Summary Table

| Action | Token saving per `/feature` invocation | Effort | Risk |
|---|---|---|---|
| **1 — vitest filter script** | ~1,000–1,500 tokens (light-path single-file run) | Low — one ~20-line script | Low — fallback to sub-agent if script fails |
| **2 — sub-agent output contracts** | ~800–1,500 tokens across test-runner + evaluator + ci-probe | Low — prompt additions only | Low — agents still reason freely, only output is trimmed |
| ~~**3 — context guard**~~ | ~~Dropped — premise was wrong; no duplication exists~~ | — | — |
| **3 — /diag verbosity reduction** | ~200–600 tokens (Info lines + per-file clean confirmations) | Trivial — skill text edit | Negligible |
| **Total (three actions)** | **~2,000–3,600 tokens per invocation** | — | — |

Context: a typical Sonnet invocation costs ~$0.003/1K input tokens. At 2,000–3,600 tokens saved per feature cycle and ~30 cycles/sprint, that is 60,000–108,000 tokens (~$0.18–$0.32) per sprint saved.

---

## Implementation Order

1. Action 4 (/diag verbosity) — 5-minute edit, no code.
2. Action 2 (output contracts) — edit sub-agent prompts in SKILL.md files.
3. Action 1 (vitest script) — write and test `scripts/vitest-summary.sh`, update Step 4 light path.

---

## Out of Scope

- Cosmetic line-count reductions in skill prose (covered elsewhere if needed).
- Changing the TDD workflow, pressure-tier logic, or agent team topology.
- Shared skill de-duplication (separate concern).
