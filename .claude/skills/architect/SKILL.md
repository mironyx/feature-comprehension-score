---
name: architect
description: Read a plan document and produce all design artefacts in one pass (ADRs, LLDs, design doc updates, enriched issue bodies), so /feature agents can implement against approved designs.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Skill, TodoWrite
---

# Architect — Batch Design Artefact Generator

Reads a plan file and produces the design artefacts needed for each item, so `/feature` can implement against approved designs.

**Model:** Use Opus (the latest Claude model) for this skill and all sub-agents it spawns. When launching agents, pass `model: "opus"`.

**Usage:**

- `/architect` — reads the most recent plan in `docs/plans/`
- `/architect docs/plans/2026-03-29-mvp-phase2-plan.md` — reads a specific plan

## Decision Logic

For each item in the plan, determine the artefact type:

| Item type | Repo artefact (source of truth) | Issue update |
|-----------|--------------------------------|--------------|
| Cross-cutting decision (new technology, convention) | ADR in `docs/adr/` via `/create-adr` | Reference ADR |
| Implementation item with contracts | LLD section in `docs/design/` | Reference LLD section |
| Design doc update (existing doc needs correction) | Edit to existing `docs/design/` file | Reference updated section |
| Simple bug fix (already covered by existing LLD) | None needed | Add BDD specs, reference existing LLD |
| Small feature (no existing LLD coverage) | LLD section for the item | Reference LLD section |

## Process

Execute these steps sequentially.

### Step 1: Read the plan and check existing state

If `$ARGUMENTS` contains a file path, use that. Otherwise find the most recent `docs/plans/*.md` file by modification date.

Read the plan file fully. Extract the list of items with their priorities, dependencies, and design needs.

**Before creating anything**, check what already exists:

1. **Issues:** Run `gh issue list --state open --limit 50` to see all open issues. Do not create issues that already exist.
2. **Design docs:** Check `docs/design/`, `docs/adr/`, and `docs/requirements/` for existing coverage of each item.
3. **Source of truth rule:** Design detail must live in version-controlled repo docs (`docs/design/`, `docs/adr/`, `docs/requirements/`), not only in GitHub issue bodies. Issue bodies should reference repo docs, not replace them. If an item has detail only in an issue body, it needs a repo doc artefact (LLD section, design doc update, or requirements update).

### Step 2: Analyse and present overview

For each item, determine:

1. **Artefact type** — which row in the decision logic table applies.
2. **Input sources** — what files, issues, or design docs to read.
3. **Output** — what artefact will be produced and where.

Present a summary table to the user:

```
| # | Item | Artefact type | Output path |
|---|------|---------------|-------------|
```

**Wait for user confirmation** before producing artefacts. The user may re-prioritise, skip items, or redirect artefact types.

### Step 3: Read all input sources

For each item, read:

- Referenced GitHub issues: `gh issue view <number>`
- Referenced design docs in `docs/design/`
- Referenced ADRs in `docs/adr/`
- Relevant source files in `src/`
- Requirements in `docs/requirements/`

Read broadly — understanding the full context prevents design artefacts that contradict existing decisions.

### Step 4: Produce artefacts

Process items in the order listed in the plan. For each item:

#### ADR (cross-cutting decision)

Use `/create-adr` to produce the ADR. Provide the context, options, and recommended decision based on what the plan says and what you read in Step 3.

#### LLD section (implementation item with contracts)

Follow the LLD template from `/lld`:

- Identify layers (DB / BE / FE)
- Reference HLD sections — do not duplicate
- Add implementation-level detail: file paths, internal types, function signatures
- **API route internal decomposition is mandatory** — every API route LLD must include an explicit internal decomposition section specifying the controller/service split. The pattern is:
  - Controller (route.ts, ≤ 5 lines): calls `createApiContext(request)`, validates body, delegates to service
  - Service (service.ts): receives `ApiContext`, performs auth checks via `ctx.supabase`, writes via `ctx.adminSupabase`
  - Constraint: service never calls `createClient()` or any infrastructure factory — `ApiContext` is injected by the controller
  - See the LLD template's "Internal decomposition" section for the full pattern
- Include internal decomposition for non-trivial components
- Write BDD specs and acceptance criteria
- Append tasks sized for single `/feature` cycles (< 200 lines)

Write into the appropriate phase LLD file: `docs/design/lld-phase-<N>-<short-name>.md`. If the file exists, add or update sections. If not, create it.

#### Design doc update

Edit the existing design doc directly. Add a change log entry at the top noting the date and reason.

#### Enriched issue body

Update the GitHub issue with:

- **Root cause** (for bugs)
- **Fix approach** — specific files and functions to change
- **Affected files** — paths with line numbers where relevant
- **Acceptance criteria** — concrete, testable
- **BDD specs** — `describe`/`it` blocks the `/feature` skill can use directly

```bash
gh issue edit <number> --body "$(cat <<'EOF'
[enriched body content]
EOF
)"
```

### Step 5: Commit each artefact

After producing each artefact, commit it individually:

```bash
git add <specific-files>
git commit -m "docs: design for #<issue> — <summary>"
```

One commit per item for granular review. Do not batch.

### Step 6: Report

After all items are processed, summarise:

- What was produced (table of items and their artefacts)
- Any items skipped and why
- Any open questions or ambiguities found during design
- Suggested next step: human reviews the artefacts, then `/feature` implements

**Stop here.** The user reviews all artefacts before implementation begins.

## Guidelines

- **Do not implement.** This skill produces design artefacts only — no production code.
- **Do not invent requirements.** If the plan is ambiguous, flag it and ask rather than assuming.
- **Reference, do not duplicate.** Link to existing design docs and ADRs rather than restating them.
- **British English** in all documentation.
- **Keep artefacts proportional.** A one-line bug fix with existing LLD coverage needs only BDD specs in the issue. A small feature without LLD coverage needs an LLD section. Do not over-engineer the design for trivial items.
- **Respect existing decisions.** Read ADRs before proposing new ones — the decision may already be recorded.
- **Repo docs are source of truth.** GitHub issue bodies are convenient but not version-controlled. Every item that `/feature` will implement must have its design detail (fix approach, BDD specs, acceptance criteria) traceable to a file in `docs/`. Issue bodies reference these docs — they do not replace them.
- **Check before creating.** Always check for existing issues and design docs before creating new ones. Duplicate artefacts cause confusion.
- **API route items always get internal decomposition.** If a plan item involves an API route, the LLD section must include an explicit internal decomposition (controller/service split with `createApiContext` + `ApiContext` injection). Without this, `/feature` agents miss the established pattern and produce routes that call auth helpers and infrastructure factories directly. See `src/lib/api/context.ts` for the composition root and any existing `service.ts` file under `src/app/api/` for the pattern.
