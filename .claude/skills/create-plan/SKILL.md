---
name: create-plan
description: Create a detailed implementation plan for a feature or task. Use when the user wants to plan work, break down a feature, create an implementation spec, or mentions planning a phase of work.
allowed-tools: Read, Write, Bash, Glob, Grep
---

# Create Implementation Plan

## Process

1. **Read context**: Read all referenced files fully. Check `docs/adr/` for relevant decisions and `docs/requirements/` for related requirements.
2. **Clarify before writing**: Present your understanding and ask focused questions. Don't write the plan with open questions — resolve them first.
3. **Propose structure**: Share the outline and get approval before writing details.
4. **Write the plan**: Save to `docs/plans/YYYY-MM-DD-description.md`

## Plan Template

```markdown
# [Feature/Task Name] Implementation Plan

## Overview
[What and why, in 2-3 sentences]

## Current State
[What exists, what's missing, relevant ADRs]

## Desired End State
[Specification of done state and how to verify it]

## Out of Scope
[Explicitly list what we're NOT doing]

## Approach
[High-level strategy and reasoning]

## Phase N: [Name]

### Changes Required
[Specific files/components with what changes]

### Success Criteria

#### Automated Verification
- [ ] [Command that can be run to verify]

#### Manual Verification
- [ ] [What a human needs to check]

**Pause here for manual verification before proceeding to next phase.**

## Risks and Mitigations
[What could go wrong and how we handle it]

## References
- [Links to ADRs, requirements, related docs]
```

## Key Principles

- No open questions in the final plan. Stop and resolve them.
- Separate automated from manual verification.
- Include "Out of Scope" — prevents scope creep.
- Each phase should be independently verifiable.
- Reference ADRs and requirements by path, not by memory.
