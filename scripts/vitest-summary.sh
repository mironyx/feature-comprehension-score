#!/usr/bin/env bash
# Run vitest on the given file(s) and emit a compact summary.
# Usage: bash scripts/vitest-summary.sh <test-file> [vitest-args...]
# Exit code matches vitest's exit code.
set -uo pipefail

tmpfile=$(mktemp)
trap 'rm -f "$tmpfile"' EXIT

npx vitest run "$@" > "$tmpfile" 2>&1
vitest_exit=$?

python3 scripts/parse-vitest-output.py < "$tmpfile"
exit $vitest_exit
