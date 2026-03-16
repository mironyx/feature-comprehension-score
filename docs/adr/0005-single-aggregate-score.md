# 0005. Single Aggregate Score with Self-Directed View

**Date:** 2026-03-07 (revised 2026-03-16)
**Status:** Accepted (revised)
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

### Option 4: Aggregate score + self-directed private view (FCS only)

Aggregate score shown to Org Admins and in reports (as Option 1). Additionally, each FCS participant sees their *own* per-question scores privately after assessment completion. No one else — not Org Admins, not other participants — can see an individual's scores. Participants can re-answer the FCS assessment at any time as a personal learning exercise; re-answers update only their private view, not the locked team aggregate.

- **Pros:**
  - Preserves psychological safety — no surveillance, no comparison. Only you see your scores.
  - Provides an actionable learning signal. A participant who scores 0.3 on design justification questions knows *where* their gap is and can self-direct their learning.
  - Aligns with Naur's framework: theory building is individual. The feedback loop for building understanding should be individual too.
  - Re-assessment turns the tool from a one-shot measurement into a learning instrument. The participant can study the artefacts and try again — reinforcing comprehension through practice.
  - The team aggregate remains the organisational metric. The self-view is a private learning aid, not a reporting mechanism.

- **Cons:**
  - Slightly more complex data model — individual answer scores must be persisted (for the self-view and re-assessment), but access-controlled so only the participant can read them.
  - Re-assessment requires storing multiple answer sets per participant per assessment.
  - On very small teams (2 people), the aggregate is still nearly attributable even without individual views — but this is inherent to small teams, not caused by the self-view.

- **PRCC excluded:** PRCC is a gate, not a learning tool. No individual view, no re-assessment. Participants see only the aggregate pass/fail outcome. Showing individual PRCC scores would incentivise gaming the gate rather than genuine comprehension.

## Decision

**Option 4: Aggregate score + self-directed private view (FCS only).**

The **team aggregate** remains the organisational unit of measurement — what Org Admins see, what appears in reports, what drives trend lines. This preserves the core principle from Option 1: the tool measures team comprehension, not individual performance.

The addition is a **private, self-directed learning channel** for FCS participants:

- After FCS scoring completes, each participant sees their own per-question scores, the Naur layer each question targets, their submitted answers, and the questions — but **not** the reference answers (showing reference answers would allow gaming on re-assessment).
- Participants can re-answer the FCS assessment at any time. Re-answer scores update only their private view. The original team aggregate is locked at first completion and never changes.
- This self-view is FCS only. PRCC participants see only the aggregate outcome.

This resolves the key weakness of Option 1 ("what do we do with a bad score?") without introducing the surveillance dynamic of Options 2 or 3. The team retro uses the aggregate; individuals use the self-view to close their own gaps.

## Consequences

- **Easier:** Higher team trust (no surveillance). Participants have a concrete next step when the aggregate is low — check their own scores, identify gaps, study artefacts, re-answer.
- **Harder:** Data model must persist individual answer scores (access-controlled to participant only). Re-assessment requires storing multiple answer sets per participant per assessment. API and UI must enforce strict access control — a participant's scores are never exposed to anyone else.
- **Follow-up:** ADR-0008 (data model) must include per-participant score storage with RLS restricting reads to the owning participant. The `participant_answers` table needs a score column, but RLS ensures only the participant (and aggregate calculation logic) can read it. Org Admins query only the aggregate.
- **PRCC unchanged:** PRCC follows Option 1 — aggregate only, no individual view, no re-assessment.

## References

- FCS article: `local-docs/feature-comprehension-score-article.md` — "Individual scores should not be tracked or reported. The unit of measurement is the team." (Note: the self-directed view does not contradict this — individual scores are private to the participant, not tracked or reported by the organisation.)
- Requirements: Stories 3.4 (FCS Results), 3.6 (FCS Self-Reassessment), 4.3 (Aggregate Score Calculation), 6.1–6.2 (Results Pages)
- ADR-0006: Soft/Hard enforcement modes — references this ADR for the aggregate-only principle (unchanged — aggregate remains the organisational metric)
