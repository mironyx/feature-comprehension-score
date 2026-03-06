# 0006. Soft/Hard Enforcement Modes

**Date:** 2026-03-06
**Status:** Accepted
**Deciders:** LS, Claude

## Context

The PRCC gate can be enforced in two ways. The choice of enforcement mode determines what "passing" means and what the consequences of failure are.

The two modes have been named throughout the requirements:

- **Soft mode** — All participants must submit answers that pass a relevance check (not rubbish). No score threshold. The gate passes as long as everyone makes a genuine attempt.
- **Hard mode** — All participants must submit answers AND the aggregate comprehension score must meet a configurable threshold (default: 70%). The gate fails if the score is too low.

This is a per-repository configuration setting, managed by the Org Admin. Org-level defaults cascade to repositories (Story 1.4). V1: one mode per repository — per-path or per-label modes are explicitly deferred (out of scope).

This ADR documents why two modes are the right design (rather than one) and the precise mechanics of each. Key forces: false negatives (LLM scores low, team actually understands) block merges and are costly; relevance detection is a simpler and more reliable LLM task than rubric-based scoring; teams new to the tool need an on-ramp before committing to a score threshold. FCS has no enforcement mode — it is retrospective and diagnostic, never blocks anything.

## Options Considered

### Option 1: Two modes — Soft and Hard (with relevance-only as default)

Soft mode: relevance check only, no scoring. Hard mode: relevance check + scoring against threshold. Soft is the default. Org Admins choose per-repo.

- **Pros:**
  - Provides an adoption on-ramp. Teams start with Soft, migrate to Hard when comfortable.
  - Soft mode LLM calls are cheaper and more reliable (binary classification, not scored rubric).
  - In Soft mode, scoring still runs and is stored — used for reporting without affecting gate outcome. Teams can observe their scores before committing to a score threshold.
  - Teams with high trust in LLM scoring can use Hard mode immediately.
  - Mirrors industry practice for gradual adoption of automated quality gates.
  - Explicit modes make the gate's behaviour predictable and transparent to participants.

- **Cons:**
  - Two code paths for gate evaluation logic.
  - Risk that teams stay in Soft mode indefinitely and never get score-gating benefits.
  - Configuration option adds UI surface and onboarding complexity.

### Option 2: Single mode — score threshold always applied

Only one mode: Hard mode. Score threshold is configurable, with a very low default (e.g., 30%) that functions effectively as Soft mode.

- **Pros:**
  - Simpler implementation — one code path.
  - No mode configuration option in the UI.
  - A low threshold is functionally equivalent to "pass if you tried".

- **Cons:**
  - Threshold semantics are confusing when the default is very low. "70% threshold with a default of 30%" is incoherent.
  - A 30% threshold would require the assessment to score something — which triggers full LLM scoring on every submission even when teams just want to check that participants engaged.
  - LLM scoring runs for every assessment regardless, increasing cost and latency even for teams who only want engagement checks.
  - Obscures the intent: relevance detection and score-based gating are fundamentally different quality signals, not the same thing on a dial.

### Option 3: Three modes — Off, Soft, Hard

Add an explicit "Off" mode where PRCC creates questions and runs assessments but the Check Run is always `neutral` (never blocks).

- **Pros:**
  - Allows teams to trial PRCC with zero gate consequences before committing to enforcement.
  - Cleaner than disabling PRCC entirely — questions are still generated and data is collected.

- **Cons:**
  - PRCC already has an enabled/disabled flag (Story 1.3). A "disabled" PRCC creates no Check Run. An "Off mode" PRCC creates a Check Run with no enforcement — this is a subtle but confusing distinction.
  - Adds a third configuration option. Increases onboarding surface without clear additional benefit over simply using Soft mode as the trial phase.
  - Participants may not take questions seriously if they know there is no consequence at all.

## Decision

**Option 1: Two modes — Soft and Hard, with Soft as the default.**

The two modes are semantically distinct, not just quantitatively different. Soft mode tests *engagement*; Hard mode tests *understanding*. These are different questions and different LLM tasks (binary classification vs. rubric-based scoring). Collapsing them obscures this distinction.

Soft mode as default is the right adoption choice: teams build the answering habit first, observe their scores (calculated and stored but not gating), and migrate to Hard mode when confident in the tool's calibration.

### Precise mechanics

**Soft mode:**

| Step | What happens |
|------|-------------|
| Participant submits | Relevance check runs (LLM binary classification per answer) |
| Irrelevant answer detected | Participant notified, must re-answer (up to 3 attempts) |
| 3rd failed attempt | Answer accepted, assessment flagged for Org Admin review |
| All participants submitted | Aggregate score calculated and stored (for reporting) |
| Gate outcome | `success` — regardless of aggregate score |

Scoring runs in Soft mode for reporting purposes only. It does not affect the gate outcome.

**Hard mode:**

| Step | What happens |
|------|-------------|
| Participant submits | Relevance check runs first (same as Soft mode) |
| All participants submitted | Aggregate score calculated |
| Score ≥ threshold | Gate outcome: `success` |
| Score < threshold | Gate outcome: `failure` |
| Check Run summary (fail) | "Aggregate comprehension: 58% (threshold: 70%)" — no per-participant breakdown |

Hard mode always includes relevance validation. It is strictly a superset of Soft mode.

**Shared mechanics (both modes):**

- Relevance: single LLM call per answer at submission time (`relevant | not_relevant + explanation`).
- Scoring: single LLM call per answer after all participants submit (`score 0.0–1.0 + rationale`). Runs in both modes — stored for reporting, used for gate only in Hard mode.
- Individual scores are never surfaced — only the aggregate.
- Hard mode is a strict superset of Soft mode.

**Configuration:**

| Setting | Default | Scope |
|---------|---------|-------|
| Enforcement mode | Soft | Per-repository (org default cascades) |
| Score threshold | 70% | Per-repository — only meaningful in Hard mode |

The threshold is stored regardless of mode, so switching from Soft to Hard requires no reconfiguration. "All submitted" (Author + all required reviewers) is the gate evaluation trigger in both modes. If a reviewer is removed, their response is soft-deleted and evaluation re-triggers if remaining participants have all submitted.

## Consequences

- **Easier:** Soft mode scoring provides calibration data — teams see real scores before committing to Hard mode. No ambiguity about when each LLM call runs.
- **Harder:** Two code paths for gate evaluation. The assessment completion handler must branch on mode at the point of "all submitted".
- **Harder:** Scoring must always run (even in Soft mode) to populate reporting data. This adds LLM cost per assessment even when the score is not used for the gate. This is an acceptable V1 trade-off: the reporting value justifies the cost.
- **Follow-up:** ADR-0008 (data model) must include: `mode` and `threshold` columns on the `repository_config` table; score stored on the assessment record regardless of mode; a flag indicating whether the gate was determined by mode (for reporting).
- **Follow-up:** The results page (Story 6.1) must show the enforcement mode and threshold (if Hard) — the Check Run summary references both.
- **Explicitly not doing:** Per-path or per-label enforcement modes — one mode per repository in V1. If a team has PRs with different risk profiles, they can configure separate repositories or wait for V2.
- **Explicitly not doing:** An "Off" mode — PRCC already has an enabled/disabled flag. Off mode adds complexity without proportionate value over Soft mode as a trial phase.
- **Explicitly not doing:** Exposing individual participant scores as part of the gate outcome — the aggregate is the unit of measurement, consistent with ADR-0005 (single aggregate score).

## References

- Requirements: Stories 2.5 (Relevance Validation), 2.6 (Score-Based Evaluation), 1.3 (Repository Configuration), 1.4 (Organisation Defaults), 6.1 (PRCC Results)
- ADR-0005: Single aggregate score (individual scores never surfaced)
- ADR-0008: Data model (pending — must store mode, threshold, scores per assessment)
- Research spike: `docs/design/spike-003-github-check-api.md` — Check Run conclusion mapping (Soft pass → `success`, Hard pass → `success`, Hard fail → `failure`)
- Out of scope: `docs/requirements/v1-requirements.md` — "Multiple enforcement modes per repo: deferred"
