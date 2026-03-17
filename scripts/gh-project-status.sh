#!/usr/bin/env bash
# Manage GitHub project board items.
#
# Usage:
#   ./scripts/gh-project-status.sh <issue-number> <status>
#   ./scripts/gh-project-status.sh add <issue-number> [status]
#
# Commands:
#   <issue-number> <status>        — Update status of an existing board item
#   add <issue-number> [status]    — Add issue to board and optionally set status (default: todo)
#
# Status values: todo | blocked | "in progress" | done (case-insensitive)
#
# Cached IDs from: gh project field-list 1 --owner leonids2005
# These are stable and do not change between sessions.

set -euo pipefail

REPO="leonids2005/feature-comprehension-score"
OWNER="leonids2005"
PROJECT_ID="PVT_kwHOAOSb584BQzxy"
FIELD_ID="PVTSSF_lAHOAOSb584BQzxyzg-0mow"

declare -A STATUS_IDS=(
  [todo]="8ecf3a65"
  [blocked]="942c7ae6"
  [in progress]="b4f43653"
  [done]="38eaf939"
)

# Find a real Python, skipping the Windows Store stub in WindowsApps.
find_python() {
  for candidate in python3 python; do
    local p
    p=$(command -v "$candidate" 2>/dev/null) || continue
    [[ "$p" == */WindowsApps/* ]] && continue
    "$p" --version &>/dev/null && echo "$p" && return 0
  done
  return 1
}

PYTHON=$(find_python)
if [[ -z "$PYTHON" ]]; then
  echo "Error: python not found (tried python3 and python, skipped WindowsApps stubs)"
  exit 1
fi

# Resolve a status name to its option ID. Exits on invalid status.
resolve_status() {
  local status_name="$(echo "$1" | tr '[:upper:]' '[:lower:]')"
  local option_id="${STATUS_IDS[$status_name]:-}"
  if [[ -z "$option_id" ]]; then
    echo "Error: unknown status '$1'. Use: todo | blocked | \"in progress\" | done" >&2
    exit 1
  fi
  echo "$option_id"
}

# Set a board item's status field.
set_item_status() {
  local item_id="$1"
  local option_id="$2"
  gh project item-edit \
    --project-id "$PROJECT_ID" \
    --id "$item_id" \
    --field-id "$FIELD_ID" \
    --single-select-option-id "$option_id"
}

# Find the project item ID for an issue number already on the board.
find_item_id() {
  local issue_number="$1"
  gh project item-list 1 --owner "$OWNER" --format json \
    | "$PYTHON" -c "
import json, sys
data = json.load(sys.stdin)
for item in data['items']:
    content = item.get('content', {})
    if content.get('number') == $issue_number:
        print(item['id'])
        sys.exit(0)
print('')
"
}

# --- Command: add ---
if [[ "${1:-}" == "add" ]]; then
  if [[ $# -lt 2 ]]; then
    echo "Usage: $0 add <issue-number> [status]"
    exit 1
  fi
  ISSUE_NUMBER="$2"
  STATUS="${3:-todo}"
  OPTION_ID=$(resolve_status "$STATUS")

  ITEM_ID=$(gh project item-add 1 --owner "$OWNER" \
    --url "https://github.com/${REPO}/issues/${ISSUE_NUMBER}" \
    --format json | "$PYTHON" -c "import json,sys; print(json.load(sys.stdin)['id'])")

  if [[ -z "$ITEM_ID" ]]; then
    echo "Error: failed to add issue #$ISSUE_NUMBER to the project board"
    exit 1
  fi

  set_item_status "$ITEM_ID" "$OPTION_ID"
  echo "Issue #$ISSUE_NUMBER → added → $STATUS"
  exit 0
fi

# --- Command: set status ---
if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <issue-number> <status>"
  echo "       $0 add <issue-number> [status]"
  echo "Status: todo | blocked | \"in progress\" | done"
  exit 1
fi

ISSUE_NUMBER="$1"
OPTION_ID=$(resolve_status "$2")

ITEM_ID=$(find_item_id "$ISSUE_NUMBER")

if [[ -z "$ITEM_ID" ]]; then
  echo "Error: issue #$ISSUE_NUMBER not found on the project board"
  exit 1
fi

set_item_status "$ITEM_ID" "$OPTION_ID"
echo "Issue #$ISSUE_NUMBER → $2"
