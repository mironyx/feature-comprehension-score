#!/bin/bash
# PostToolUse hook: opens the edited file in Windsurf so CodeScene analyses it.
# Must run BEFORE check-diagnostics.sh so the extension has time to produce fresh output.
# Silently exits 0 if windsurf is not on PATH (CLI or non-Windsurf environments).

if ! command -v windsurf &>/dev/null; then
    exit 0
fi

DATA=$(python3 -c "
import json, sys
try:
    d = json.load(sys.stdin)
    tool = d.get('tool_name', '')
    path = d.get('tool_input', {}).get('file_path', '')
    if tool in ('Write', 'Edit', 'MultiEdit') and path:
        print(path)
except Exception:
    pass
" 2>/dev/null)

if [ -n "$DATA" ]; then
    windsurf --reuse-window "$DATA" &>/dev/null &
fi

exit 0
