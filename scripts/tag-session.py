"""Tag the current Claude Code session with a feature ID.

Usage:
  py scripts/tag-session.py <issue-number> [--cont]

What it does:
  1. Derives the Claude project key from git root (works on Windows and WSL)
  2. Finds the newest session JSONL and writes a custom-title entry
  3. Appends a session->feature mapping to the Prometheus textfile
  4. Records the feature start timestamp (skipped if already present)

The --cont flag appends " (cont)" to the session title (used by /feature-cont).
"""

import argparse
import datetime
import json
import os
import pathlib
import subprocess
import sys


def git_root() -> pathlib.Path:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True, text=True, check=True,
    )
    return pathlib.Path(result.stdout.strip())


def derive_project_key(root: pathlib.Path) -> str:
    """Convert a git root path to a Claude project key.

    Windows: C:\\projects\\feature-comprehension-score -> c--projects-feature-comprehension-score
    WSL:     /home/user/projects/feature-comprehension-score -> -home-user-projects-feature-comprehension-score
    """
    return str(root).replace("/", "-").replace("\\", "-").replace(":", "")


def find_session_jsonl(claude_dir: pathlib.Path) -> pathlib.Path | None:
    jsonl_files = sorted(claude_dir.glob("*.jsonl"), key=os.path.getmtime, reverse=True)
    return jsonl_files[0] if jsonl_files else None


def write_custom_title(jsonl_path: pathlib.Path, session_id: str, title: str) -> None:
    with open(jsonl_path, "a", encoding="utf-8") as f:
        f.write(json.dumps({
            "type": "custom-title",
            "sessionId": session_id,
            "customTitle": title,
        }) + "\n")


def update_prom_file(prom_file: pathlib.Path, session_id: str, feature_id: str) -> None:
    existing = prom_file.read_text(encoding="utf-8") if prom_file.exists() else ""
    new_line = f'claude_session_feature{{session_id="{session_id}",feature_id="{feature_id}"}} 1\n'

    if new_line in existing:
        return

    header = (
        "# HELP claude_session_feature Maps Claude Code session ID to feature ID\n"
        "# TYPE claude_session_feature gauge\n"
    )
    if not existing:
        content = header + new_line
    elif not existing.startswith("# HELP"):
        content = header + existing + new_line
    else:
        content = existing.rstrip("\n") + "\n" + new_line

    prom_file.write_text(content, encoding="utf-8", newline="\n")


def record_feature_start(timing_file: pathlib.Path, feature_id: str) -> None:
    timing = json.loads(timing_file.read_text(encoding="utf-8")) if timing_file.exists() else {}
    if feature_id in timing:
        return
    timing[feature_id] = {
        "start_iso": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    timing_file.write_text(json.dumps(timing, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("issue", help="Issue number (e.g. 55)")
    parser.add_argument("--cont", action="store_true", help="Continuation session — appends (cont) to title")
    args = parser.parse_args()

    feature_id = f"FCS-{args.issue}"
    root = git_root()
    project_key = derive_project_key(root)

    claude_dir = pathlib.Path.home() / ".claude" / "projects" / project_key
    jsonl_path = find_session_jsonl(claude_dir)
    if not jsonl_path:
        print("No session JSONL found — skipping session tagging")
        sys.exit(0)

    session_id = jsonl_path.stem
    title = f"{feature_id} (cont)" if args.cont else feature_id

    # 1. Tag session in JSONL
    write_custom_title(jsonl_path, session_id, title)

    # 2. Update Prometheus textfile
    textfile_dir = root / "monitoring" / "textfile_collector"
    textfile_dir.mkdir(parents=True, exist_ok=True)
    update_prom_file(textfile_dir / "session_feature.prom", session_id, feature_id)

    # 3. Record feature start timestamp
    record_feature_start(textfile_dir / "feature_timing.json", feature_id)

    print(f"Session tagged: {title}")
    print(f"Prom file: {textfile_dir / 'session_feature.prom'}")


if __name__ == "__main__":
    main()
