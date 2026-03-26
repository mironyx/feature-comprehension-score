"""Query Prometheus for feature cost/tokens and optionally tag the GitHub issue.

Usage:
  py scripts/query-feature-cost.py <feature_id> [--issue N] [--pr N] [--final]

Arguments:
  feature_id   Feature ID to look up, e.g. FCS-55
  --issue N    GitHub issue number; if given, applies an ai-cost:<value> label
  --pr N       GitHub PR number; if given, also applies labels to PR and outputs time-to-PR
  --final      Prefix output heading with "Final" (used by feature-end)
"""

import argparse
import json
import pathlib
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

PROM = "http://localhost:9090/api/v1/query"


def git_root() -> pathlib.Path:
    # --git-common-dir always points to the main worktree's .git, even from a linked worktree
    common = subprocess.run(
        ["git", "rev-parse", "--git-common-dir"],
        capture_output=True, text=True, check=True,
    ).stdout.strip()
    p = pathlib.Path(common)
    if not p.is_absolute():
        p = pathlib.Path.cwd() / p
    return p.parent


def read_feature_start(feature_id: str) -> datetime | None:
    """Return the recorded start timestamp for feature_id, or None if not available."""
    timing_file = git_root() / "monitoring" / "textfile_collector" / "feature_timing.json"
    if not timing_file.exists():
        return None
    try:
        data = json.loads(timing_file.read_text(encoding="utf-8"))
        iso = data.get(feature_id, {}).get("start_iso")
        if iso:
            return datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except Exception:
        pass
    return None


def fetch_pr_created_at(pr: int) -> datetime | None:
    """Return the PR creation timestamp from GitHub, or None on error."""
    result = subprocess.run(
        ["gh", "pr", "view", str(pr), "--json", "createdAt", "-q", ".createdAt"],
        capture_output=True, text=True,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return None
    try:
        return datetime.fromisoformat(result.stdout.strip().replace("Z", "+00:00"))
    except ValueError:
        return None


def format_duration(seconds: float) -> str:
    """Format a duration in seconds as a human-readable string."""
    minutes = int(seconds // 60)
    if minutes < 60:
        return f"{minutes} min"
    hours, mins = divmod(minutes, 60)
    return f"{hours}h {mins}min"


def read_session_ids(feature_id: str) -> list[str]:
    prom_file = git_root() / "monitoring" / "textfile_collector" / "session_feature.prom"
    if not prom_file.exists():
        return []
    session_ids = []
    for line in prom_file.read_text(encoding="utf-8").splitlines():
        if line.startswith("claude_session_feature{") and f'feature_id="{feature_id}"' in line:
            for part in line.split(","):
                if "session_id=" in part:
                    session_ids.append(part.split('"')[1])
                    break
    return session_ids


def query_prom(promql: str) -> float | None:
    try:
        url = PROM + "?" + urllib.parse.urlencode({"query": promql})
        rows = (
            json.loads(urllib.request.urlopen(url, timeout=3).read())
            .get("data", {})
            .get("result", [])
        )
        return sum(float(r["value"][1]) for r in rows) if rows else 0.0
    except Exception:
        return None


def apply_labels(issue: int, cost: float, inp: float, out: float, pr: int | None = None) -> None:
    labels = [
        ("ai-cost", f"ai-cost:{cost:.4f}"),
        ("input-tokens", f"input-tokens:{int(inp)}"),
        ("output-tokens", f"output-tokens:{int(out)}"),
    ]
    # Fetch current issue labels once
    result = subprocess.run(
        ["gh", "issue", "view", str(issue), "--json", "labels"],
        capture_output=True, text=True,
    )
    existing = json.loads(result.stdout).get("labels", []) if result.returncode == 0 else []

    for prefix, label in labels:
        # Create label if it doesn't exist (colour: blue)
        subprocess.run(
            ["gh", "label", "create", label, "--color", "0075ca", "--force"],
            capture_output=True,
        )
        # Remove stale label with same prefix
        for lbl in existing:
            if lbl["name"].startswith(f"{prefix}:") and lbl["name"] != label:
                subprocess.run(
                    ["gh", "issue", "edit", str(issue), "--remove-label", lbl["name"]],
                    capture_output=True,
                )
        subprocess.run(
            ["gh", "issue", "edit", str(issue), "--add-label", label],
            capture_output=True,
        )
        if pr is not None:
            subprocess.run(
                ["gh", "pr", "edit", str(pr), "--add-label", label],
                capture_output=True,
            )
        targets = f"issue #{issue}" + (f", PR #{pr}" if pr is not None else "")
        print(f"Label applied: {label} -> {targets}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("feature_id", help="e.g. FCS-55")
    parser.add_argument("--issue", type=int, help="GitHub issue number for cost label")
    parser.add_argument("--pr", type=int, help="GitHub PR number to also apply cost labels to")
    parser.add_argument("--final", action="store_true", help="Mark output as final snapshot")
    args = parser.parse_args()

    session_ids = read_session_ids(args.feature_id)
    sid_regex = "|".join(session_ids) if session_ids else None

    if sid_regex:
        s = f'session_id=~"{sid_regex}"'
        cost = query_prom(f'sum(claude_code_cost_usage_USD_total{{{s}}})')
        inp  = query_prom(f'sum(claude_code_token_usage_tokens_total{{{s},type="input"}})')
        out  = query_prom(f'sum(claude_code_token_usage_tokens_total{{{s},type="output"}})')
        cr   = query_prom(f'sum(claude_code_token_usage_tokens_total{{{s},type="cacheRead"}})')
        cc   = query_prom(f'sum(claude_code_token_usage_tokens_total{{{s},type="cacheCreation"}})')
    else:
        cost = inp = out = cr = cc = None

    sessions_note = f" ({len(session_ids)} sessions)" if len(session_ids) > 1 else ""
    prefix = "Final " if args.final else ""

    if not session_ids:
        print(f"## {prefix}Usage\n- No session data found for {args.feature_id} — session tagging may not have run")
        sys.exit(0)

    if cost is None:
        print(f"## {prefix}Usage\n- Prometheus unreachable at {PROM} — is the monitoring stack running?")
        sys.exit(0)

    # Time-to-PR: only when --pr is provided and timing data exists
    time_line = ""
    if args.pr is not None:
        start = read_feature_start(args.feature_id)
        pr_created = fetch_pr_created_at(args.pr)
        if start is not None and pr_created is not None:
            elapsed = (pr_created - start).total_seconds()
            duration = format_duration(elapsed)
            time_line = f"\n- **Time to PR:** {duration}"

    print(
        f"## {prefix}Usage ({args.feature_id}{sessions_note})\n"
        f"- **Cost:** ${cost:.4f}\n"
        f"- **Tokens:** {int(inp or 0):,} input / {int(out or 0):,} output"
        f" / {int(cr or 0):,} cache-read / {int(cc or 0):,} cache-write"
        f"{time_line}"
    )
    if args.final:
        print("_Compare to PR-creation cost in the PR body to see post-PR rework overhead._")

    if args.issue is not None:
        apply_labels(args.issue, cost, inp or 0.0, out or 0.0, pr=args.pr)


if __name__ == "__main__":
    main()
