---
name: diag
description: Check Windsurf extension diagnostics for changed files. Use when the user wants to check code quality, review diagnostics, or before committing code.
disable-model-invocation: true
allowed-tools: Read, Glob, Bash
---

# Check Diagnostics — On-Demand Code Quality Check

Reads diagnostics exported by the Windsurf diagnostics-exporter extension from `.diagnostics/`. Use for a batch check across multiple files, e.g., before committing.

## How diagnostics are generated

The Windsurf `diagnostics-exporter` extension exports diagnostics for files that are **open in the editor**. A PostToolUse hook fires after every Write/Edit, waits 3 s, then reads whatever the extension has exported. If the file is not open in Windsurf, the hook fires but the extension has nothing to export — the `.diagnostics/` file is either missing or reflects an earlier open session.

This means: after making fixes in a CLI session, the diagnostics file may be **stale** (shows old issues) or **missing** entirely. The fix is to open the file in Windsurf using `windsurf --reuse-window <file>`, which triggers a fresh CodeScene pass, then wait for the export.

## Instructions

1. **Identify target files.**
   - If arguments are provided (`$ARGUMENTS`), check only those files.
   - Otherwise, check **all** files that have a diagnostics export: list every `.json` file under `.diagnostics/` (these are the files the extension has analysed). Also run `git diff --name-only` and `git diff --cached --name-only` to find modified source files (`.ts`, `.tsx`, `.js`, `.jsx`) that may not have a diagnostics file yet. Union both sets.

2. **Open all target files in Windsurf immediately.**

   Do this **before reading diagnostics or making any fixes**. Once a file is open, Windsurf detects every subsequent on-disk save and triggers a fresh CodeScene pass automatically — so diagnostics will be live as you edit.

   ```bash
   windsurf --reuse-window src/app/api/fcs/service.ts src/lib/github/client.ts
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

   After all fixes are applied, re-read the diagnostics files for the changed files. Because the files are already open in Windsurf (from Step 2), the extension will have exported fresh diagnostics after each save — no need to re-open. If any findings remain, fix them and re-check.

   If a file's diagnostics timestamp has not advanced since before your edits (stale), run:
   ```bash
   windsurf --reuse-window <file>
   sleep 5
   ```
   then re-read once more as a safety net.

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
