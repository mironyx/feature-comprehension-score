# Session Log — 2026-03-30 Session 3: /feature-team CLI Skill

## Work completed

### Issue #142 — `/feature-team` parallel implementation skill

**PR:** [#143](https://github.com/leonids2005/feature-comprehension-score/pull/143)
**Branch:** `chore/feature-team-cli`

#### Deliverables

| Artefact | Description |
|----------|-------------|
| `.claude/skills/feature-team/SKILL.md` | New skill: lead validates issues, spawns N autonomous agent-team teammates simultaneously |
| `docs/plans/2026-03-30-feature-team-cli.md` | Full plan: guiding principle, two-mode table, Phase 1, known limitations, success criteria |
| `.claude/settings.json` | Added `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` to env block |
| `~/.claude.json` | Added `teammateMode: "tmux"` for split-pane visibility in WSL |
| `CLAUDE.md` | Conditional rules: sequential mode (no worktrees) vs parallel CLI mode (worktrees); `/feature-team` in Custom Skills |
| `.claude/settings.local.json` | Disabled PostToolUse hooks locally (VS Code only, useless in WSL CLI) |
| `scripts/tag-session.py` | Content-based JSONL search to fix session ID race condition in parallel mode |
| `.claude/skills/feature/SKILL.md` | Fixed PR body patching: `sed` → `run-python.sh` (sed silently broke on `$` in cost values) |

#### Post-PR fixes (this session continuation)

- **MD028** — Fixed blank lines inside blockquotes in `lld-phase-2-demo-ready.md` (CI failure)
- **MD033** — Fixed angle-bracket placeholders `<N>` treated as HTML in skill/plan markdown
- **Stale AC** — Removed descoped "worktree detection in /feature" criterion from issue #142 body
- **`tag-session.py` race condition** — Replaced mtime-based JSONL selection with content search when multiple recent files exist (see Decisions below)

## Decisions made

### Parallel vs sequential mode

Two distinct modes now coexist without conflict:
- **Sequential (`/feature`)** — main repo directory, no worktrees, Windsurf sees changes live
- **Parallel (`/feature-team`)** — each teammate creates its own worktree at `../fcs-feat-<N>-<slug>`

CLAUDE.md uses conditional rules rather than a single global rule, which is clear but requires
discipline: teammates must not read the "no worktrees" rule as applying to themselves.

### Session ID tracking for parallel agent teams

**Problem:** `tag-session.py` picked "newest JSONL by mtime" — unreliable when 3 teammates
start simultaneously (identical mtimes, any of them could win).

**Root cause:** Claude Code does not expose `CLAUDE_SESSION_ID` as an env var. Sub-agents share
the parent session's folder; agent team teammates each create a separate top-level JSONL file.

**Fix:** When multiple recent JSONL files exist and an issue number is provided, search file
content for `"issue #N"` / `"FCS-N"` — the spawn prompt is the first user message and uniquely
identifies each teammate. Falls back to newest-by-mtime for single-session (sequential) mode.

**Status:** Implemented but not yet tested with a real multi-agent run. See Next steps.

### `gh pr edit` is broken on this repo

`gh pr edit` returns a GraphQL error ("Projects classic is being deprecated") and silently fails
to update the PR body. Workaround: use the REST API directly:
```bash
gh api repos/leonids2005/feature-comprehension-score/pulls/<N> --method PATCH -f body="..."
```
Added to memory so future sessions use the correct command.

### No LLD for chore/infra tasks

`/feature-end` Step 1.5 (`/lld-sync`) was skipped — this issue covers tooling/skills, not
product features. No LLD exists for #142.

## Cost retrospective

| Metric | Value |
|--------|-------|
| Final cost | $7.4782 |
| Time to PR | 1h 44min |
| Tokens (in/out/cache-r/cache-w) | 2,992 / 78,625 / 12,755,595 / 671,666 |

**Cost drivers:**

1. **Context compaction** — Session continued from a prior compacted context. Cache-write tokens
   (671k) are high relative to output (78k), indicating re-summarisation overhead. The compaction
   happened mid-investigation of the session ID problem.

2. **Design iteration** — Multiple rounds clarifying the scope (worktree detection in `/feature`
   rejected by user; "Lead manages isolation" approach rejected in favour of "teammate self-manages").
   Each round re-read CLAUDE.md and skill files.

3. **CI fix cycles** — Three separate CI failures post-PR (MD028, MD033, stale AC). Each required
   a read-fix-push-CI cycle.

**Improvement actions:**

- Run `npx markdownlint-cli2 "**/*.md"` locally before pushing — all three CI failures were
  markdownlint issues that would have been caught instantly.
- For design-heavy sessions (no TDD), keep PRs small and validate the full markdown pass before
  creating the PR.
- The sed→python bug in `/feature` should have been caught by running the PR body patching
  locally before creating the PR. The cost script output should be spot-checked manually on
  first use in a new environment (WSL vs Windows).

## Next steps

1. **Test `/feature-team`** — Run against two real issues to validate:
   - Two tmux panes open (WSL CLI with `tmux` installed)
   - Each teammate tags its session correctly (content-based JSONL search)
   - OTel metrics separated by session ID in Prometheus
   - Both PRs created independently
2. **Test `tag-session.py` fix** — Use the synthetic JSONL test from session notes to verify
   content search finds the correct file over the newest-by-mtime candidate.
3. **Begin Phase 2 implementation items** — #130 (rubric_generation status) is unblocked and
   ready. #133 (P0 bug fix) is also in Todo.
4. **Fix `gh pr edit`** — Consider updating `/feature` Step 8 to use `gh api` REST PATCH instead
   of `gh pr edit` for the body update, to avoid the GraphQL Projects classic error.
