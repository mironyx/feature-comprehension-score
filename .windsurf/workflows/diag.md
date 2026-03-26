---
description: Check VS Code extension diagnostics for changed files. Use when the user wants to check code quality, review diagnostics, or before committing code.
---

# Check Diagnostics

Reads diagnostics exported by the VS Code diagnostics-exporter extension from `.diagnostics/`.
The `.diagnostics/` folder is gitignored so it must be read via PowerShell, not `read_file`.

## Instructions

### Step 1: Identify target files

If the user specified files, check only those. Otherwise check all diagnostics plus changed source files:

// turbo
```powershell
git diff --name-only; git diff --cached --name-only
```

### Step 2: Read all diagnostics

Run this command from the project root to read every `.diagnostics/` JSON that has findings:

// turbo
```powershell
Get-ChildItem ".diagnostics" -Recurse -Filter "*.json" | ForEach-Object {
  $data = Get-Content $_.FullName | ConvertFrom-Json
  if ($data.diagnostics.Count -gt 0) {
    Write-Output "=== $($data.file) ==="
    $data.diagnostics | ForEach-Object {
      Write-Output "[$($_.severity)] L$($_.line):$($_.column) [$($_.source)/$($_.code)] $($_.message)"
    }
  }
}
```

To also list clean files (zero diagnostics):

// turbo
```powershell
Get-ChildItem ".diagnostics" -Recurse -Filter "*.json" | ForEach-Object {
  $data = Get-Content $_.FullName | ConvertFrom-Json
  if ($data.diagnostics.Count -eq 0) { Write-Output "CLEAN: $($data.file)" }
}
```

### Step 3: Report findings

Present a structured report:

- **Total files checked** vs **files with issues** vs **clean** vs **no diagnostics file yet**
- Issues grouped by severity: **Errors first**, then Warnings, then Info
- For each issue: `` `file:line:column [source/code] — message` ``
- If any Errors exist, flag this clearly at the top: `ERRORS FOUND — must fix before committing`

#### Report format

```
## Diagnostics Report

**Files checked:** N | **With issues:** N | **Clean:** N | **No diagnostics:** N

### Errors
- `src/lib/engine/scoring.ts:42:5` [ts/2304] — Cannot find name 'foo'

### Warnings
- `src/lib/engine/scoring.ts:15:1` [codescene/brain-method] — Complex method detected

### Clean
- `src/lib/engine/types.ts` — No issues

### No diagnostics available
- `tests/helpers/auth.test.ts` — Extension has not exported diagnostics for this file yet
```

If there are no findings at all, report: `All files clean — no diagnostics issues found.`
