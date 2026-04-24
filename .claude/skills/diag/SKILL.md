---
name: diag
description: Check diagnostics-exporter output for changed files. Use when the user wants to check code quality, review diagnostics, or before committing code.
allowed-tools: Read, Write, Edit, MultiEdit, Glob, Bash, mcp__codescene__code_health_review, mcp__codescene__code_health_score
---

# Check Diagnostics — On-Demand Code Quality Check

Reads diagnostics exported by the diagnostics-exporter extension from `.diagnostics/`. Use for a batch check across multiple files, e.g., before committing.

## How diagnostics are generated

The `diagnostics-exporter` extension exports diagnostics for files that are **open in the editor**. A PostToolUse hook fires after every Write/Edit, waits 3 s, then reads whatever the extension has exported. If the file is not open in the editor, the hook fires but the extension has nothing to export — the `.diagnostics/` file is either missing or reflects an earlier open session.

This means: after making fixes in a CLI session, the diagnostics file may be **stale** (shows old issues) or **missing** entirely. The fix is to open the file in the editor using `.claude/hooks/open-in-editor.sh <file>`, which triggers a fresh CodeScene pass, then wait for the export.

## Instructions

1. **Identify target files.**
   - If arguments are provided (`$ARGUMENTS`), check only those files.
   - Otherwise, check **all** files that have a diagnostics export: list every `.json` file under `.diagnostics/` (these are the files the extension has analysed). Also run `git diff --name-only` and `git diff --cached --name-only` to find modified files (`.ts`, `.tsx`, `.js`, `.jsx`) under **both `src/` and `tests/`** that may not have a diagnostics file yet. Union both sets. Test files are analysed by CodeScene and must be included — do not restrict to `src/` only.

2. **Open all target files in the editor immediately.**

   Do this **before reading diagnostics or making any fixes**. Once a file is open, the editor detects every subsequent on-disk save and triggers a fresh CodeScene pass automatically — so diagnostics will be live as you edit.

   ```bash
   .claude/hooks/open-in-editor.sh src/app/api/fcs/service.ts src/lib/github/client.ts
   sleep 5
   ```

   The `sleep 5` gives the initial analysis time to complete before you read diagnostics.

3. **Read diagnostics for each file.** For each source file:
   - Look for `.diagnostics/<relative-path>.json`
   - Read the JSON file if it exists
   - Parse the diagnostics array: `{source, severity, message, line, column, code}`

4. **Report all findings, then fix them all.**
   - Total files checked vs files with diagnostics available
   - Issues grouped by severity (Errors first, then Warnings, then Info)
   - For each issue: `file:line:column [source/code] — message`
   - Files with no diagnostics file: wait another 5 s and retry once
   - Files with empty diagnostics: clean
   - **If there are any Errors, flag this clearly at the top of the report.**

   After listing all findings, fix every one of them before proceeding. Do not stop at "documenting" a warning — fix it or, if it genuinely cannot be fixed without a major cross-file refactor, add an explicit `// Justification:` comment explaining why.

5. **Confirm resolution.**

   After all fixes are applied, re-read the diagnostics files for the changed files. Because the files are already open in the editor (from Step 2), the extension will have exported fresh diagnostics after each save — no need to re-open. If any findings remain, fix them and re-check.

   If a file's diagnostics timestamp has not advanced since before your edits (stale), run:
   ```bash
   .claude/hooks/open-in-editor.sh <file>
   sleep 5
   ```
   then re-read once more as a safety net.

6. **CodeScene MCP code health check.**

   After the diagnostics-exporter pass (Steps 1–5), run `mcp__codescene__code_health_score` on each target source file (use absolute paths, forward slashes). This works independently of the editor — no need for files to be open.

   - **Score ≥ 9.0 (green/optimal):** clean — no action needed.
   - **Score 4.0–8.9 (yellow):** run `mcp__codescene__code_health_review` for the detailed smell breakdown. Fix all findings that are within the scope of the current change. If a finding is pre-existing and unrelated to the current work, note it but do not fix.
   - **Score < 4.0 (red):** blocking — run `mcp__codescene__code_health_review`, fix all findings, and re-check until the score is at least 4.0 (ideally 9.0+).

   Report MCP scores alongside the diagnostics-exporter findings:

   ```
   ### Code Health (MCP)
   - `src/lib/engine/scoring/score-answer.ts` — 10.0 ✓
   - `src/lib/engine/pipeline/assess-pipeline.ts` — 7.2 ⚠ (complex conditional, bumpy road)
   - `tests/engine/scoring.test.ts` — 9.5 ✓
   ```

   **If any file scores below 9.0**, include the detailed review findings in the report and fix them before proceeding, following the same fix-and-recheck loop as Step 5.

## Diagnostics JSON Format

```json
{
  "file": "relative/path/to/source.ts",
  "analyzedAt": "2026-03-12T11:53:41.861Z",
  "diagnostics": [
    {
      "source": "ts",
      "severity": "Error",
      "message": "Description of the issue",
      "line": 42,
      "column": 5,
      "code": 1214
    }
  ]
}
```

## Example Output

```
## Diagnostics Report

**Files checked:** 3 | **With issues:** 1 | **Clean:** 1 | **No diagnostics:** 1

### Errors
- `src/lib/engine/scoring.ts:42:5` [ts/2304] — Cannot find name 'foo'

### Warnings
- `src/lib/engine/scoring.ts:15:1` [codescene/brain-method] — Complex method detected

### Clean
- `src/lib/engine/types.ts` — No issues

### No diagnostics available
- `tests/helpers/auth.test.ts` — Extension has not exported diagnostics for this file
```
