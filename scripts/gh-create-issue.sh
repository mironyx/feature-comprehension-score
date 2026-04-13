#!/usr/bin/env bash
# Create a GitHub issue with deduplication and optional board integration.
#
# Shared by /kickoff, /architect, /frontend-architect, and any other skill
# that creates issues. Ensures consistent body templates, labels, and dedup.
#
# Usage:
#   ./scripts/gh-create-issue.sh --title "Title" --body "Body" [options]
#
# Options:
#   --title TEXT        Issue title (required)
#   --body TEXT         Issue body in markdown (required)
#   --labels L1,L2     Comma-separated labels (optional)
#   --add-to-board     Add to project board after creation (optional)
#   --board-status S   Board status after adding (default: todo)
#   --dry-run          Print what would be created without creating
#
# Deduplication:
#   Before creating, searches open issues for an exact title match.
#   If found, prints the existing issue number and exits 0 (no error).
#   The caller can detect this via the "exists:<number>" output prefix.
#
# Output:
#   On creation:  "created:<number>"
#   On dedup hit: "exists:<number>"
#   On error:     exits non-zero with message to stderr
#
# Environment:
#   GH_REPO — override repo (default: gh repo view --json nameWithOwner)
#
# Portability:
#   This script uses only `gh` CLI and standard POSIX tools. It reads
#   board configuration from scripts/gh-project-status.sh if --add-to-board
#   is used. To use in a new repo, set up gh-project-status.sh with the
#   correct project IDs (see that script's header).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Argument parsing ---
TITLE=""
BODY=""
LABELS=""
ADD_TO_BOARD=false
BOARD_STATUS="todo"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title)   TITLE="$2";        shift 2 ;;
    --body)    BODY="$2";         shift 2 ;;
    --labels)  LABELS="$2";       shift 2 ;;
    --add-to-board) ADD_TO_BOARD=true; shift ;;
    --board-status) BOARD_STATUS="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true;      shift ;;
    *)
      echo "Error: unknown option '$1'" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$TITLE" ]]; then
  echo "Error: --title is required" >&2
  exit 1
fi

if [[ -z "$BODY" ]]; then
  echo "Error: --body is required" >&2
  exit 1
fi

# --- Deduplication ---
# Search open issues for an exact title match.
# gh issue list --search uses GitHub search syntax; we quote the title
# and then verify an exact match in the results.
EXISTING=$(gh issue list --state open --limit 100 --json number,title \
  --jq ".[] | select(.title == \"$(echo "$TITLE" | sed 's/"/\\"/g')\") | .number" 2>/dev/null || true)

if [[ -n "$EXISTING" ]]; then
  # Take only the first match (shouldn't be multiple, but be safe)
  EXISTING=$(echo "$EXISTING" | head -1)
  echo "exists:${EXISTING}"
  exit 0
fi

# --- Dry run ---
if [[ "$DRY_RUN" == true ]]; then
  echo "dry-run: would create issue"
  echo "  title:  $TITLE"
  echo "  labels: ${LABELS:-<none>}"
  echo "  board:  $ADD_TO_BOARD (status: $BOARD_STATUS)"
  echo "  body:"
  echo "$BODY" | sed 's/^/    /'
  exit 0
fi

# --- Create issue ---
CREATE_ARGS=(--title "$TITLE" --body "$BODY")
if [[ -n "$LABELS" ]]; then
  CREATE_ARGS+=(--label "$LABELS")
fi

ISSUE_URL=$(gh issue create "${CREATE_ARGS[@]}" 2>&1)
if [[ $? -ne 0 ]]; then
  echo "Error: gh issue create failed: $ISSUE_URL" >&2
  exit 1
fi

# Extract issue number from URL (https://github.com/owner/repo/issues/123)
ISSUE_NUMBER=$(echo "$ISSUE_URL" | grep -oE '[0-9]+$')

if [[ -z "$ISSUE_NUMBER" ]]; then
  echo "Error: could not extract issue number from: $ISSUE_URL" >&2
  exit 1
fi

# --- Board integration ---
if [[ "$ADD_TO_BOARD" == true ]]; then
  if [[ -x "$SCRIPT_DIR/gh-project-status.sh" ]]; then
    "$SCRIPT_DIR/gh-project-status.sh" add "$ISSUE_NUMBER" "$BOARD_STATUS" >/dev/null 2>&1 || \
      echo "Warning: failed to add #$ISSUE_NUMBER to board" >&2
  else
    echo "Warning: gh-project-status.sh not found or not executable; skipping board add" >&2
  fi
fi

echo "created:${ISSUE_NUMBER}"
