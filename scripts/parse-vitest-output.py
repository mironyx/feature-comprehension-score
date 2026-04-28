#!/usr/bin/env python3
"""
Parse vitest stdout/stderr and emit a compact summary.
Reads from stdin; writes to stdout.

Pass:  PASS N/N — Xs
Fail:  FAIL N/N
         [test file > test name]: first error line
"""
import sys
import re

raw = sys.stdin.buffer.read().decode('utf-8', errors='replace')

# Strip ANSI colour codes
ansi = re.compile(r'\x1b\[[0-9;]*[mK]')
clean = ansi.sub('', raw)
lines = clean.splitlines()

# --- Locate summary lines ---
# Match the vitest summary line: "      Tests  3 passed (3)" or "      Tests  1 failed | 1 passed (2)"
# Anchored to leading whitespace to avoid matching "Failed Tests 1" header lines.
tests_line = next((l for l in lines if re.search(r'^\s+Tests\s+\d+\s+(passed|failed)', l)), None)
duration_line = next((l for l in lines if re.search(r'Duration\s+[\d.]+', l)), None)

is_fail = tests_line is not None and 'failed' in tests_line

# --- Extract counts ---
passed = 0
failed = 0
if tests_line:
    m = re.search(r'(\d+) passed', tests_line)
    if m:
        passed = int(m.group(1))
    m = re.search(r'(\d+) failed', tests_line)
    if m:
        failed = int(m.group(1))
total = passed + failed

duration = ''
if duration_line:
    m = re.search(r'Duration\s+([\d.]+\w+)', duration_line)
    if m:
        duration = m.group(1)

# --- PASS path ---
if not is_fail:
    n = total if total > 0 else passed
    print(f'PASS {n}/{n} -- {duration}')
    sys.exit(0)

# --- FAIL path ---
print(f'FAIL {failed}/{total}')

# Extract failing test names and first error.
# Use only the "FAIL  path > describe > test name" block (detailed failure section).
# The × progress markers are skipped to avoid duplicates.
fail_blocks = []
i = 0
while i < len(lines):
    stripped = lines[i].strip()
    # Match only the detailed FAIL block lines: "FAIL  path/file.ts > describe > test name"
    if re.match(r'FAIL\s+\S', stripped):
        test_name = re.sub(r'^(FAIL\s+|\u00d7\s+|\u2715\s+)', '', stripped).strip()
        error = ''
        for j in range(i + 1, min(i + 15, len(lines))):
            candidate = lines[j].strip()
            if re.match(r'(AssertionError|Error|TypeError|ReferenceError|Expected|expected\s)', candidate):
                error = candidate[:120]
                break
        fail_blocks.append((test_name, error))
    i += 1

for name, err in fail_blocks[:5]:
    if err:
        print(f'  [{name}]: {err}')
    else:
        print(f'  [{name}]')

if failed > 5:
    print(f'  ... and {failed - 5} more failures')
