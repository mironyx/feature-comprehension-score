#!/bin/bash
# PostToolUse hook: opens the edited file in the user's editor so diagnostics extensions
# (e.g. CodeScene) can analyse it. Tries windsurf, then code, then skips silently.
# Must run BEFORE check-diagnostics.sh so the extension has time to produce fresh output.

EDITOR_CMD=""
if command -v windsurf &>/dev/null; then
    EDITOR_CMD="windsurf"
elif command -v code &>/dev/null; then
    EDITOR_CMD="code"
else
    exit 0
fi

PYTHON_CMD="python3"
command -v py &>/dev/null && PYTHON_CMD="py"

DATA=$($PYTHON_CMD -c "
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
    case "$(basename "$DATA")" in
        .tmp-*.md) exit 0 ;;
    esac
    $EDITOR_CMD --reuse-window "$DATA" &>/dev/null &
fi

exit 0
