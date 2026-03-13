# 0011. Artefact Extraction Strategy

**Date:** 2026-03-13
**Status:** Accepted
**Deciders:** LS, Claude

## Context

The assessment engine (Story 4.1) needs development artefacts — diffs, file contents, PR descriptions, linked issues, test files — to generate comprehension questions. A fundamental architectural choice is **who decides what to fetch and when**: the application (deterministic) or the LLM (agentic via tool use).

This decision affects cost predictability, latency, testability, and question quality. It also determines how the `ArtefactSource` port and `GitHubArtefactSource` adapter are designed (see [lld-artefact-pipeline.md](../design/lld-artefact-pipeline.md)).

Related decisions: [0001](0001-github-app-integration.md) (GitHub App integration), [0010](0010-llm-response-validation-strategy.md) (LLM response validation).

## Options Considered

### Option A: Fully Deterministic

The application fetches all artefacts from GitHub upfront via predefined API calls (diff, PR metadata, changed files, linked issues, test files). It classifies artefact quality, applies token budget truncation by priority ordering (description > diff > files > tests), and hands the complete context to the LLM in a single call. The LLM only generates questions — it has no ability to request additional context.

- **Pros:** Predictable costs (single LLM call per assessment), lower latency (parallel GitHub fetches + one LLM round), simpler to test and debug (deterministic inputs produce deterministic prompts), straightforward token accounting
- **Cons:** May fetch irrelevant files (wasted tokens), may miss relevant files not in the diff (e.g. unchanged files that provide important context), priority heuristic is a guess — we don't know what the LLM would find most useful
- **Implications:** Token budget and priority ordering become critical design decisions. Quality ceiling is bounded by our heuristic.

### Option B: Fully Agentic

The LLM receives minimal context (PR number, repo, artefact type) and a set of tools (fetch diff, fetch file by path, fetch issue, list files). It decides what to pull and iterates until it has enough context to generate good questions. Multiple LLM calls in a tool-use loop.

- **Pros:** Highest potential question quality — LLM chases context it actually needs, best token efficiency — only fetches what's relevant, naturally handles edge cases (e.g. "I need to see the interface this class implements")
- **Cons:** Unpredictable costs (variable number of LLM calls), higher latency (serial tool-use rounds), harder to test (non-deterministic fetch patterns), requires tool definitions and loop control logic, risk of runaway loops or excessive API calls
- **Implications:** Need tool-use infrastructure, loop budgets, and cost guardrails. Testing requires mocking tool-use conversations.

### Option C: Hybrid — Deterministic Base + Agentic Depth

The application deterministically fetches the base set (diff, description, linked issues) and a file listing (paths + sizes, not contents). It hands this to the LLM along with tools to selectively fetch full file contents. The LLM gets the high-signal artefacts for free and can pull specific files it deems relevant.

- **Pros:** Predictable base cost + bounded incremental cost, better token efficiency than A (LLM skips irrelevant files), better quality ceiling than A (LLM can chase context), simpler than B (deterministic base reduces tool-use rounds)
- **Cons:** More complex than A, still has some cost unpredictability, tool-use infrastructure still needed
- **Implications:** Natural evolution from Option A — the deterministic base is identical, with tool-use layered on top.

## Decision

**V1: Option A (Fully Deterministic).** V2 evolution path: Option C (Hybrid).

For V1, deterministic extraction is the right trade-off:

1. **Cost predictability matters early.** We don't yet know usage patterns. Fixed cost per assessment lets us model pricing and set expectations.
2. **Testability.** Deterministic inputs make the entire pipeline unit-testable with fixtures. No need to mock multi-turn tool-use conversations.
3. **Sufficient for V1 scope.** Most PRs are small-to-medium (< 50 files). The priority heuristic (description > diff > files > tests) captures the high-signal artefacts. For the typical PR, Option A and Option C would produce similar context.
4. **Clean evolution path.** Option A's `ArtefactSource` port, artefact types, and prompt builders are all reusable in Option C. The deterministic base becomes the "always fetch" layer; tool-use is additive. No throwaway work.

Option C becomes compelling when we see real-world data showing that (a) large PRs produce poor questions due to truncation, or (b) the LLM consistently needs context outside the diff-touched files.

## Consequences

- **Token budget and priority ordering are first-class design concerns.** The truncation heuristic directly affects question quality. Must be configurable and measurable.
- **`ArtefactSource` port is designed for deterministic extraction** — returns a complete `RawArtefactSet`. When we move to Option C, the port interface will need a second method or a tool-providing variant.
- **We explicitly chose NOT to build tool-use infrastructure in V1.** This means we accept that question quality on very large PRs (50+ files) may be lower than optimal.
- **Measurement needed.** Track `artefact_quality` and `token_budget_applied` flags in assessments. If a high percentage of assessments are truncated, that's the signal to evolve to Option C.
- **New issues needed for the GitHub extraction adapter** — separate from #25 which covers the assembly layer only.
