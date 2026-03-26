---
name: diag
description: Check VS Code extension diagnostics for changed files. Use when the user wants to check code quality, review diagnostics, or before committing code.
disable-model-invocation: true
allowed-tools: Read, Glob, Bash
---

# Check Diagnostics — On-Demand Code Quality Check

Reads diagnostics exported by the VS Code diagnostics-exporter extension from `.diagnostics/`. Use for a batch check across multiple files, e.g., before committing.

## How diagnostics are generated

The VS Code `diagnostics-exporter` extension exports diagnostics for files that are **open in the editor**. A PostToolUse hook fires after every Write/Edit, waits 3 s, then reads whatever the extension has exported. If the file is not open in VS Code, the hook fires but the extension has nothing to export — the `.diagnostics/` file is either missing or reflects an earlier open session.

This means: after making fixes in a CLI session, the diagnostics file may be **stale** (shows old issues) or **missing** entirely. The fix is to open the file in VS Code using `code <file>`, which triggers a fresh CodeScene pass, then wait for the export.

## Instructions

1. **Identify target files.**
   - If arguments are provided (`$ARGUMENTS`), check only those files.
   - Otherwise, check **all** files that have a diagnostics export: list every `.json` file under `.diagnostics/` (these are the files the extension has analysed). Also run `git diff --name-only` and `git diff --cached --name-only` to find modified source files (`.ts`, `.tsx`, `.js`, `.jsx`) that may not have a diagnostics file yet. Union both sets.

2. **Open files in VS Code to ensure fresh diagnostics.**

   For each target source file, run:
   ```bash
   code <file>
   ```
   Then wait 5 seconds for VS Code to open the file and the extension to export:
   ```bash
   Start-Sleep -Seconds 5   # PowerShell / Windows
   # or
   sleep 5                  # bash
   ```
   If there are multiple files, open all of them first, then wait once:
   ```bash
   code src/app/api/fcs/service.ts src/lib/github/client.ts
   sleep 5
   ```

3. **Check diagnostics for each file.** For each source file:
   - Look for `.diagnostics/<relative-path>.json`
   - Read the JSON file if it exists
   - Parse the diagnostics array: `{source, severity, message, line, column, code}`

4. **Report findings:**
   - Total files checked vs files with diagnostics available
   - Issues grouped by severity (Errors first, then Warnings, then Info)
   - For each issue: `file:line:column [source/code] — message`
   - Files with no diagnostics file (extension still not exported — wait another 5 s and retry once)
   - Files with empty diagnostics (clean)
   - **If there are any Errors, flag this clearly at the top of the report.**

5. **After fixes: confirm resolution.**

   If issues were found and fixes were applied, re-run from Step 2 on the fixed files. Do not assume an issue is resolved because the code was changed — verify by reading the updated diagnostics file. Only mark an issue resolved when the diagnostics file no longer contains it.

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
