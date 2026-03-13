# Multi-Agent Development Workflow

Companion to the [V1 implementation plan](2026-03-09-v1-implementation-plan.md).

## Core Principle

**The discipline is the sequence, not the separation.** Test first, implement second, review third. Whether that's one person wearing three hats or three people doesn't change the process.

In practice, the **Tester and Developer are usually the same person**. The value comes from maintaining the Red-Green-Refactor sequence — write the test, see it fail, then implement. The **Reviewer** is where genuine separation adds the most value — a fresh perspective catches what the author's assumptions hide.

## Roles

| Role | Phase | Does | Does NOT |
|------|-------|------|----------|
| **Tester** | Red | Write failing BDD tests from acceptance criteria | Write implementation code |
| **Developer** | Green + Refactor | Make tests pass with minimum code, then clean up | Change test expectations |
| **Reviewer** | Quality gate | Check architecture, test quality, conventions, PR size | Modify code |

**Tester + Developer are typically combined.** One person writes the failing test, confirms it fails, then implements. No need for a separate commit — the discipline is in the sequence, not the commit boundary. One commit with test + implementation is fine.

**Reviewer is genuinely separate.** Even on a two-person team, someone else reviews. For solo work, Claude Code acts as first-pass reviewer; the human does final approval.

## Flow

```
Issue created
    │
    ▼
Write failing test → confirm it fails → implement → refactor → commit → raise PR
    │
    ▼
Review (Claude first-pass + human approval) → merge
```

## Review Checklist

- Architecture fitness — dependency boundaries hold?
- Test quality — tests exercise behaviour, not implementation details?
- Code quality — complexity, naming, SOLID principles
- PR size — target < 200 lines
- Conventions — commit messages, British English, file naming

## Enforcement

| Mechanism | What it catches | When |
|-----------|----------------|------|
| CI coverage gates | Missing tests | Now |
| Architecture fitness tests | Boundary violations | Now |
| CodeScene | Complexity, code health decline | Now |
| PR template | Missing TDD evidence | Phase 2 |

## Team Scaling

| Size | Tester + Developer | Reviewer |
|------|-------------------|----------|
| 1 (solo + Claude) | Same person, sequential discipline | Claude Code first-pass + human |
| 2 | Same person, pair on complex work | Cross-review |
| 3-5 | Same person (or pair for complex features) | Rotating reviewer |

The workflow is identical at every team size. What changes is who provides the review.
