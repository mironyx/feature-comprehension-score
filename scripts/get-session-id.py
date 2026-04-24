"""Find the current session title from Claude Code JSONL files.

Searches the session JSONL for a custom-title entry and prints it.
Falls back to 'pr-review' if no title is found.

Primary method: find the JSONL open by the parent Claude Code process via
/proc — the same approach used by tag-session.py. This is reliable after
sub-agents have run because sub-agents write their own JSONL files, making
mtime-based selection pick the wrong file.

Fallback: sort all JSONL files by mtime and try each one in order.

Usage:
    python get-session-id.py
    .claude/hooks/run-python.sh scripts/get-session-id.py
"""

import json
import os
import pathlib
import sys


def derive_project_key() -> str:
    path_str = str(pathlib.Path.home() / "projects" / "feature-comprehension-score").lower()
    path_str = path_str.replace(":\\", "--")
    return path_str.replace("\\", "-").replace("/", "-").replace(":", "")


def find_jsonl_via_proc(claude_dir: pathlib.Path) -> pathlib.Path | None:
    try:
        ppid = next(
            line.split()[1]
            for line in pathlib.Path("/proc/self/status").read_text().splitlines()
            if line.startswith("PPid:")
        )
        for fd in pathlib.Path(f"/proc/{ppid}/fd").iterdir():
            try:
                target = fd.resolve()
                if target.parent == claude_dir and target.suffix == ".jsonl":
                    return target
            except OSError:
                continue
    except Exception:
        pass
    return None


def read_title(jsonl: pathlib.Path) -> str | None:
    for line in reversed(jsonl.read_text(encoding="utf-8").splitlines()):
        try:
            obj = json.loads(line)
            if obj.get("type") == "custom-title":
                return obj["customTitle"]
        except (json.JSONDecodeError, KeyError):
            continue
    return None


claude_dir = pathlib.Path.home() / ".claude" / "projects" / derive_project_key()

# Primary: use the JSONL the parent process has open (immune to sub-agent mtime races)
proc_jsonl = find_jsonl_via_proc(claude_dir)
if proc_jsonl:
    title = read_title(proc_jsonl)
    if title:
        print(title)
        sys.exit(0)

# Fallback: try all JSONL files sorted by mtime
for jsonl in sorted(claude_dir.glob("*.jsonl"), key=os.path.getmtime, reverse=True):
    title = read_title(jsonl)
    if title:
        print(title)
        sys.exit(0)

print("pr-review")
