#!/usr/bin/env bash
# Update a GitHub project board item's status in one command.
# Usage: ./scripts/gh-project-status.sh <issue-number> <status>
# Status values: todo | blocked | "in progress" | done (case-insensitive)
#
# Cached IDs from: gh project field-list 1 --owner leonids2005
# These are stable and do not change between sessions.

set -euo pipefail

PROJECT_ID="PVT_kwHOAOSb584BQzxy"
FIELD_ID="PVTSSF_lAHOAOSb584BQzxyzg-0mow"

declare -A STATUS_IDS=(
  [todo]="8ecf3a65"
  [blocked]="942c7ae6"
  [in progress]="b4f43653"
  [done]="38eaf939"
)

OWNER="leonids2005"

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <issue-number> <status>"
  echo "Status: todo | blocked | \"in progress\" | done"
  exit 1
fi

ISSUE_NUMBER="$1"
STATUS="$(echo "$2" | tr '[:upper:]' '[:lower:]')"

OPTION_ID="${STATUS_IDS[$STATUS]:-}"
if [[ -z "$OPTION_ID" ]]; then
  echo "Error: unknown status '$2'. Use: todo | blocked | \"in progress\" | done"
  exit 1
fi

# Find the project item ID for this issue number.
# This is the one lookup we cannot cache — item IDs change when issues
# are removed and re-added to the board.
ITEM_ID=$(gh project item-list 1 --owner "$OWNER" --format json \
  | python -c "
import json, sys
data = json.load(sys.stdin)
for item in data['items']:
    content = item.get('content', {})
    if content.get('number') == $ISSUE_NUMBER:
        print(item['id'])
        sys.exit(0)
print('')
")

if [[ -z "$ITEM_ID" ]]; then
  echo "Error: issue #$ISSUE_NUMBER not found on the project board"
  exit 1
fi

gh project item-edit \
  --project-id "$PROJECT_ID" \
  --id "$ITEM_ID" \
  --field-id "$FIELD_ID" \
  --single-select-option-id "$OPTION_ID"

echo "Issue #$ISSUE_NUMBER → $2"
