# Feature Comprehension Score Tool — V2 Requirements

## Document Control

| Field | Value |
|-------|-------|
| Version | 0.2 |
| Status | Draft |
| Author | LS / Claude |
| Created | 2026-03-25 |
| Last updated | 2026-04-16 |

## Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-03-25 | LS / Claude | Initial draft — promoted from V1 V2 section, expanded with Storey triple-debt model insights, cognitive debt leading indicators, and intent debt roadmap. |
| 0.2 | 2026-04-16 | LS / Claude | E11 and E17 review: rewrote Stories 11.1, 11.2, 17.1, 17.2 ACs in Given/When/Then. 11.1: fixed user role, specified intent-weighted aggregation (≥ 60% intent-adjacent), added evaluator-failure fallback, clarified `additional_context_suggestions` as calibration signal (not training). 11.2: added configurable artefact-quality low threshold (default 40%), completed flag matrix (healthy case), added `unavailable` fallback, explicit V1 Story 6.3 and V2 Story 12.1 dependencies. 17.1: reframed as spike with report deliverable, four concrete go/no-go criteria, and explicit scoping output for 17.2. 17.2: added hard dependency on 17.1, scoped-set semantics, retrieval-enabled-at-creation semantics, all-fail fallback, per-assessment LLM spend cap, additional GitHub scopes acknowledgement. |

---

## Context and Motivation

V1 establishes FCS as a standardised measurement instrument for team comprehension of features, grounded in Naur's Theory Building. The core flow — PR Comprehension Check (preventative gate) and Feature Comprehension Score (retrospective diagnostic) — is validated in V1.

V2 has two strategic objectives:

1. **Deepen the comprehension signal.** Move from a point-in-time score to a longitudinal instrument: decay tracking, outcome correlation, peer benchmarking, and the AI vs human delta. These transform FCS from a retrospective curiosity into a leading risk indicator.

2. **Expand the debt surface.** Storey et al. (2026) propose a triple debt model: technical debt (lives in code), cognitive debt (lives in people), and intent debt (lives in artefacts). V1 addresses cognitive debt directly. V2 begins instrumenting the signals that *predict* cognitive debt accumulation, and lays the foundation for intent debt measurement in V3.

### Key external reference

Storey, M-A. (2026). *From Technical Debt to Cognitive and Intent Debt: Rethinking Software Health in the Age of AI.* University of Victoria. Preprint.

This paper independently validates the FCS problem space and names specific diagnostic signals for cognitive debt — several of which are instrumentable and can feed directly into the FCS scoring model. See Epic 12 (Cognitive Debt Leading Indicators) below.

---

## Glossary

All terms from V1 apply. Additional V2 terms:

| Term | Definition |
|------|------------|
| **Comprehension decay** | The reduction in team FCS score for a feature over time (30 / 60 / 90 days post-completion). |
| **Comprehension half-life** | The time at which a feature's FCS score has declined by 50% from its original value. A derived metric. |
| **AI baseline score** | The FCS score produced by an LLM answering the same questions as human participants, using only the feature artefacts. Used to calculate the AI vs Human delta. |
| **AI vs Human delta** | The difference between the AI baseline score and the human aggregate score. Positive delta means humans outperform the artefacts (tacit knowledge exists). Negative delta means the code explains itself better than the team does (comprehension risk). |
| **Bus factor map** | Feature × participant matrix showing pass/fail comprehension status per team member. |
| **Artefact quality score** | A numerical assessment of the richness and completeness of the artefacts available for a given feature assessment. |
| **Benchmark cohort** | Anonymised peer organisations contributing to the cross-org benchmark pool (opt-in). |
| **Cognitive debt signal** | A measurable indicator that predicts or correlates with comprehension erosion, sourced from GitHub activity, FCS trends, or survey data. |
| **Intent debt** | Absence or erosion of explicit rationale, goals, and constraints that guide system evolution. Lives in missing or degraded non-code artefacts (ADRs, specs, acceptance tests). V3 territory, but V2 lays the groundwork. |
| **PR Decorator** | A companion learning feature (not a gate) that posts exploratory reflection questions as a GitHub PR comment at submission time. |

---

## V2 Scope Overview

| Epic | Title | Priority |
|------|-------|----------|
| Epic 7 | PR Decorator | High |
| Epic 8 | Comprehension Decay Tracking | High |
| Epic 9 | AI vs Human Comprehension Delta | High |
| Epic 10 | Bus Factor Map | High |
| Epic 11 | Artefact Quality Scoring | Medium |
| Epic 12 | Cognitive Debt Leading Indicators | Medium |
| Epic 13 | Comprehension-to-Outcome Correlation | Medium |
| Epic 14 | Expanded Assessment Areas | Medium |
| Epic 15 | Benchmark Mode | Low |
| Epic 16 | OSS / Alternative LLM Models | Low |
| Epic 17 | Agentic Artefact Retrieval | Low |

**Not in V2 scope (V3):**
- Intent debt measurement (ADR coverage, spec-to-behaviour gap detection)
- Cross-platform support (GitLab, Bitbucket)
- Jira integration
- On-premise / self-hosted deployment

---

## Epic 7: PR Decorator

A companion feature to the FCS assessment. Generates exploratory, reflection-focused questions and posts them as a GitHub PR comment when a PR is submitted. Not a gate — no scoring, no blocking. Purpose is developer learning and theory building at the moment of highest context.

**Motivation:** Meets developers where they already are (the PR), requires no intent or discipline, and delivers standardised reflection questions at the moment of highest context — right when the developer has just finished building. Distinct from the FCS assessment: this is a learning aid, not a measurement instrument. Also the most direct counter to the "poor man LLM" objection: the questions come to the developer, not the other way around.

**Distinction from PRCC:**

| | PR Decorator | FCS Assessment | PRCC |
|---|---|---|---|
| **Purpose** | Learning / reflection | Measurement | Gate |
| **Audience** | Individual developer | Team + Leadership | Team |
| **Tone** | Conversational, exploratory | Structured, standardised | Structured, standardised |
| **Timing** | At PR submission | Post-sprint / post-feature | Before merge |
| **Stakes** | None — no score | Produces FCS metric | Blocks merge (Hard mode) |

### Story 7.1: PR Decorator Question Generation

**As a** PR Author,
**I want to** receive exploratory comprehension questions posted as a PR comment when I open a PR,
**so that** I can reflect on my own understanding at the moment of highest context.

**Acceptance Criteria:**

- Given PR Decorator is enabled for a repository, when a PR is opened (or moves from draft to ready for review), the system generates 3–5 exploratory questions from the PR artefacts using a dedicated "reflection" prompt mode.
- The reflection prompt mode is distinct from the assessment scoring prompt — questions should be open-ended, conversational, and invite deeper reasoning rather than testing for a single correct answer.
- Questions are posted as a GitHub PR comment authored by the GitHub App bot account.
- The comment opens with a brief explanation: "These questions are a comprehension aid — not scored, not required. Use them to spot any gaps in your own understanding before requesting review."
- No scoring, no participant list, no Check Run created.
- Given a PR is below the PRCC minimum line threshold, the decorator still fires (reflection is valuable regardless of gate status).
- Given PR Decorator is disabled, no comment is posted.

### Story 7.2: PR Decorator Configuration

**As an** Org Admin,
**I want to** configure the PR Decorator independently of PRCC,
**so that** I can use the learning aid without the gate, or vice versa.

**Acceptance Criteria:**

- Org Admin can enable/disable PR Decorator at repository level (default: disabled in V2).
- Configurable question count: 1–5 (default: 3).
- PR Decorator config is visible alongside PRCC and FCS config in the repository settings page.

### Story 7.3: Optional Response Capture

**As a** developer,
**I want to** optionally respond to decorator questions in the PR comment thread,
**so that** my answers can enrich the feature's comprehension record.

**Acceptance Criteria:**

- If a developer replies to the decorator comment with a structured response (format TBD — candidate: quoting the question and answering below it), the system captures the response.
- Captured responses are stored against the PR and linked to the feature if an FCS assessment is later created for the same feature.
- Captured responses are never scored or surfaced as individual metrics. They are enrichment data only.
- Privacy: captured responses are visible only to the participant and Org Admin. Design must avoid creating a surveillance perception — this is a learning log, not a performance record.
- Given no structured reply is detected, no data is captured from the comment thread.

**Notes:** Privacy implications require design review before implementation. The exact parsing heuristic for "structured response" is a V2 research spike.

---

## Epic 8: Comprehension Decay Tracking

Track how team understanding of a feature changes over time by enabling periodic re-assessment of the same feature at 30, 60, and 90 days post-completion.

**Motivation:** Naur's original observation was that when the team disperses or moves on, the theory dies. This is the first tool to make that decay visible and measurable. The longitudinal data accumulated across customers becomes a moat: the product can eventually show norms such as "the average team loses 40% of design justification understanding within 8 weeks of feature completion." Storey (2026) identifies "slow onboarding" and "resistance to change" as symptoms of cognitive debt — decay tracking provides the upstream signal that explains why those symptoms appear.

### Story 8.1: Decay Assessment Scheduling

**As an** Org Admin,
**I want to** schedule comprehension re-assessments of a feature at configured intervals,
**so that** I can track understanding decay over time.

**Acceptance Criteria:**

- Given an FCS assessment is completed, the Org Admin can schedule decay assessments at configurable intervals: 30, 60, and/or 90 days.
- Decay assessments reuse the same question set and rubric as the original assessment to allow direct score comparison.
- Participants for decay assessments default to the original participant list. Org Admin can add or remove participants before sending.
- Given a participant is no longer in the organisation at re-assessment time, they are excluded and the Org Admin is notified.
- Decay assessments can also be triggered manually by the Org Admin at any time.

### Story 8.2: Decay Assessment Flow

**As a** participant,
**I want to** complete a decay re-assessment the same way I completed the original,
**so that** the experience is consistent.

**Acceptance Criteria:**

- Decay assessment answering flow is identical to the original FCS flow (Stories 3.3, 5.3).
- Participants receive a notification email explaining: "This is a follow-up comprehension check for [feature name] — same questions as before, checking how understanding has evolved."
- Reference answers are not shown before or during the decay assessment (same as original).
- Self-directed private view is available after completion (same as original FCS, Story 3.4).

### Story 8.3: Decay Score Visualisation

**As an** Org Admin,
**I want to** see a comprehension decay chart for a feature,
**so that** I can identify which features are losing understanding fastest.

**Acceptance Criteria:**

- The FCS results page for a feature shows a decay timeline: original score → 30-day → 60-day → 90-day (populated as data becomes available).
- Each data point shows: aggregate score, number of participants, and date.
- Features with a decay of more than 20 percentage points from original are flagged with a visual indicator.
- Comprehension half-life is shown as a derived metric once at least two data points exist: "Understanding of this feature halved approximately N weeks after completion."
- Per-question decay is shown (which Naur layers are decaying fastest — design justification tends to decay faster than world-to-program mapping).
- Fewer than 2 data points: decay chart is not shown. Message: "Decay data available after the first scheduled re-assessment."

---

## Epic 9: AI vs Human Comprehension Delta

Ask the same assessment questions to an LLM (with full access to the feature artefacts) and to the human participants. Surface the gap as a distinct metric alongside the human aggregate.

**Motivation:** A genuinely novel framing. If AI scores 85% and the team scores 40% on their own code — that is a strong signal that the artefacts explain the system better than the team does. If the team scores higher than the AI — they have genuine tacit depth that the artefacts alone do not surface, which is exactly what Naur's theory building describes. The delta is informative in both directions and is not replicable by any existing tool.

### Story 9.1: AI Baseline Generation

**As the** system,
**I want to** generate an AI baseline score for each assessment at question-creation time,
**so that** the human vs AI delta is available when results are published.

**Acceptance Criteria:**

- Immediately after rubric generation (Story 4.1), the system submits the questions to the LLM with the full feature artefacts as context. The LLM answers as if it were a participant.
- The AI baseline answers are scored against the rubric using the same scoring logic as human answers (Story 4.2).
- The AI baseline score is stored against the assessment.
- AI baseline generation is a separate LLM call from rubric generation and from human answer scoring.
- AI baseline answers are not shown to participants or Org Admins (they are internal data only).
- AI baseline generation failure (LLM error) does not block the assessment — delta is shown as "unavailable" for that assessment.

### Story 9.2: Delta Display in Results

**As an** Org Admin,
**I want to** see the AI vs human delta on the assessment results page,
**so that** I can interpret whether the team's understanding goes beyond what the artefacts describe.

**Acceptance Criteria:**

- The FCS results page (Org Admin view) shows, alongside the aggregate human score:
  - AI baseline score (labelled: "What the artefacts alone convey")
  - Human aggregate score (labelled: "What the team knows")
  - Delta (positive or negative, percentage points)
- Framing guidance displayed in the UI:
  - Positive delta (humans > AI): "Your team has understanding beyond what the artefacts capture — valuable tacit knowledge."
  - Negative delta (AI > humans): "The artefacts describe this feature better than the team does — comprehension risk."
  - Near-zero delta: "Team understanding closely matches the artefact record."
- Delta is not shown on the PRCC results page — this is an FCS-only feature.
- The AI baseline score is never shown in isolation in public-facing materials — always shown in context of the human score and delta.

---

## Epic 10: Bus Factor Map

Visualise which team members have a passing FCS score on which features. Flag features where fewer than a configured number of people have demonstrated sufficient understanding.

**Motivation:** Bus factor (or truck factor) is a well-understood concept in engineering leadership. Storey (2026) identifies "low bus factor" explicitly as a diagnostic signal for cognitive debt. FCS makes it measurable per feature rather than per codebase. Particularly actionable when a team member announces they are leaving — the manager can immediately see which features are at risk.

### Story 10.1: Bus Factor Map View

**As an** Org Admin,
**I want to** see a feature × participant comprehension map for my organisation,
**so that** I can identify single points of failure before they become incidents.

**Acceptance Criteria:**

- The organisation dashboard includes a Bus Factor Map view (Org Admin only).
- Displayed as a matrix: rows are features (FCS assessments), columns are participants.
- Each cell shows: pass (above threshold) / fail (below threshold) / did not participate.
- "Passing" threshold is configurable per organisation (default: 70% — same as Hard mode default).
- Features where only one participant has a passing status are flagged as "single point of failure."
- Features where zero participants have a passing status are flagged as "critical comprehension risk."
- Individual scores are not shown in the matrix — pass/fail status only.
- Org Admin can filter by repository.

### Story 10.2: Departure Risk Flagging

**As an** Org Admin,
**I want to** be alerted when a team member who is a sole comprehension holder leaves the organisation,
**so that** I can take action before the knowledge is lost.

**Acceptance Criteria:**

- Given a GitHub user leaves the organisation (detected via GitHub webhook), the system checks the Bus Factor Map for features where that user was the sole participant with a passing status.
- If any such features exist, the Org Admin receives a notification: "[Username] has left the organisation. The following features may now have no team members with demonstrated comprehension: [feature list]."
- The flagged features are highlighted in the Bus Factor Map with a "knowledge gap risk" indicator.
- The Org Admin can trigger a new FCS assessment for flagged features directly from the notification or map view.

---

## Epic 11: Artefact Quality Scoring

Alongside the FCS score, surface a numerical score for the quality of artefacts available for the assessment. Thin artefacts generate thin questions — artefact quality is the upstream constraint on comprehension measurement.

**Motivation:** This shifts the tool's framing from "your team failed to understand the feature" to "your knowledge transfer process produced insufficient artefacts." Less threatening, more actionable. It also surfaces a second diagnostic dimension: a team with high artefact quality and low FCS scores has a different problem from a team with low artefact quality and low FCS scores. Storey (2026) identifies intent debt (missing artefacts) as a distinct debt type from cognitive debt — artefact quality scoring is the bridge between the two.

### Story 11.1: Artefact Quality Evaluation

**As an** Org Admin,
**I want** the system to evaluate the quality of artefacts available for an assessment,
**so that** I can understand the upstream cause of thin questions.

**Acceptance Criteria:**

- Given an assessment is being generated, when the question-generation pipeline runs, then the system produces an **artefact quality score** (integer 0–100) alongside the generated questions.
- Given an assessment is being generated, then the system evaluates six dimensions and records a per-dimension sub-score (0–100) and a category label:
  - **PR description completeness** — categories: empty / minimal / detailed.
  - **Linked issues** — categories: none / linked / linked with acceptance criteria.
  - **Design document presence** — categories: none / partial / comprehensive.
  - **Commit message quality** — categories: one-liners / descriptive.
  - **Test file coverage** — categories: no tests / tests present / BDD/behaviour tests present.
  - **ADR references** — categories: none / referenced.
- Given the six dimension sub-scores, when the aggregate score is computed, then intent-adjacent dimensions (ADR references, linked issues with acceptance criteria, design document presence, PR description completeness) contribute **at least 60%** of the aggregate weight; code-adjacent dimensions (commit message quality, test file coverage) contribute the remainder. Exact weights are an implementation concern.
- Given the evaluator runs, then it issues a separate LLM call from question generation (single-purpose prompt, dedicated schema) — it is not a deterministic heuristic count.
- Given the evaluator LLM call fails or times out, then the assessment proceeds without an artefact quality score; the score field is recorded as `unavailable` and the assessment is not blocked.
- Given V1 captured `additional_context_suggestions` for historical assessments, when the evaluator is calibrated, then those suggestions are used as ground-truth signal to validate dimension scoring (e.g., assessments whose suggestions asked for ADRs should score low on the ADR dimension). Calibration is a one-off analysis, not an online training loop.

**Notes:** The 60% intent-adjacent floor is a requirements-level constraint reflecting Storey (2026) triple-debt framing; tuning the exact per-dimension weights is deferred to the LLD.

### Story 11.2: Artefact Quality Display

**As an** Org Admin,
**I want to** see the artefact quality score alongside the FCS score,
**so that** I can distinguish between "team doesn't understand" and "we didn't write it down."

**Acceptance Criteria:**

- Given an assessment has completed with an artefact quality score, when the Org Admin views the FCS results page, then the page shows the FCS score (aggregate human comprehension) and the artefact quality score (integer 0–100) with the per-dimension breakdown available on expand.
- Given an artefact quality score below the low threshold, when the results page renders, then it displays contextual interpretation copy of the form: `"Artefact quality: {score}% — questions may not fully cover design intent. Consider adding ADRs and PR descriptions before the next assessment."`
- Given the Org Admin navigates to the Organisation Overview (Story 6.3), then the artefact quality score appears as a sortable column alongside FCS score.
- Given a configurable **artefact quality low threshold** (default: 40%) and the existing **FCS low threshold** (default: 60%, per Story 12.1), when an assessment is displayed, then the following flag matrix applies:
  - artefact quality < low threshold AND FCS < low threshold → `"comprehension and documentation risk"`.
  - artefact quality ≥ low threshold AND FCS < low threshold → `"comprehension gap — artefacts exist but understanding is not transferring"`.
  - artefact quality < low threshold AND FCS ≥ low threshold → `"tacit knowledge concentration — team understands but knowledge is not externalised"`.
  - artefact quality ≥ low threshold AND FCS ≥ low threshold → no risk flag shown (healthy).
- Given an Org Admin opens organisation-level configuration, when they set the artefact quality low threshold, then it is persisted per organisation and takes effect for the next assessment displayed (not retroactively), matching the configuration semantics established in V1 Story 1.3.
- Given an assessment's artefact quality score is recorded as `unavailable` (Story 11.1 fallback), when the results page renders, then the score field shows `"unavailable"` with hover explanation, no flag is computed, and the FCS score is still displayed unaffected.

**Notes:** Dependency on V1 Story 6.3 (Organisation Overview) and V2 Story 12.1 (FCS low threshold default) — these must already be implemented or implemented in the same milestone.

---

## Epic 12: Cognitive Debt Leading Indicators

Instrument the observable signals that Storey (2026) identifies as diagnostic markers of cognitive debt accumulation. Surface these as leading indicators that contextualise and predict FCS trends, rather than leaving them as qualitative descriptions.

**Motivation:** Storey's paper names five observable signals of cognitive debt: resistance to change, unexpected results, low bus factor, burnout/stress, and slow or unpredictable onboarding. Several of these are already measurable from GitHub activity data that the FCS tool can access. Instrumenting them turns FCS from a point-in-time measurement into an early warning system.

**Storey signal mapping:**

| Signal | Source | Instrumentable? | V2 approach |
|--------|--------|-----------------|-------------|
| Resistance to change | PR velocity on a feature | Yes — GitHub | PR frequency change on high-FCS-risk features |
| Unexpected results | PR review comments mentioning surprise/unexpected | Partial — NLP on comments | Flag correlation, do not auto-analyse |
| Low bus factor | FCS participation data | Yes — direct | Epic 10 (Bus Factor Map) |
| Burnout / stress | Survey data | Requires opt-in survey | Lightweight periodic prompt |
| Slow onboarding | Time to first substantive contribution per repo | Yes — GitHub | PR contribution timeline |

### Story 12.1: Change Velocity Signal

**As an** Org Admin,
**I want to** see whether PR activity on features with low FCS scores is declining,
**so that** I can identify features where comprehension problems are slowing delivery.

**Acceptance Criteria:**

- For each repository, the system tracks PR frequency per feature area (proxied by file paths touched in FCS-assessed PRs).
- A "change velocity trend" indicator is shown on the Repository Assessment History page (Story 6.4): rising / stable / declining, computed over the last 90 days.
- Features with both declining change velocity and a low FCS score (below configurable threshold, default: 60%) are flagged as "possible comprehension-induced slowdown."
- The flag is a contextual signal, not a diagnosis — displayed with explanatory copy: "Teams often avoid changing features they don't understand. Low comprehension scores may be contributing to reduced activity on this area."
- No individual developer data is used in this calculation — repository-level signal only.

### Story 12.2: Onboarding Velocity Signal

**As an** Org Admin,
**I want to** see how quickly new team members make substantive contributions to features with low FCS scores,
**so that** I can detect when cognitive debt is slowing ramp-up.

**Acceptance Criteria:**

- Given a new GitHub user joins the organisation and makes their first PR on a repository with existing FCS assessments, the system records the time from org join to first merged PR.
- Time-to-first-contribution is shown as a repository-level metric on the dashboard (not per-developer).
- If the repository has a low average FCS score (below threshold), the system shows a contextual note: "This repository has a low comprehension score — onboarding may take longer than typical."
- Storey (2026) notes that slow onboarding despite documentation is a signal of cognitive debt (documentation describes what the code does, not why). This metric surfaces that pattern at scale.

### Story 12.3: Comprehension Health Score (Composite)

**As an** Org Admin,
**I want** a single composite indicator per repository that aggregates the key cognitive debt signals,
**so that** I can prioritise attention without reviewing each metric individually.

**Acceptance Criteria:**

- A "Comprehension Health Score" (0–100%) is computed per repository from:
  - Average FCS score across recent assessments (weighted: 40%)
  - Artefact quality score average (weighted: 20%)
  - Bus factor (features with single-holder risk, as a proportion of total assessed features) (weighted: 20%)
  - Change velocity trend (stable/rising = positive, declining = negative contribution) (weighted: 10%)
  - Onboarding velocity (improving/stable = positive, worsening = negative contribution) (weighted: 10%)
- Weights are configurable in a later iteration. V2 uses fixed weights.
- The Comprehensive Health Score is shown per repository on the Organisation Overview dashboard.
- Score bands: 80–100% = Healthy; 60–79% = Monitor; 40–59% = At risk; below 40% = Critical.
- The composite score does not replace individual metrics — it is a triage view only.

---

## Epic 13: Comprehension-to-Outcome Correlation

Cross-reference FCS scores with production incidents and bug rates per feature. Over time, the system builds evidence of the relationship between comprehension and delivery quality.

**Motivation:** This is the data flywheel. Once the correlation is established ("features scoring below 60% have 3× the incident rate in the following 90 days"), the FCS score becomes a leading indicator for risk — not just a retrospective measurement. Storey (2026) identifies "behaviour drift discovered only during customer incidents" as a signal of intent debt — cross-referencing FCS scores with incident data begins to quantify that link.

### Story 13.1: Incident Integration

**As an** Org Admin,
**I want to** link production incidents to features in the FCS system,
**so that** comprehension scores can be correlated with delivery quality.

**Acceptance Criteria:**

- V2 incident sources: GitHub Issues labelled with a configurable bug/incident label (default: "bug", "incident", "production").
- Org Admin configures which labels are treated as incidents at the repository level.
- Given a GitHub Issue is labelled as an incident and closed, the system checks whether the issue references PRs that were part of an FCS assessment. If yes, the incident is linked to the relevant feature.
- Manual linking: Org Admin can manually associate an incident with an FCS assessment from the results page.

### Story 13.2: Correlation Report

**As an** Org Admin,
**I want to** see the correlation between FCS scores and incident rates in my organisation,
**so that** I can build the case for treating comprehension as a risk metric.

**Acceptance Criteria:**

- The Organisation dashboard includes a Correlation Report view (Org Admin only).
- Displayed once a minimum dataset threshold is met: 10 completed FCS assessments with at least 3 linked incidents. Below threshold: message "Correlation data available once more assessments are linked to incidents."
- Report shows:
  - Scatter plot: FCS score (x-axis) vs incidents in the 90 days following assessment (y-axis).
  - Correlation coefficient (Pearson r) with plain-language interpretation.
  - Segmented view: assessments with FCS score above vs below configured threshold, average incident rate for each group.
- Privacy: individual developer scores are not included in any correlation calculation — only aggregate feature scores.
- Report is shown at organisation level, not feature level, to avoid creating a perception that a specific feature team is being blamed for incidents.

---

## Epic 14: Expanded Assessment Areas

V1 generates questions across Naur's three layers. V2 adds optional assessment dimensions that address blind spots created by AI-augmented development: test strategy awareness, operational knowledge, and security/threat model awareness.

**Motivation:** Storey (2026) notes that cognitive debt manifests differently across different knowledge domains. A developer can understand what a feature does (domain intent) without understanding how it behaves in production (operational knowledge) or what trust assumptions it makes (security). These dimensions are orthogonal to Naur and require separate prompt engineering.

### Story 14.1: Test Strategy Awareness Questions

**As an** Org Admin,
**I want to** include test strategy questions in FCS assessments for features where AI wrote the tests,
**so that** I can detect whether the team understands what the test suite actually guards.

**Acceptance Criteria:**

- Test strategy assessment is an optional additional dimension, configurable per assessment (not per repository).
- When enabled, the system generates 1–2 additional questions targeting test strategy: "What failure modes does this test suite not catch? What would you add and why?"
- Questions are generated from test files in the PR artefacts.
- Given no test files exist in the artefacts, the test strategy dimension is skipped and the Org Admin is notified.
- Test strategy questions are labelled with a distinct dimension tag in the results view.

### Story 14.2: Operational / Production Knowledge Questions

**As an** Org Admin,
**I want to** optionally include operational knowledge questions in FCS assessments,
**so that** I can check whether the team understands how the feature behaves in production.

**Acceptance Criteria:**

- Operational knowledge is an optional additional dimension, configurable per assessment.
- Questions target: observability ("How would you know this feature is broken?"), performance ("What are the known performance characteristics?"), failure modes ("What would you look at first in an incident?").
- Questions are generated from available artefacts plus any linked runbooks or monitoring configuration files detected in the PR.
- Given no operational artefacts exist, the system generates questions from code structure and surfaces a note: "Operational questions generated from code only — consider linking runbooks."

### Story 14.3: Security / Threat Model Questions

**As an** Org Admin,
**I want to** optionally include security awareness questions in FCS assessments for features with a meaningful threat surface,
**so that** I can check whether the team understands the trust boundaries they built.

**Acceptance Criteria:**

- Security awareness is an optional additional dimension, configurable per assessment.
- Questions target: trust assumptions, data flow, likely misuse vectors.
- Security questions are not generated by default — they must be explicitly enabled per assessment (the threat surface varies enormously across features).
- Given a feature accesses user PII (detected via artefact analysis — e.g., mentions of user data, authentication tokens), the system suggests enabling security questions with a prompt on the assessment creation screen.

---

## Epic 15: Benchmark Mode

Aggregate anonymised FCS scores across consenting organisations by feature type, team size, and industry vertical. Surface peer comparison as contextual reference alongside each team's own score.

**Motivation:** Network effect — every new customer makes the benchmark more valuable, creating retention and a compounding data advantage. Transforms the FCS from an absolute score into a relative one, which is far more meaningful for goal-setting.

### Story 15.1: Benchmark Data Contribution (Opt-In)

**As an** Org Admin,
**I want to** opt my organisation into contributing anonymised FCS data to the benchmark pool,
**so that** I can access peer comparison data in return.

**Acceptance Criteria:**

- Opt-in is explicit, prominent, and requires a deliberate action (not a pre-checked box).
- Data contributed: aggregate FCS scores, artefact quality scores, assessment metadata (feature complexity proxy: PR size, commit count), self-reported industry vertical, team size band.
- No individual scores, no developer names, no code or artefact content is contributed.
- Org Admin can opt out at any time, which stops future contributions. Historical contributed data is retained in the anonymised pool (cannot be de-anonymised).

### Story 15.2: Benchmark Display

**As an** Org Admin,
**I want to** see how my team's FCS scores compare to peer organisations,
**so that** I have context for whether our scores represent good or poor performance.

**Acceptance Criteria:**

- Benchmark display is available only to organisations that have opted in.
- Minimum cohort size before surfacing a benchmark: 10 organisations. Below threshold: message displayed.
- Benchmark is shown on the FCS results page as a contextual band: "Teams of similar size and feature complexity typically score 58–74%. Your team scored 67%."
- Segmentation dimensions: team size band, feature complexity band (derived from artefact and PR metrics), industry vertical (self-reported, optional).
- Shown as a band (25th–75th percentile range), not a leaderboard.

---

## Epic 16: OSS / Alternative LLM Models

Evaluate and implement alternative LLM models for cost reduction without quality degradation.

**Motivation:** V1 uses the Anthropic Claude API exclusively. At scale, question generation is the most token-intensive operation. Model abstraction already exists via the `LLMClient` port interface — adding an alternative provider is an adapter change, not an architecture change.

### Story 16.1: Model Benchmarking Framework

**Before any migration, establish a repeatable benchmarking framework:**

**Acceptance Criteria:**

- A test dataset of representative feature artefacts (varied in size, complexity, and artefact richness) is assembled.
- For each LLM candidate, the framework runs: question generation, AI baseline scoring, and answer scoring across the test dataset.
- Output metrics: question quality score (human-evaluated rubric), scoring consistency (variance across runs), latency, and cost per assessment.
- Claude Sonnet output is the baseline against which alternatives are evaluated.

### Story 16.2: Relevance Detection Model Migration

Relevance detection (binary classification — relevant / not relevant) is the lowest-risk migration candidate. Evaluate smaller, cheaper models first here.

### Story 16.3: Question Generation Model Evaluation

Evaluate OSS models (Llama, Mistral, DeepSeek) for question generation. Quality trade-off must be benchmarked using Story 16.1 framework before any production migration. Answer scoring remains on Claude longer — quality is most critical there.

---

## Epic 17: Agentic Artefact Retrieval

V1 captures `additional_context_suggestions` from the LLM as passive metadata. V2 evaluates an agentic approach where the system automatically retrieves suggested artefacts and re-generates questions with enriched context.

**Motivation:** Storey (2026) identifies intent debt as arising from missing or incomplete artefacts. Agentic retrieval closes the loop: rather than noting "ADRs would improve question quality," the system attempts to find and retrieve them.

### Story 17.1: Agentic Retrieval Feasibility Study (Research Spike)

**As a** Product Owner,
**I want** a feasibility study for agentic artefact retrieval,
**so that** we have an evidence-based go/no-go decision before investing in Story 17.2.

**Acceptance Criteria:**

- Given V1 production `additional_context_suggestions` data across at least 30 assessments, when the analysis runs, then a report is produced in `docs/reports/YYYY-MM-DD-agentic-retrieval-feasibility.md` containing the sections below.
- Given the report, then it contains a **signal consistency analysis**: frequency of each requested artefact type, and a consistency measure defined as the percentage of assessments whose top-3 requested artefact types overlap with the overall top-3. Go criterion: ≥ 60% overlap.
- Given the report, then it contains a **retrieval-strategy map** that assigns every requested artefact type to one of: (a) in-repo GitHub search (e.g., ADRs, docs/, wiki), (b) external link followed from PR body (e.g., Notion, Confluence), (c) no viable retrieval strategy. Go criterion: ≥ 70% of requested artefacts fall under (a) or (b).
- Given the report, then it contains a **cost impact estimate**: additional LLM token spend and GitHub API calls per assessment under the proposed design, expressed as an absolute value and a percentage delta against the V1 baseline. Go criterion: ≤ 50% increase in per-assessment LLM cost.
- Given the report, then it contains a **latency impact estimate**: projected added wall-clock time for retrieval + re-generation, expressed against V1's measured question-generation latency (captured from production telemetry).
- Given the report, then it concludes with an explicit **go / no-go recommendation** citing each of the four criteria above, and — if go — the scoped set of artefact types and retrieval strategies to implement in Story 17.2.
- Given a no-go outcome, then Story 17.2 is marked blocked pending re-evaluation, and the rationale is recorded in the report.

**Notes:** This is a research spike; the deliverable is the report, not production code. No feature flags, UI, or migrations ship from this story. Thresholds (60% overlap, 70% strategy coverage, 50% cost) are directional anchors — a result modestly below them warrants a recorded decision, not automatic rejection.

### Story 17.2: Opt-In Agentic Retrieval

**As an** Org Admin,
**I want to** opt into automatic artefact retrieval for assessments,
**so that** questions are enriched with context the system can find automatically.

**Dependency:** Story 17.1 must reach a **go** recommendation before work on 17.2 begins. The scoped artefact types and retrieval strategies for V2 are those defined by 17.1's report.

**Acceptance Criteria:**

- Given the default organisation configuration, then agentic retrieval is **disabled**; no retrieval is performed until the Org Admin explicitly opts in.
- Given the Org Admin enables agentic retrieval in organisation configuration, when the next assessment is generated, then the retrieval flow runs for that assessment and is recorded as enabled at assessment-creation time (later opt-outs do not retroactively disable completed assessments).
- Given retrieval is enabled, when initial question generation completes, then the system iterates each `additional_context_suggestions` item whose artefact type is in the **V2 scoped set** (defined by Story 17.1) and invokes the matching retrieval strategy. Artefact types outside the scoped set are skipped with a logged reason.
- Given retrieval returned at least one artefact, when question re-generation runs, then a second LLM call is issued with the original artefacts plus retrieved artefacts, and the re-generated questions replace the initial set before participants are notified.
- Given retrieval returned zero artefacts (all lookups failed or all were out-of-scope), then the original questions are used unchanged, the assessment proceeds, and the user-facing copy **does not** claim enrichment occurred.
- Given retrieval for an individual artefact type fails (network, permission, not-found, timeout), when the flow continues, then the failure is logged with type and reason, and the remaining retrievals proceed unaffected.
- Given agentic retrieval is enabled, when the total assessment generation duration (initial generation + retrieval + re-generation) is measured end-to-end, then it completes within **90 seconds**, or the retrieval phase is abandoned and the original questions are used.
- Given an organisation has enabled retrieval, when an assessment completes with `N ≥ 1` retrieved artefacts contributing to re-generation, then the results page shows: `"Questions enriched with {N} additional artefact(s) retrieved automatically."` (British English pluralisation).
- Given an organisation has enabled retrieval, when the Org Admin sets a **per-assessment additional LLM spend cap** (configurable, default: twice the V1 baseline assessment cost), then any assessment whose projected added spend would exceed the cap falls back to the original questions and logs the cap breach; the per-assessment cost breakdown (required by the "LLM cost visibility" cross-cutting concern) attributes retrieval cost separately from generation cost.
- Given retrieval requires GitHub scopes beyond those granted during V1 App installation (e.g., repository wiki read, repository contents read for non-PR paths), when the Org Admin opts in, then the UI lists the required additional scopes before enabling and the feature is blocked until the GitHub App installation grants them.

**Notes:** The 90-second end-to-end budget must be validated against the latency baseline captured by Story 17.1. If 17.1 shows the budget is infeasible for the scoped artefact set, 17.2 is revisited before implementation.

---

## V3 Roadmap Notes (Intent Debt)

The following capabilities are explicitly deferred to V3. They are documented here because the Storey (2026) triple debt model provides strong conceptual grounding for the product roadmap, and early V2 decisions should not foreclose V3 options.

**Intent debt lives in artefacts** — specifically in missing or degraded non-code artefacts: requirements documents, ADRs, acceptance tests, specifications. Where cognitive debt (V1/V2) measures whether the team *understands* the system, intent debt measures whether the system *still reflects what it was meant to do*.

### V3 Candidate Epics

**Intent Artefact Coverage Score**
For each feature, measure the presence and completeness of intent artefacts: ADRs, BDD specs, linked issues with acceptance criteria, design documents. Surface as a score alongside FCS and artefact quality score. This is the upstream driver of both artefact quality (Epic 11) and comprehension gaps.

**Spec-to-Behaviour Gap Detection**
Cross-reference BDD specs and acceptance tests against actual feature behaviour (test run results, production metrics). Flag where the system has drifted from its specified intent. Storey (2026): "Behaviour drift — the system's behavior diverges from what stakeholders believe it does."

**ADR Coverage Analysis**
Identify features or components that lack ADRs for significant architectural decisions. Use LLM analysis of code structure and PR history to suggest where ADRs are missing, not just whether a document exists.

**Unified Triple Debt Dashboard**
A single organisational health view combining:
- Technical debt (ingested from CodeScene, SonarQube, or equivalent)
- Cognitive debt (FCS scores, comprehension health score, decay data)
- Intent debt (artefact coverage, spec-to-behaviour gap)

This is the platform play. FCS owns two of the three columns. Technical debt data is sourced from best-in-class existing tools. The unified view is the strategic moat.

---

## Out of Scope for V2

| Item | Rationale |
|------|-----------|
| **Intent debt measurement (ADR coverage, spec-to-behaviour gap)** | V3. Requires significant additional artefact sourcing and BDD integration. |
| **GitLab / Bitbucket support** | Architecture should not preclude it. V2 remains GitHub-only. |
| **Jira integration** | V2 incident integration uses GitHub Issues. Jira deferred. |
| **On-premise / self-hosted** | SaaS only. |
| **Custom prompt templates per repository** | V1 uses fixed templates. Configurable prompts are a later feature. |
| **Real-time collaboration on assessments** | Each participant answers independently. |
| **Per-developer trend tracking** | By design. Individual scores are never tracked across assessments. |
| **Slack / Teams notifications** | V2: email and GitHub only. |
| **Automated incident detection (PagerDuty, OpsGenie)** | V2 uses GitHub Issues as incident proxy. Native incident tool integration is V3. |

---

## Cross-Cutting Concerns

All V1 cross-cutting concerns apply. Additional V2 concerns:

| Concern | Requirement |
|---------|-------------|
| **Data volume** | Decay tracking and correlation analysis introduce longitudinal data. Database partitioning strategy required before V2 data model is finalised. |
| **Benchmark data isolation** | Benchmark pool data must be stored in a separate schema with no join paths to individual org data. |
| **LLM cost visibility** | V2 introduces multiple additional LLM calls per assessment (AI baseline, artefact quality, agentic retrieval). Per-assessment cost breakdown must be visible to Org Admins. |
| **Framing discipline** | All V2 features must maintain the team-as-unit-of-analysis principle. No individual score tracking, no ranking, no naming. See marketing-notes.md for framing guidance. |
| **British English** | All user-facing text uses British English spelling. |

---

## Appendix: Storey (2026) Signal Mapping

Reference for Epic 12 design and V3 planning. Maps Storey's observable cognitive and intent debt signals to FCS instrumentation.

| Storey signal | Debt type | FCS instrumentation | Epic |
|--------------|-----------|---------------------|------|
| Resistance to change | Cognitive | Change velocity signal | 12.1 |
| Unexpected results | Cognitive | Correlated with low FCS scores in incident report | 13.2 |
| Low bus factor | Cognitive | Bus Factor Map | 10 |
| Burnout / stress | Cognitive | Survey prompt (lightweight, opt-in) | 12 (future story) |
| Slow onboarding | Cognitive | Onboarding velocity signal | 12.2 |
| Behaviour drift | Intent | Spec-to-behaviour gap (V3) | V3 |
| AI agents struggle with changes | Intent | Artefact quality score (proxy) | 11 |
| Loss of articulated constraints | Intent | ADR coverage (V3) | V3 |

---

*This document is an artefact that will be used in our own Feature Comprehension Score assessment.*
