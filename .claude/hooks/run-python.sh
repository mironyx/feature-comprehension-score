#!/bin/bash
# Cross-platform Python wrapper.
# Tries py (Windows), python3 (Unix), python (fallback) in order.
# Passes all arguments to the first Python interpreter found.

if command -v py &>/dev/null; then
    py "$@"
elif command -v python3 &>/dev/null; then
    python3 "$@"
elif command -v python &>/dev/null; then
    python "$@"
else
    echo "ERROR: No Python interpreter found (tried py, python3, python)" >&2
    exit 1
fi
