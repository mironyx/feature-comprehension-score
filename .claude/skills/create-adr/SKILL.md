---
name: create-adr
description: Create an Architecture Decision Record. Use when making any significant technical decision, choosing between alternatives, or when the user mentions ADR, architecture decision, or design choice. Also use when discussing trade-offs between approaches.
allowed-tools: Read, Write, Bash, Glob
---

# Create Architecture Decision Record

## Process

1. **Check existing ADRs**: Read `docs/adr/` to find the next available number and check for related decisions
2. **Discuss if needed**: If the decision isn't fully formed, help the user think through options before writing
3. **Write the ADR**: Create `docs/adr/NNNN-title.md` using the template below

## Template

```markdown
# NNNN. [Decision Title]

**Date:** YYYY-MM-DD
**Status:** Proposed | Accepted | Superseded by [NNNN]
**Deciders:** [who was involved]

## Context

What is the issue that we're seeing that is motivating this decision or change?
Include relevant constraints, forces, and prior decisions that influence this one.

## Options Considered

### Option 1: [Name]
[Description]
- **Pros:** [list]
- **Cons:** [list]
- **Implications:** [what follows from this choice]

### Option 2: [Name]
[Description]
- **Pros:** [list]
- **Cons:** [list]
- **Implications:** [what follows from this choice]

## Decision

[Which option was chosen and why. Be specific about the reasoning — this section is the most valuable artefact for future comprehension.]

## Consequences

- [What becomes easier or harder as a result]
- [What follow-up decisions this creates]
- [What we explicitly chose NOT to do and why]
```

## Guidelines

- The **Decision** and **Consequences** sections matter most. Don't skimp on reasoning.
- Reference other ADRs by number when decisions are connected.
- "Superseded" status means a later ADR replaced this one — link to it.
- Record the decision even if it seems obvious now. Future readers (including the FCS assessment tool) need the reasoning, not just the outcome.
- If deferring a decision deliberately, create an ADR with status "Proposed" documenting why we're deferring and what information would trigger the decision.
