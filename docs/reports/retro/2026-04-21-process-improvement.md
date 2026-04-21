# Process Improvement Report

**Date:** 2026-04-21
**Trigger:** `/feature-team 279 280 281` — parallel bug-fix run post-mortem
**Status:** Proposed — not yet implemented

---

## Problem Statement

Three small bug fixes (a few lines of code each) cost $31 total, with $20 (65%) spent *after* PR
creation. The implementation work was correct and fast. The overhead was structural — the same
patterns will repeat on every future `/feature-team` run unless addressed.

| Issue | Code change | At PR | Final | Post-PR overhead |
|---|---|---|---|---|
| #279 tool-loop response_format | ~10 lines | $3.99 | $9.26 | +$5.27 (132%) |
| #280 retryable flags | 5 lines | $3.91 | $10.78 | +$6.87 (176%) |
| #281 polling gate | 2 lines | $3.16 | $11.02 | +$7.86 (249%) |
| **Total** | | **$11.06** | **$31.06** | **+$20.00 (181%)** |

---

## Root Cause Analysis

### RC1: `/lld-sync` reads the entire LLD regardless of change scope (intrinsic, ~$1–1.5 per issue)

`/lld-sync` loads the full LLD file for the epic before updating it. The E17 LLD is ~960 lines
covering the entire agentic retrieval epic across multiple stories. A bug fix touching one
function in one story causes the agent to read all 960 lines to locate and patch a single
paragraph.

This is structural: the LLD is a monolithic file per epic. As epics grow, lld-sync cost grows
proportionally.

### RC2: `gh run watch` streams full CI log output into context (~$1–2 per CI run)

`gh run watch` is a blocking command that streams every CI log line to stdout. When run inside a
Bash tool call, all streamed output becomes the tool result — injected into the context window.
A passing 5-job CI run produces hundreds to thousands of lines that the agent reads in full just
to confirm "green". The information needed (pass/fail) is a single field; the mechanism sends
everything.

### RC3: Pre-existing `main` lint violations cascade to every parallel branch (avoidable, ~$1.5 per issue)

Commit `92057f0` landed `docs/requirements/bug-report-21-04-26.md` without an H1 heading,
breaking `markdownlint` for every branch cut from `main` afterwards. In a `/feature-team` run
with N teammates, each one discovers the break independently at CI time, adds a fix commit with
different wording, and pays a second CI cycle. On this run: 3 independent fixes, 2 rebase
conflicts, 2 extra CI runs.

### RC4: Rebase triggers a full CI re-run even for doc-only changes (~$1.5 per rebase)

When a parallel PR needs to rebase onto `main` after a sibling merges, CI re-runs on the rebased
commit. If the rebase only resolves a doc conflict (no source changes), the CI run is redundant —
the source code is identical to what already passed. The `gh run watch` cost (RC2) is then paid
again for zero new information.

### RC6: No enforced cost recording standard in session logs

Session logs are written by agents with no template for the cost section. Each agent invents its
own format; some omit the section entirely when the Prometheus query fails. Post-PR delta — the
most actionable number — is rarely calculated explicitly. This makes it impossible to track cost
trends across features or identify regressions in overhead without manual reconstruction.

### RC5: `PROM_PORT` not inherited in worktrees

Teammates run from git worktrees. Shell env vars set in `~/.bashrc` (including `PROM_PORT=19090`)
are only available in interactive login shells. Worktrees inherit the environment at spawn time,
which may not include these vars. Result: Prometheus queries fail silently; cost labels are
missing or based on estimates. Lead had to re-query post-run.

---

## Proposed Improvements

### P1: Split LLD files by story, not by epic (addresses RC1)

**Current:** one `lld-<epic-slug>.md` per epic, all stories in one file.

**Proposed:** one `lld-<epic-slug>-s<N>-<story-slug>.md` per story. A thin index file
`lld-<epic-slug>.md` lists stories with links and any cross-cutting constraints.

**Impact:** `/lld-sync` reads only the relevant story file (~100–200 lines vs. 960). For bug
fixes touching one story, cost drops ~5–8×. Cross-story navigation via the index file.

**Migration:** apply to new epics going forward. Existing large LLDs (E17, E18) can be split
opportunistically when their stories are next touched.

**Trade-off:** more files. Cross-story references require a jump. Index file must be kept
current. Acceptable given the cost savings.

### P2: Replace `gh run watch` with status polling (addresses RC2)

**Current:** `/feature-core` and `/feature-end` use `gh run watch` which streams full CI output.

**Proposed:** poll with `gh run view <run-id> --json conclusion,status` every 30–60 seconds
until `conclusion` is not null. On failure, fetch only the failed job logs:
`gh run view <run-id> --log-failed`.

**Impact:** passing CI runs cost near-zero tokens. Failed runs still fetch the relevant logs
(same information, without the passing noise). Estimated saving: $1–2 per CI run.

**Implementation:** update the CI probe step in `/feature-core` and `/feature-end` skills.

### P3: Scan `main` for lint violations before spawning parallel agents (addresses RC3)

**Current:** `/feature-team` validates issue design references and acceptance criteria but does
not check `main` for pre-existing CI failures.

**Proposed:** add a pre-flight step to `/feature-team` Step 1:
```bash
npm run lint -- --max-warnings 0
npx markdownlint-cli2 "**/*.md" --ignore node_modules
npx tsc --noEmit
```
If any check fails: stop, report the failing files, and ask the user to fix `main` before
spawning agents.

**Impact:** N parallel agents stop paying the same CI failure tax. The fix is committed once,
cleanly, before worktrees are created.

### P4: Use `[skip ci]` for doc-only rebase commits (addresses RC4)

**Current:** after a rebase that resolves only doc conflicts, `/feature-end` force-pushes and
waits for CI to re-run.

**Proposed:** when the rebase produces no diff in `src/` or `tests/`, append `[skip ci]` to the
force-push commit message. Skip the CI wait step entirely; proceed directly to merge.

**Gate:** confirm no source changes with `git diff HEAD~1 -- src/ tests/` before deciding.

**Impact:** eliminates the redundant CI run and the `gh run watch` cost on rebases caused by
doc-only conflicts.

### P5: Export `PROM_PORT` in `.env.test.local` (addresses RC5)

**Current:** `PROM_PORT=19090` is set in `~/.bashrc` but not inherited by worktrees.

**Proposed:** add `PROM_PORT=19090` and `WINDOWS_IP=192.168.0.101` to `.env.test.local` (which
is symlinked into every worktree by the `/feature-team` bootstrap step).

**Impact:** cost queries work correctly in all teammates without manual intervention. Cost labels
applied at PR time and `/feature-end` time are accurate.

**Note:** `.env.test.local` is gitignored; this is a local machine configuration, not a project
convention. Document in `docs/runbooks/` so it survives machine rebuilds.

### P7: Enforce rigorous cost recording in session logs (addresses RC5, extends it)

**Current state — three failure modes observed this run:**

1. **Teammate Prometheus queries failed silently** — `PROM_PORT` was not set in the worktree
   environment; `query-feature-cost.py` fell back to `localhost:9090` (unreachable), returned no
   data, and the teammate wrote estimated or zero-value costs into the session log. The lead had
   to re-query post-run and correct all three logs manually.

2. **Inconsistent session log cost format** — the three session logs for this run used three
   different formats: a bullet list, a Markdown table, and a `Final feature cost` section. There
   is no template; each teammate invented its own layout.

3. **Post-PR delta not calculated** — even when both at-PR and final costs are present, the delta
   (post-PR rework overhead) was either missing or required mental arithmetic. This is the most
   actionable number for process improvement: it shows how much work happened *after* the code was
   correct.

**Proposed standard:**

Every session log must include a `## Cost` section in this exact format:

```markdown
## Cost

| Stage | Cost | Input tokens | Output tokens | Cache read | Cache write |
|-------|-----:|-------------:|--------------:|-----------:|------------:|
| At PR creation | $X.XX | N | N | N | N |
| Final (post-merge) | $X.XX | N | N | N | N |
| **Post-PR delta** | **+$X.XX** | +N | +N | — | — |

**Post-PR overhead: X%** (delta / at-PR cost)

Main post-PR drivers: [list from cost retrospective]
```

The `At PR creation` row comes from the PR body `Usage` section (always available).
The `Final` row comes from `scripts/query-feature-cost.py --stage final` (requires Prometheus).
If Prometheus is unreachable, the Final row must be marked `(Prometheus unavailable — estimate)`
rather than silently omitted or filled with wrong values.

**Enforcement:** the `/feature-end` skill Step 2 (session log) should explicitly fail if the
`## Cost` section is missing or contains `$0.00` / empty rows. The cost query step (Step 2.5)
must run *before* the session log is written, not after, so the numbers are available.

**Impact:** cost data becomes comparable across features, queryable in retrospectives, and does
not require post-hoc correction by the lead.

### P6: Skip `/lld-sync` for `bug`-labelled issues with no design change (addresses RC1, partial)

**Current:** `/feature-end` always runs `/lld-sync`.

**Proposed:** if the issue has the `bug` label AND `git diff origin/main -- docs/design/` is
empty (no design file changes in this branch), skip lld-sync and note the skip in the session
log.

**Rationale:** bug fixes correct implementation behaviour, not design contracts. If the LLD
already describes the intended behaviour (or the bug was an implementation deviation), there is
nothing to sync back.

**Impact:** saves $1–1.5 per bug fix. When a bug reveals a genuine design gap, the developer
should still run lld-sync manually.

---

## Estimated impact if all improvements implemented

| Improvement | Saving per issue | Type |
|---|---|---|
| P1 LLD split | ~$1.00 | Structural |
| P2 CI polling | ~$1.50 | Tooling |
| P3 Main lint scan | ~$1.50 | Process |
| P4 Skip CI on doc rebase | ~$1.50 | Tooling |
| P5 PROM_PORT in env | ~$0.20 | Config |
| P6 Skip lld-sync for bugs | ~$1.00 | Process |
| P7 Rigorous cost recording | ~$0.00 saving | Observability |
| **Total per issue** | **~$6.70** | |

On today's run that would have reduced post-PR overhead from $20 to ~$0 (actual fix cost
remaining: `/feature-end` orchestration, session log, final cost query — unavoidable).

---

## Priority Order

| # | Improvement | Effort | Impact | Addresses |
|---|---|---|---|---|
| 1 | P3: Main lint scan in `/feature-team` | Low — add 3 lines to skill | High — prevents cascade | RC3 |
| 2 | P2: Replace `gh run watch` with polling | Low — change one command | High — every CI run | RC2 |
| 3 | P6: Skip lld-sync for bug fixes | Low — add label check | Medium — bug fixes only | RC1 |
| 4 | P4: `[skip ci]` for doc rebase commits | Low — add diff check | Medium — parallel runs | RC4 |
| 5 | P7: Enforce cost section template in session logs | Low — add template + validation | High — observability | RC6 |
| 6 | P5: `PROM_PORT` in `.env.test.local` | Trivial | Low — prerequisite for P7 | RC5 |
| 7 | P1: Split LLD by story | Medium — convention change | High — grows over time | RC1 |

P2–P6 are all low-effort and could ship in a single session. P7 (LLD split) is the only
structural change requiring design thought.

---

## Open Questions

1. **LLD split granularity** — should each story get its own file, or each sub-story? E17 has
   stories 1a/1b/1c — is one file per story (17.1, 17.2) or one per sub-story (17.1a, 17.1b,
   17.1c) the right level?

2. **When is a bug also a design gap?** P6 (skip lld-sync for bugs) needs a clear rule for when
   to override: if the bug was caused by an incorrect LLD constraint, the LLD must be updated
   even for a bug fix.

3. **CI polling interval** — 30 s keeps the agent responsive; 60 s halves the polling calls.
   Given the CI suite runs ~5–6 min, the difference is 5–6 vs. 10–12 polls. Either is fine.
