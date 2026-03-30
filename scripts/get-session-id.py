"""Find the current session title from Claude Code JSONL files.

Searches the most recent JSONL session file for a custom-title entry
and prints it. Falls back to 'pr-review' if no title is found.

Usage:
    python get-session-id.py
    .claude/hooks/run-python.sh scripts/get-session-id.py
"""

import json
import os
import pathlib
import sys

PROJECT_KEY = "c--projects-feature-comprehension-score"
claude_dir = pathlib.Path.home() / ".claude" / "projects" / PROJECT_KEY
jsonl_files = sorted(claude_dir.glob("*.jsonl"), key=os.path.getmtime, reverse=True)

if not jsonl_files:
    print("pr-review")
    sys.exit(0)

for line in reversed(jsonl_files[0].read_text(encoding="utf-8").splitlines()):
    try:
        obj = json.loads(line)
        if obj.get("type") == "custom-title":
            print(obj["customTitle"])
            sys.exit(0)
    except (json.JSONDecodeError, KeyError):
        continue

print("pr-review")  # fallback if no feature tag found
