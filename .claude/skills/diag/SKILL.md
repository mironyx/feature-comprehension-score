---
name: diag
description: Check VS Code extension diagnostics for changed files. Use when the user wants to check code quality, review diagnostics, or before committing code.
disable-model-invocation: true
allowed-tools: Read, Glob, Bash
---

# Check Diagnostics — On-Demand Code Quality Check

Reads diagnostics exported by the VS Code diagnostics-exporter extension from `.diagnostics/`. Use for a batch check across multiple files, e.g., before committing.

## Instructions

1. **Identify target files.**
   - If arguments are provided (`$ARGUMENTS`), check only those files.
   - Otherwise, check **all** files that have a diagnostics export: list every `.json` file under `.diagnostics/` (these are the files the extension has analysed). Also run `git diff --name-only` and `git diff --cached --name-only` to find modified source files (`.ts`, `.tsx`, `.js`, `.jsx`) that may not have a diagnostics file yet. Union both sets.

2. **Check diagnostics for each file.** For each source file:
   - Look for `.diagnostics/<relative-path>.json`
   - Read the JSON file if it exists
   - Parse the diagnostics array: `{source, severity, message, line, column, code}`

3. **Report findings:**
   - Total files checked vs files with diagnostics available
   - Issues grouped by severity (Errors first, then Warnings, then Info)
   - For each issue: `file:line:column [source/code] — message`
   - Files with no diagnostics file (extension may not have processed them yet)
   - Files with empty diagnostics (clean)
   - **If there are any Errors, flag this clearly at the top of the report.**

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
