# V2 Requirements — Proposed Additions

Four insertions reflecting the evolving role of FCS in an AI-agentic development context.

---

## 1. New subsection in "Context and Motivation"

**Insert after** the paragraph ending "...lays the foundation for intent debt measurement in V3."

**Insert before** "### Key external reference"

---

### Comprehension in an AI-Agentic Context

Naur's Theory Building assumes that the builders of a system hold the theory of that system — and that when the builders leave, the theory dies. In an AI-agentic development context, a third possibility emerges: the theory was never built in the first place, because the agent did not need it to produce working code.

When AI agents assume implementation responsibility, the comprehension that distinguishes a competent engineering team from a group of prompt operators shifts upward: from understanding *how* code works to understanding *why* the system is shaped the way it is, what invariants must hold across features, and what architectural constraints the agents cannot infer from context alone. An agent with sufficient context can re-derive any implementation detail in seconds. What it cannot do is judge whether its output violates an unstated design principle, contradicts a domain constraint, or introduces architectural drift that will compound over subsequent agent sessions.

This has two implications for FCS:

1. **The type of comprehension that matters is context-dependent.** A team writing most code by hand needs implementation-level comprehension. A team using agents extensively needs architectural, domain, and invariant comprehension. FCS must be configurable in which layers of theory it prioritises, adapting its assessment profile to the team's AI-adoption posture.

2. **FCS becomes more critical, not less.** The easier it is for agents to produce working code, the harder it becomes to detect whether anyone on the team understands the system well enough to catch when the agent is wrong. FCS measures the thing that agents make invisible: whether humans remain competent stewards of the systems they nominally own.

V2's expanded assessment dimensions (Epic 14) begin addressing this. The full implication — that FCS should offer configurable comprehension profiles tuned to different AI-adoption levels — is a design principle that should inform all V2 epic design and is made explicit in Epic 14 below.

---

## 2. Design note added to Epic 14 preamble

**Insert after** the current Epic 14 introduction paragraph (ending "...orthogonal to Naur and require separate prompt engineering.")

**Insert before** "### Story 14.1"

---

### Design Note: Configurable Comprehension Profiles

The three additional dimensions introduced here (test strategy, operational knowledge, security) are instances of a more general capability: **configurable comprehension dimensions with adjustable weights**. The architecture for Epic 14 should support an extensible dimension framework rather than three hard-coded bolt-ons.

In practice, this means the Org Admin should be able to configure an **assessment profile** that adjusts the weight of each comprehension dimension based on the team's development context:

| Dimension | Hand-coded team (default) | AI-assisted team | AI-agentic team |
|-----------|--------------------------|------------------|-----------------|
| Implementation mechanics | 40% | 20% | 10% |
| Design justification / architectural rationale | 20% | 30% | 35% |
| Domain model and invariants | 20% | 25% | 30% |
| Test strategy awareness | 10% | 10% | 10% |
| Operational / production knowledge | 5% | 10% | 10% |
| Security / threat model | 5% | 5% | 5% |

These profiles are illustrative, not prescriptive — the critical design decision is that dimension weights are data, not code.

V2 implementation: Ship with the three fixed dimensions (Stories 14.1–14.3). Ensure the data model and scoring pipeline support per-dimension weighting. Surface a "team AI-adoption level" selector (Manual / AI-Assisted / AI-Agentic) in the assessment configuration that applies a preset weight profile. Custom weight configuration is a fast-follow or V3 feature.

This reframing transforms Epic 14 from "three more question types" into the mechanism by which FCS adapts to the defining shift in how software gets built.

---

## 3. Forward-looking note added to Epic 9

**Insert at the end of** Story 9.2 acceptance criteria, as a new subsection within Epic 9.

---

### Design Note: Agent Topology and Conway's Law

As teams move from AI-assisted development (human writes code with AI help) to AI-agentic development (agents make multi-file, multi-module changes with human oversight), the AI vs Human delta takes on a second interpretation.

In an agentic context, the AI baseline score reflects what the agent's *communication structure* — its context window, its available tools, its prompt — could produce. The human score reflects what the team's communication structure (org chart, meetings, documentation) produced. The delta becomes a Conway's Law diagnostic: it measures whether the agent's topology or the team's topology produced better comprehension transfer.

A persistently negative delta (AI > humans) in an agentic team is a signal that the agent's context window has become the primary carrier of system knowledge — and the humans are falling behind the artefacts the agent consumed. This is a qualitatively different risk from the same signal in a hand-coded team, and should be flagged accordingly in a future iteration of the delta display (Story 9.2).

This connection — FCS as a Conway's Law measurement instrument for human-agent hybrid organisations — is a research angle with potential academic interest and should be explored in collaboration with researchers working on cognitive and intent debt (cf. Storey 2026).

---

## 4. New V3 candidate epic in "V3 Roadmap Notes"

**Insert after** the "Unified Triple Debt Dashboard" candidate epic, before the closing italicised line.

---

**Agent Session Comprehension Signals**

Analyse AI agent session traces (tool calls, file access patterns, re-derivation sequences) to detect comprehension-relevant signals. Two primary indicators:

1. *Re-derivation frequency.* When an agent must re-derive understanding that should have been documented (e.g., repeatedly reading the same files to reconstruct architectural context), this is a signal of missing theory externalisation — the Naur problem in machine-readable form. High re-derivation frequency on a feature correlates with low artefact quality (Epic 11) and predicts comprehension decay (Epic 8).

2. *Unreviewed architectural decisions.* When an agent makes structural decisions (new module boundaries, dependency introductions, API shape changes) that no human explicitly reviewed or approved, this is a signal that theory is being created by an entity that does not retain it. The next human — or agent — to touch that code inherits structure without rationale.

Agent session logs are an emerging and underexploited data source. Connecting them to FCS positions the tool at the intersection of developer tooling and AI governance — a space where no current product operates. Implementation requires integration with agent frameworks (e.g., Claude Code session logs, Cursor activity traces) and is dependent on those frameworks exposing structured session data. V3 feasibility study should assess available session log formats and define a minimal viable schema.

This epic connects directly to Naur's core insight: the program theory dies when the builders leave. In an agentic context, the builder (the agent) never held the theory — it held context. The theory gap is immediate, not deferred.
