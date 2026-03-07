# 0005. Single Aggregate Score (No Author/Reviewer Split)

**Date:** 2026-03-07
**Status:** Accepted
**Deciders:** LS, Claude

## Context

The FCS tool scores participants' answers against a fixed rubric and produces a comprehension score. The question is whether the tool should surface individual participant scores, role-based breakdowns (e.g., "authors scored 82%, reviewers scored 65%"), or only a single aggregate score per assessment.

This decision is fundamental to the tool's design and adoption. It affects the data model, the UI, the reporting layer, and — most critically — how teams perceive and engage with the tool.

Key forces:

- **Naur's Theory Building is a team property.** The original framework describes shared understanding as distributed across the team, not held by individuals. A team's ability to maintain software depends on collective comprehension, not individual test scores.
- **Surveillance perception kills the metric.** The FCS article is explicit: "If developers experience this as surveillance — it will be gamed or resented. Framed as a team diagnostic — does this team have enough shared theory to own this feature going forward — it becomes very useful information." Individual scoring creates exactly the surveillance dynamic the framework warns against.
- **Author/reviewer splits invite misuse.** Surfacing "authors scored higher than reviewers" (or vice versa) reframes a team diagnostic as a performance comparison. Managers may use it to evaluate individuals rather than improve knowledge sharing. This undermines the tool's purpose.
- **LLM scoring is not precise enough for individual attribution.** The scoring model (0.0–1.0 per answer via LLM) has inherent variance. Small differences between two participants' scores may be noise, not signal. Aggregating across participants smooths this variance; individual scores amplify it.
- **The assessment rubric is fixed, not role-aware.** Questions are generated from PR context without considering who did what. An author and a reviewer answer the same questions — the rubric does not distinguish between "you wrote this" and "you reviewed this". Role-based scoring would imply a precision the rubric does not support.

## Options Considered

### Option 1: Single aggregate score only

One score per assessment: `sum(score x weight) / sum(max_score x weight)` across all participants and all questions. Individual scores are calculated internally (necessary for the aggregate) but never stored separately, never surfaced in the UI, never exposed via API, and never tracked across assessments.

- **Pros:**
  - Aligns with Naur's framework — comprehension is a team property.
  - Eliminates surveillance perception. Participants know their individual answers are not being tracked or compared.
  - Simpler UI and reporting. One number per assessment, one trend line per repository.
  - Smooths LLM scoring variance — aggregate is more reliable than individual scores.
  - Reduces data model complexity — no need for per-participant score columns, per-participant history, or role-based aggregation queries.

- **Cons:**
  - Loses diagnostic granularity. If one participant understood poorly, the aggregate is diluted but does not identify who.
  - Org Admins cannot identify specific knowledge gaps per person for targeted coaching.
  - A single low-scoring participant can drag down the aggregate without visibility into the cause.

### Option 2: Aggregate score with author/reviewer breakdown

Aggregate score plus sub-scores: "Authors: 78%, Reviewers: 62%". Individual scores remain hidden, but role-based averages are shown.

- **Pros:**
  - Identifies whether comprehension gaps are concentrated in authors or reviewers.
  - Could guide process improvements (e.g., "reviewers consistently score lower — improve review practices").

- **Cons:**
  - In a typical PR with 1 author and 1–2 reviewers, "reviewer average" is one person's score. The role split is a thin disguise for individual attribution.
  - Frames the assessment as a comparison between roles rather than a team diagnostic.
  - Adds complexity to the scoring pipeline, data model, and UI for a distinction the rubric does not support (questions are not role-aware).
  - Creates a stepping stone toward full individual tracking — pressure to add "per-developer trends" follows naturally.

### Option 3: Full individual score visibility (Org Admin only)

Aggregate score shown to all participants. Org Admins additionally see per-participant scores.

- **Pros:**
  - Maximum diagnostic information for Org Admins.
  - Enables targeted coaching conversations.

- **Cons:**
  - Directly creates the surveillance dynamic the framework warns against. Participants know the Org Admin can see their scores — behaviour changes accordingly.
  - Incentivises gaming: participants may search for answers or collaborate to avoid being the low scorer, defeating the diagnostic purpose.
  - Individual LLM-scored results are not reliable enough for individual evaluation. A participant scoring 0.6 vs 0.7 may reflect LLM variance, not a meaningful comprehension difference.
  - Requires additional access control logic, UI views, and data retention policy considerations.

## Decision

**Option 1: Single aggregate score only.**

The aggregate score is the unit of measurement. Individual scores exist transiently during calculation and are not persisted, displayed, or tracked.

This is not a limitation — it is the core design principle. The tool measures whether a *team* has sufficient shared understanding to maintain a feature. The moment individual scores become visible, the tool becomes a test, and the behaviours it needs to observe (honest, unguarded answers) disappear.

Per-question aggregate (how the group did on each question, without individual attribution) is the finest drill-down the system offers.

## Consequences

- **Easier:** Simpler data model, UI, and access control. Higher team trust produces more honest answers and more useful data.
- **Harder:** Org Admins cannot pinpoint individual comprehension gaps from the tool. The intended mechanism is the retrospective conversation, not the UI.
- **Follow-up:** ADR-0008 (data model) must ensure individual answer scores are not persisted in a queryable form. The aggregate is stored; individual contributions to it are not.

## References

- FCS article: `local-docs/feature-comprehension-score-article.md` — "Individual scores should not be tracked or reported. The unit of measurement is the team."
- Requirements: Stories 4.3 (Aggregate Score Calculation), 6.1–6.2 (Results Pages)
- ADR-0006: Soft/Hard enforcement modes — references this ADR for the aggregate-only principle
