"""
Pre-compact session log writer.

Reads the Claude Code transcript JSONL before context compaction and appends a
structured "compact snapshot" section to a draft session log in docs/sessions/.

Invoked by the PreCompact hook — receives JSON on stdin:
  {"session_id": "...", "transcript_path": "...", "cwd": "...", "hook_event_name": "PreCompact"}

Output: appends a section to docs/sessions/YYYY-MM-DD-session-N-draft.md.
If the file does not exist, creates it with a header.
If the file already exists (second compaction in same session), appends a new section.
"""

import json
import os
import pathlib
import re
import sys
from collections import Counter
from datetime import datetime


# ---------------------------------------------------------------------------
# JSONL parsing helpers
# ---------------------------------------------------------------------------

def _content_to_text(content) -> str:
    if isinstance(content, list):
        return " ".join(c.get("text", "") for c in content if isinstance(c, dict))
    return str(content)


def _parse_tool_use_block(block: dict) -> dict | None:
    if block.get("type") != "tool_use":
        return None
    return {"id": block.get("id", ""), "name": block.get("name", ""), "input": block.get("input", {})}


def _parse_tool_result_block(block: dict) -> tuple[str, str] | None:
    if block.get("type") != "tool_result":
        return None
    uid = block.get("tool_use_id", "")
    text = _content_to_text(block.get("content", ""))
    return (uid, text)


def _handle_assistant(obj: dict, tool_uses: list[dict]) -> None:
    content = obj.get("message", {}).get("content", [])
    if not isinstance(content, list):
        return
    for block in content:
        parsed = _parse_tool_use_block(block)
        if parsed:
            tool_uses.append(parsed)


def _handle_user(obj: dict, tool_results: dict[str, str]) -> None:
    content = obj.get("message", {}).get("content", [])
    if not isinstance(content, list):
        return
    for block in content:
        pair = _parse_tool_result_block(block)
        if pair:
            tool_results[pair[0]] = pair[1]


def _parse_lines(path: pathlib.Path) -> dict:
    """Single-pass parse: returns tool_uses, tool_results, feature_tag, turn_count."""
    tool_uses: list[dict] = []
    tool_results: dict[str, str] = {}
    feature_tag: str | None = None
    turn_count = 0

    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        t = obj.get("type")
        if t == "custom-title":
            feature_tag = obj.get("customTitle")
        elif t == "assistant":
            turn_count += 1
            _handle_assistant(obj, tool_uses)
        elif t == "user":
            _handle_user(obj, tool_results)

    return {"feature_tag": feature_tag, "turn_count": turn_count,
            "tool_uses": tool_uses, "tool_results": tool_results}


def parse_transcript(transcript_path: str) -> dict:
    path = pathlib.Path(transcript_path)
    return _parse_lines(path) if path.exists() else {}


# ---------------------------------------------------------------------------
# Fact extraction helpers
# ---------------------------------------------------------------------------

def _rel(file_path: str) -> str:
    """Return the repo-relative portion of an absolute path."""
    p = file_path.replace("\\", "/")
    for marker in ["/src/", "/tests/", "/docs/", "/.claude/", "/scripts/", "/supabase/"]:
        idx = p.find(marker)
        if idx >= 0:
            return p[idx + 1:]
    return pathlib.Path(file_path).name


def _vitest_result(text: str) -> str:
    passed = re.search(r"(\d+)\s+passed", text)
    failed = re.search(r"(\d+)\s+failed", text)
    if failed and int(failed.group(1)) > 0:
        n_pass = passed.group(1) if passed else "0"
        return f"FAIL ({failed.group(1)} failed, {n_pass} passed)"
    if passed:
        return f"{passed.group(1)} passed"
    return "FAIL" if "FAIL" in text.upper() else "unknown"


def _tsc_result(text: str) -> str:
    if "error TS" in text or "error:" in text:
        n = len(re.findall(r"error TS\d+", text))
        return f"{n} error(s)"
    return "clean"


def _git_commit_msg(cmd: str) -> str:
    m = re.search(r'-m\s+"([^"]+)"', cmd) or re.search(r"-m\s+'([^']+)'", cmd)
    return m.group(1)[:80] if m else "(message in heredoc)"


class _BashAccum:
    """Mutable accumulator for Bash command results — avoids 7-parameter function signatures."""
    def __init__(self) -> None:
        self.vitest: list[str] = []
        self.tsc: list[str] = []
        self.lint: list[str] = []
        self.commits: list[str] = []
        self.pushes: int = 0


def _classify_bash(cmd: str, text: str, acc: _BashAccum) -> None:
    """Append to the appropriate accumulator based on what the Bash command did."""
    if re.search(r"vitest\s+run", cmd):
        acc.vitest.append(_vitest_result(text))
    elif re.search(r"tsc\s+--noEmit", cmd):
        acc.tsc.append(_tsc_result(text))
    elif re.search(r"npm run lint", cmd):
        acc.lint.append("issues" if ("error" in text.lower() or "warning" in text.lower()) else "clean")
    elif re.search(r"git commit", cmd):
        acc.commits.append(_git_commit_msg(cmd))
    elif re.search(r"git push", cmd):
        acc.pushes += 1


def _count_file_ops(tool_uses: list[dict]) -> tuple[Counter, Counter]:
    written: Counter = Counter()
    edited: Counter = Counter()
    for tu in tool_uses:
        fp = tu["input"].get("file_path", "")
        if fp and tu["name"] == "Write":
            written[_rel(fp)] += 1
        elif fp and tu["name"] == "Edit":
            edited[_rel(fp)] += 1
    return written, edited


def _build_file_map(tool_uses: list[dict]) -> dict[str, str]:
    written, edited = _count_file_ops(tool_uses)
    result: dict[str, str] = dict.fromkeys(written, "created")
    for f in edited:
        result[f] = "created+edited" if f in result else f"edited ×{edited[f]}"
    return result


def _infer_project_root(tool_uses: list[dict]) -> str | None:
    """Derive the project root from Write/Edit file paths in the transcript.

    In worktree sessions the process CWD stays at the main repo, but Write/Edit
    paths point into the worktree.  We find the common prefix of all written
    paths that contain a known project marker directory.
    """
    markers = {"src", "tests", "docs", "supabase", "scripts"}
    roots: list[str] = []
    for tu in tool_uses:
        if tu["name"] not in ("Write", "Edit"):
            continue
        fp = tu["input"].get("file_path", "")
        if not fp:
            continue
        parts = pathlib.Path(fp).parts
        for i, part in enumerate(parts):
            if part in markers and i > 0:
                roots.append(str(pathlib.Path(*parts[:i])))
                break
    if not roots:
        return None
    # Most common root wins (ignores occasional reads from main repo)
    return Counter(roots).most_common(1)[0][0]


def extract_facts(data: dict) -> dict:
    """Derive human-readable facts from parsed transcript data."""
    tool_uses = data.get("tool_uses", [])
    tool_results = data.get("tool_results", {})
    acc = _BashAccum()
    agents: list[str] = []

    for tu in tool_uses:
        if tu["name"] == "Agent":
            agents.append(tu["input"].get("description") or tu["input"].get("subagent_type") or "agent")
        elif tu["name"] == "Bash":
            _classify_bash(tu["input"].get("command", ""), tool_results.get(tu["id"], ""), acc)

    return {
        "feature_tag": data.get("feature_tag"),
        "turn_count": data.get("turn_count", 0),
        "files": _build_file_map(tool_uses),
        "vitest_runs": acc.vitest,
        "tsc_runs": acc.tsc,
        "lint_runs": acc.lint,
        "git_commits": acc.commits,
        "git_pushes": acc.pushes,
        "agent_spawns": agents,
        "project_root": _infer_project_root(tool_uses),
    }


# ---------------------------------------------------------------------------
# Markdown rendering
# ---------------------------------------------------------------------------

def _files_section(files: dict) -> list[str]:
    if not files:
        return []
    lines = ["### Files touched"]
    for f, status in sorted(files.items()):
        lines.append(f"- `{f}` — {status}")
    return lines + [""]


def _milestones_section(facts: dict) -> list[str]:
    items = []
    vitest = facts.get("vitest_runs", [])
    tsc = facts.get("tsc_runs", [])
    lint = facts.get("lint_runs", [])
    if vitest:
        items.append(f"vitest run ×{len(vitest)} — last: {vitest[-1]}")
    if tsc:
        items.append(f"tsc ×{len(tsc)} — last: {tsc[-1]}")
    if lint:
        items.append(f"lint ×{len(lint)} — last: {lint[-1]}")
    for c in facts.get("git_commits", []):
        items.append(f'git commit: "{c}"')
    pushes = facts.get("git_pushes", 0)
    if pushes:
        items.append(f"git push ×{pushes}")
    if not items:
        return []
    return ["### Key milestones"] + [f"- {i}" for i in items] + [""]


def _agents_section(agents: list[str]) -> list[str]:
    if not agents:
        return []
    lines = ["### Agent spawns (cost drivers)"]
    for desc, n in Counter(agents).most_common():
        lines.append(f"- {desc} ×{n}")
    return lines + [""]


def _drivers_section(facts: dict) -> list[str]:
    vitest = facts.get("vitest_runs", [])
    agents = facts.get("agent_spawns", [])
    items = []
    if len(vitest) > 3:
        items.append(f"vitest run ×{len(vitest)} — each run loads full test suite into context")
    if agents:
        items.append(f"{len(agents)} agent spawn(s) — each re-sends full diff to subagent")
    if not items:
        items.append("(review manually)")
    return ["### Context drivers"] + [f"- {i}" for i in items] + [""]


def render_section(facts: dict, session_id: str, compact_time: str) -> str:
    tag = facts.get("feature_tag") or "unknown"
    turns = facts.get("turn_count", 0)
    header = [
        f"## Compact snapshot — {compact_time} (turn ~{turns}, session {session_id[:8]})",
        f"**Feature:** {tag}",
        "",
    ]
    body = (
        _files_section(facts.get("files", {}))
        + _milestones_section(facts)
        + _agents_section(facts.get("agent_spawns", []))
        + _drivers_section(facts)
        + ["---", ""]
    )
    return "\n".join(header + body)


# ---------------------------------------------------------------------------
# Draft log file management
# ---------------------------------------------------------------------------

def find_or_create_draft_path(sessions_dir: pathlib.Path, session_id: str) -> pathlib.Path:
    """Return an existing draft for this session_id, or a new path for today."""
    today = datetime.now().strftime("%Y-%m-%d")
    for p in sorted(sessions_dir.glob(f"{today}-session-*-draft.md")):
        if session_id[:8] in p.read_text(encoding="utf-8", errors="replace"):
            return p
    matches = [re.search(rf"{today}-session-(\d+)", p.name) for p in sessions_dir.glob(f"{today}-session-*.md")]
    max_n = max((int(m.group(1)) for m in matches if m), default=0)
    return sessions_dir / f"{today}-session-{max_n + 1}-draft.md"


def write_draft(draft_path: pathlib.Path, section: str, session_id: str) -> None:
    if draft_path.exists():
        existing = draft_path.read_text(encoding="utf-8")
        draft_path.write_text(existing + "\n" + section, encoding="utf-8")
    else:
        today_human = datetime.now().strftime("%Y-%m-%d")
        header = (
            f"# Session Draft Log — {today_human}\n\n"
            f"_Auto-generated by pre-compact hook. Complete with `/feature-end`._\n\n"
            f"Session ID: `{session_id}`\n\n"
            "---\n\n"
        )
        draft_path.write_text(header + section, encoding="utf-8", newline="\n")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    raw = sys.stdin.read().strip()
    event = json.loads(raw) if raw else {}

    transcript_path = event.get("transcript_path", "")
    cwd = event.get("cwd", os.getcwd())
    session_id = event.get("session_id", "unknown")
    compact_time = datetime.now().strftime("%H:%M")

    if not transcript_path:
        sys.stderr.write("pre-compact-session-log: no transcript_path in event\n")
        return

    data = parse_transcript(transcript_path)
    if not data:
        return

    facts = extract_facts(data)

    # Use project root inferred from Write/Edit paths (worktree-aware),
    # falling back to event.cwd for non-worktree sessions.
    project_root = facts.get("project_root") or cwd
    sessions_dir = pathlib.Path(project_root) / "docs" / "sessions"
    if not sessions_dir.exists():
        return  # Not a project with session logs — skip silently

    section = render_section(facts, session_id, compact_time)
    draft_path = find_or_create_draft_path(sessions_dir, session_id)
    write_draft(draft_path, section, session_id)
    sys.stderr.write(f"pre-compact-session-log: wrote snapshot to {draft_path.name}\n")


if __name__ == "__main__":
    main()
