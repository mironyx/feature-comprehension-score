"""Profile a Claude Code session by step, showing token usage breakdown.

Reads a session JSONL file, detects feature-core/feature-end step boundaries
from tool calls (Skill, Agent, Bash patterns), and produces a table showing
relative token cost per step.

Usage:
  python scripts/profile-session.py <session-id>
  python scripts/profile-session.py <session-id> --jsonl-dir ~/.claude/projects/<dir>
  python scripts/profile-session.py --latest
  python scripts/profile-session.py --latest --jsonl-dir ~/.claude/projects/<dir>

Weighted total uses relative pricing ratios (not USD):
  input x1.0, output x5.0, cache_write x1.25, cache_read x0.1
"""

import argparse
import json
import os
import pathlib
import sys
from dataclasses import dataclass, field


# Relative weight per token type (ratio of per-token pricing)
WEIGHTS = {
    "input": 1.0,
    "output": 5.0,
    "cache_write": 1.25,
    "cache_read": 0.1,
}


@dataclass
class TokenBucket:
    input: int = 0
    output: int = 0
    cache_write: int = 0
    cache_read: int = 0
    turns: int = 0

    def add(self, usage: dict) -> None:
        self.input += usage.get("input_tokens", 0)
        self.output += usage.get("output_tokens", 0)
        self.cache_write += usage.get("cache_creation_input_tokens", 0)
        self.cache_read += usage.get("cache_read_input_tokens", 0)
        self.turns += 1

    @property
    def weighted(self) -> float:
        return (
            self.input * WEIGHTS["input"]
            + self.output * WEIGHTS["output"]
            + self.cache_write * WEIGHTS["cache_write"]
            + self.cache_read * WEIGHTS["cache_read"]
        )

    @property
    def raw_total(self) -> int:
        return self.input + self.output + self.cache_write + self.cache_read


@dataclass
class Step:
    name: str
    bucket: TokenBucket = field(default_factory=TokenBucket)
    is_subagent: bool = False


# --- Step boundary detection ---

# Patterns that mark the START of a new step.
# Each is (detector_fn, step_name, is_subagent).
# detector_fn receives (tool_name, tool_input) and returns a step name or None.


def _detect_skill(name: str, inp: dict) -> str | None:
    if name != "Skill":
        return None
    skill = inp.get("skill", "")
    mapping = {
        "feature-core": "feature-core (skill invoke)",
        "feature-end": "feature-end (skill invoke)",
        "diag": "6: /diag",
        "pr-review-v2": "9: /pr-review-v2",
        "pr-review": "9: /pr-review",
        "lld-sync": "1.5: /lld-sync",
        "lld": "LLD generation",
    }
    return mapping.get(skill)


def _detect_agent(name: str, inp: dict) -> str | None:
    if name != "Agent":
        return None
    agent_type = inp.get("subagent_type", "")
    desc = inp.get("description", "").lower()

    if agent_type == "test-author":
        return "4b: test-author"
    if agent_type == "feature-evaluator":
        return "6b: feature-evaluator"
    if agent_type == "ci-probe":
        return "8b: ci-probe"
    if "pr-review" in agent_type:
        return "9: pr-review (agent)"
    if "simplify" in desc or "simplif" in agent_type:
        return "simplify (agent)"
    if "diagnostics" in agent_type or "diag" in desc:
        return "6: diagnostics (agent)"
    return f"agent: {agent_type or desc[:30]}"


def _detect_bash_step(name: str, inp: dict) -> str | None:
    if name != "Bash":
        return None
    cmd = inp.get("command", "")

    if "vitest run" in cmd and "npx tsc" in cmd:
        return "5: full verification"
    if "vitest run" in cmd:
        return "4c/5: vitest run"
    if "tsc --noEmit" in cmd:
        return "5: tsc check"
    if "npm run lint" in cmd:
        return "5: lint"
    if "markdownlint" in cmd:
        return "5: markdownlint"
    if "git commit" in cmd:
        return "7: commit"
    if "gh pr create" in cmd:
        return "8: PR create"
    if "git push" in cmd:
        return "8: git push"
    if "gh pr merge" in cmd:
        return "4: merge PR"
    if "query-feature-cost" in cmd:
        return "8/2.5: cost query"
    if "tag-session" in cmd:
        return "tag-session"
    if "gh-project-status" in cmd:
        return "board status update"
    if "silent" in cmd or ("grep" in cmd and "catch" in cmd):
        return "5b: silent-swallow check"
    return None


def _detect_read_design(name: str, inp: dict) -> str | None:
    """Detect design doc reads (Step 3)."""
    if name == "Read":
        path = inp.get("file_path", "")
        if "design/" in path or "lld" in path.lower() or "requirements" in path:
            return "3: read design"
    if name == "Bash":
        cmd = inp.get("command", "")
        if "gh issue view" in cmd:
            return "3: read issue"
    return None


DETECTORS = [_detect_skill, _detect_agent, _detect_bash_step, _detect_read_design]


def detect_step(tool_name: str, tool_input: dict) -> tuple[str | None, bool]:
    """Return (step_name, is_subagent) or (None, False) if no boundary."""
    for detector in DETECTORS:
        result = detector(tool_name, tool_input)
        if result:
            is_sub = tool_name == "Agent"
            return result, is_sub
    return None, False


# --- JSONL parsing ---


def _find_project_dir() -> pathlib.Path:
    """Auto-detect the JSONL project directory."""
    claude_dir = pathlib.Path.home() / ".claude" / "projects"
    candidates = sorted(
        (d for d in claude_dir.iterdir()
         if d.is_dir() and "feature-comprehension" in d.name),
        key=lambda d: sum(1 for _ in d.glob("*.jsonl")),
        reverse=True,
    )
    if not candidates:
        print("Error: no project dir found. Use --jsonl-dir.", file=sys.stderr)
        sys.exit(1)
    return candidates[0]


def find_jsonl(session_id: str | None, jsonl_dir: str | None, latest: bool) -> pathlib.Path:
    """Locate the JSONL file."""
    base = pathlib.Path(jsonl_dir) if jsonl_dir else _find_project_dir()

    if latest:
        files = sorted(base.glob("*.jsonl"), key=os.path.getmtime, reverse=True)
        if not files:
            print(f"Error: no JSONL files in {base}", file=sys.stderr)
            sys.exit(1)
        return files[0]

    path = base / f"{session_id}.jsonl"
    if not path.exists():
        print(f"Error: {path} not found", file=sys.stderr)
        sys.exit(1)
    return path


def list_sessions(jsonl_dir: str | None, limit: int = 15) -> None:
    """List available sessions with summary info."""
    base = pathlib.Path(jsonl_dir) if jsonl_dir else _find_project_dir()
    files = sorted(base.glob("*.jsonl"), key=os.path.getmtime, reverse=True)

    print(f"JSONL dir: {base}")
    print(f"{'Session ID':<40} {'Turns':>5} {'Branch':<30} {'Skills'}")
    print("\u2500" * 110)

    for fpath in files[:limit]:
        with open(fpath) as f:
            lines = [json.loads(l) for l in f]
        sid = "?"
        branch = "?"
        skills: set[str] = set()
        turns = 0
        for obj in lines:
            if not sid or sid == "?":
                sid = obj.get("sessionId", sid)
            if obj.get("gitBranch"):
                branch = obj["gitBranch"]
            msg = obj.get("message", {})
            if msg.get("role") == "assistant" and msg.get("usage"):
                turns += 1
            if msg.get("role") == "assistant":
                for block in msg.get("content", []):
                    if block.get("type") == "tool_use":
                        name = block.get("name", "")
                        inp = block.get("input", {})
                        if name == "Skill":
                            skills.add(inp.get("skill", ""))
                        elif name == "Agent":
                            st = inp.get("subagent_type", "")
                            if st:
                                skills.add(f"agent:{st}")
        print(f"{sid:<40} {turns:>5} {branch:<30} {', '.join(sorted(skills)) or '-'}")


def parse_session(path: pathlib.Path) -> tuple[dict, list[Step], dict[str, int]]:
    """Parse JSONL and return (metadata, steps, file_reads)."""
    with open(path) as f:
        entries = [json.loads(line) for line in f if line.strip()]

    # Extract metadata from first entry
    first = entries[0] if entries else {}
    meta = {
        "session_id": first.get("sessionId", "?"),
        "branch": first.get("gitBranch", "?"),
        "total_lines": len(entries),
    }

    # Count models used
    models: dict[str, int] = {}
    # Track file reads
    file_reads: dict[str, int] = {}

    steps: list[Step] = [Step(name="0: setup / pre-step")]
    current = steps[0]

    for entry in entries:
        msg = entry.get("message", {})
        role = msg.get("role", "")

        # Accumulate tokens for assistant messages
        if role == "assistant" and msg.get("usage"):
            current.bucket.add(msg["usage"])
            model = msg.get("model", "unknown")
            models[model] = models.get(model, 0) + 1

            # Check tool_use blocks for step boundaries and file reads
            for block in msg.get("content", []):
                if block.get("type") == "tool_use":
                    tool_name = block.get("name", "")
                    tool_input = block.get("input", {})

                    # Track file reads
                    if tool_name == "Read":
                        fp = tool_input.get("file_path", "")
                        if fp:
                            file_reads[fp] = file_reads.get(fp, 0) + 1

                    step_name, is_sub = detect_step(tool_name, tool_input)
                    if step_name:
                        new_step = Step(name=step_name, is_subagent=is_sub)
                        steps.append(new_step)
                        current = new_step

    meta["models"] = models
    return meta, steps, file_reads


# --- Output ---


def fmt_num(n: int) -> str:
    """Format number with comma separators."""
    if n == 0:
        return "-"
    return f"{n:,}"


def fmt_weight(w: float) -> str:
    if w == 0:
        return "-"
    return f"{w:,.0f}"


def merge_consecutive_steps(steps: list[Step]) -> list[Step]:
    """Merge consecutive steps with the same name."""
    if not steps:
        return steps
    merged: list[Step] = [steps[0]]
    for s in steps[1:]:
        if s.name == merged[-1].name and s.is_subagent == merged[-1].is_subagent:
            merged[-1].bucket.add({
                "input_tokens": s.bucket.input,
                "output_tokens": s.bucket.output,
                "cache_creation_input_tokens": s.bucket.cache_write,
                "cache_read_input_tokens": s.bucket.cache_read,
            })
            # add() increments turns by 1; we want the actual turns
            merged[-1].bucket.turns += s.bucket.turns - 1
        else:
            merged.append(s)
    return merged


def print_table(meta: dict, steps: list[Step], file_reads: dict[str, int] | None = None) -> None:
    steps = merge_consecutive_steps(steps)
    total = TokenBucket()
    main_total = TokenBucket()
    sub_total = TokenBucket()

    for s in steps:
        total.add({
            "input_tokens": s.bucket.input,
            "output_tokens": s.bucket.output,
            "cache_creation_input_tokens": s.bucket.cache_write,
            "cache_read_input_tokens": s.bucket.cache_read,
        })
        total.turns += s.bucket.turns - 1  # undo double-count from add()
        target = sub_total if s.is_subagent else main_total
        target.add({
            "input_tokens": s.bucket.input,
            "output_tokens": s.bucket.output,
            "cache_creation_input_tokens": s.bucket.cache_write,
            "cache_read_input_tokens": s.bucket.cache_read,
        })

    total_w = total.weighted or 1  # avoid div-by-zero

    print(f"\nSession: {meta['session_id']}")
    print(f"Branch:  {meta.get('branch', '?')}")
    print(f"Models:  {meta.get('models', {})}")
    print(f"Lines:   {meta['total_lines']}")
    print()

    hdr = (
        f"{'Step':<30} {'Input':>9} {'Output':>9} "
        f"{'Cache-W':>9} {'Cache-R':>9} {'Weighted':>10} {'%':>6} {'Turns':>5}"
    )
    sep = "\u2500" * len(hdr)
    print(hdr)
    print(sep)

    for s in steps:
        b = s.bucket
        if b.raw_total == 0 and b.turns == 0:
            continue
        pct = (b.weighted / total_w) * 100
        tag = " [sub]" if s.is_subagent else ""
        name = s.name + tag
        if len(name) > 30:
            name = name[:27] + "..."
        print(
            f"{name:<30} {fmt_num(b.input):>9} {fmt_num(b.output):>9} "
            f"{fmt_num(b.cache_write):>9} {fmt_num(b.cache_read):>9} "
            f"{fmt_weight(b.weighted):>10} {pct:>5.1f}% {b.turns:>5}"
        )

    print(sep)
    pct_main = (main_total.weighted / total_w) * 100
    pct_sub = (sub_total.weighted / total_w) * 100
    print(
        f"{'TOTAL':<30} {fmt_num(total.input):>9} {fmt_num(total.output):>9} "
        f"{fmt_num(total.cache_write):>9} {fmt_num(total.cache_read):>9} "
        f"{fmt_weight(total.weighted):>10} {'100%':>6} {total.turns:>5}"
    )
    print(
        f"{'  main agent':<30} {fmt_num(main_total.input):>9} {fmt_num(main_total.output):>9} "
        f"{fmt_num(main_total.cache_write):>9} {fmt_num(main_total.cache_read):>9} "
        f"{fmt_weight(main_total.weighted):>10} {pct_main:>5.1f}% "
    )
    print(
        f"{'  sub-agents':<30} {fmt_num(sub_total.input):>9} {fmt_num(sub_total.output):>9} "
        f"{fmt_num(sub_total.cache_write):>9} {fmt_num(sub_total.cache_read):>9} "
        f"{fmt_weight(sub_total.weighted):>10} {pct_sub:>5.1f}% "
    )

    # Aggregate view: group by normalised step name
    groups: dict[str, TokenBucket] = {}
    for s in steps:
        # Normalise: strip leading number prefix for grouping
        key = s.name
        # Merge variants: "3: read issue" + "3: read design" → "3: read context"
        if key.startswith("3: read"):
            key = "3: read context"
        if key.startswith("4c/5: vitest") or key == "5: full verification":
            key = "test runs (vitest)"
        if key.startswith("5: tsc") or key.startswith("5: lint") or key.startswith("5: markdown"):
            key = "verification (tsc/lint/md)"
        if key.startswith("8: ") or key.startswith("8/"):
            key = "8: push + PR + cost"
        if key.startswith("7: "):
            key = "7: commit"
        if key.startswith("4: merge") or key.startswith("board "):
            key = "cleanup (merge/board)"
        if key not in groups:
            groups[key] = TokenBucket()
        groups[key].add({
            "input_tokens": s.bucket.input,
            "output_tokens": s.bucket.output,
            "cache_creation_input_tokens": s.bucket.cache_write,
            "cache_read_input_tokens": s.bucket.cache_read,
        })
        groups[key].turns += s.bucket.turns - 1

    print()
    print("=== Aggregated by phase ===")
    print()
    print(f"{'Phase':<30} {'Weighted':>10} {'%':>6} {'Turns':>5}")
    print("\u2500" * 55)
    for name, bucket in sorted(groups.items(), key=lambda x: x[1].weighted, reverse=True):
        if bucket.raw_total == 0:
            continue
        pct = (bucket.weighted / total_w) * 100
        print(f"{name:<30} {fmt_weight(bucket.weighted):>10} {pct:>5.1f}% {bucket.turns:>5}")

    # File read frequency from the raw (unmerged) parse
    if file_reads:
        print()
        print("=== Files read (by frequency) ===")
        print()
        print(f"{'File':<70} {'Reads':>5}")
        print("\u2500" * 77)
        for path, count in sorted(file_reads.items(), key=lambda x: x[1], reverse=True)[:20]:
            # Shorten path for display
            short = path.replace("\\", "/")
            for prefix in ("c:/projects/feature-comprehension-score/",
                           "/home/lgsok/projects/feature-comprehension-score/"):
                short = short.replace(prefix, "")
            if len(short) > 70:
                short = "..." + short[-67:]
            print(f"{short:<70} {count:>5}")

    print()
    print(
        "Weights: input x1.0, output x5.0, cache_write x1.25, cache_read x0.1"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Profile a Claude Code session by step")
    parser.add_argument("session_id", nargs="?", help="Session UUID")
    parser.add_argument("--jsonl-dir", help="Directory containing JSONL files")
    parser.add_argument("--latest", action="store_true", help="Use the most recent session")
    parser.add_argument("--list", action="store_true", help="List available sessions")
    parser.add_argument("-n", type=int, default=15, help="Number of sessions to list (default: 15)")
    args = parser.parse_args()

    if args.list:
        list_sessions(args.jsonl_dir, args.n)
        return

    if not args.session_id and not args.latest:
        parser.error("Provide a session ID or use --latest")

    path = find_jsonl(args.session_id, args.jsonl_dir, args.latest)
    meta, steps, file_reads = parse_session(path)
    print_table(meta, steps, file_reads)


if __name__ == "__main__":
    main()
