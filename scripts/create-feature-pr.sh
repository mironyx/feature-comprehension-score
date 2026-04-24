#!/usr/bin/env bash
# Create a feature PR with cost tracking and session ID.
#
# Extracts the PR creation boilerplate from feature-core Step 8 into a
# reusable script so the skill file stays concise.
#
# Usage:
#   ./scripts/create-feature-pr.sh \
#     --issue <number> \
#     --title "<short title>" \
#     --summary "<1-3 bullet points>" \
#     --design-ref "<path to design doc section>" \
#     --tests-added <N> \
#     --tests-total "<N (M test files)>"
#
# Optional:
#   --feature-id <FCS-NNN>   Feature ID for cost tracking (default: FCS-<issue>)
#
# Output:
#   Prints the PR URL on success, exits non-zero on error.
#
# Environment:
#   GH_REPO — override repo (default: current repo)

set -euo pipefail

# --- Parse arguments ---
ISSUE=""
TITLE=""
SUMMARY=""
DESIGN_REF=""
TESTS_ADDED=""
TESTS_TOTAL=""
FEATURE_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --issue)       ISSUE="$2";       shift 2 ;;
    --title)       TITLE="$2";       shift 2 ;;
    --summary)     SUMMARY="$2";     shift 2 ;;
    --design-ref)  DESIGN_REF="$2";  shift 2 ;;
    --tests-added) TESTS_ADDED="$2"; shift 2 ;;
    --tests-total) TESTS_TOTAL="$2"; shift 2 ;;
    --feature-id)  FEATURE_ID="$2";  shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# --- Validate required arguments ---
for var in ISSUE TITLE SUMMARY TESTS_ADDED TESTS_TOTAL; do
  if [[ -z "${!var}" ]]; then
    echo "Missing required argument: --$(echo "$var" | tr '[:upper:]' '[:lower:]' | tr '_' '-')" >&2
    exit 1
  fi
done

FEATURE_ID="${FEATURE_ID:-FCS-${ISSUE}}"
DESIGN_REF="${DESIGN_REF:-N/A}"

# --- Create PR with placeholder Usage section ---
PR_BODY="$(cat <<EOF
## Summary
${SUMMARY}

## Issue
Closes #${ISSUE}

## Design reference
${DESIGN_REF}

## Test plan
- [ ] \`npx vitest run\` — all tests pass
- [ ] \`npx tsc --noEmit\` — clean
- [ ] \`npm run lint\` — clean
- [ ] Design contracts verified (field names, types, schemas match)

## Verification
- **Tests added:** ${TESTS_ADDED}
- **Total tests:** ${TESTS_TOTAL}

## Usage
- **Cost:** TBD
- **Tokens:** TBD
- **Time to PR:** TBD

<!-- claude-session-id: TBD -->
EOF
)"

PR_URL=$(gh pr create --title "$TITLE" --base main --body "$PR_BODY")
PR_NUMBER=$(echo "$PR_URL" | grep -o '[0-9]*$')

# --- Cost tracking: apply labels and get cost summary ---
COST_OUTPUT=$(.claude/hooks/run-python.sh scripts/query-feature-cost.py \
  "$FEATURE_ID" --issue "$ISSUE" --pr "$PR_NUMBER" --stage pr 2>/dev/null) || true

COST_LINE=$(echo "$COST_OUTPUT" | grep '^\- \*\*Cost:' || echo "- **Cost:** unavailable")
TOKEN_LINE=$(echo "$COST_OUTPUT" | grep '^\- \*\*Tokens:' || echo "- **Tokens:** unavailable")
TIME_LINE=$(echo "$COST_OUTPUT" | grep '^\- \*\*Time to PR:' || echo "- **Time to PR:** unavailable")

# --- Resolve session ID from Prometheus textfile ---
SESSION_ID=$(python3 -c "
import re, pathlib, os, subprocess
result = subprocess.run(['git', 'rev-parse', '--git-common-dir'], capture_output=True, text=True)
root = pathlib.Path(result.stdout.strip()).parent.resolve()
prom_dir = pathlib.Path(os.environ.get('FCS_FEATURE_PROM_DIR') or root / 'monitoring' / 'textfile_collector')
prom = prom_dir / 'session_feature.prom'
if prom.exists():
    m = re.search(r'session_id=\"([^\"]+)\",feature_id=\"${FEATURE_ID}\"', prom.read_text())
    print(m.group(1) if m else 'unknown')
else:
    print('unknown')
" 2>/dev/null) || SESSION_ID="unknown"

# --- Patch the PR body with actual cost figures ---
CURRENT_BODY=$(gh pr view "$PR_NUMBER" --json body -q '.body')
UPDATED_BODY=$(echo "$CURRENT_BODY" | .claude/hooks/run-python.sh -c "
import sys
cost_line = '''$COST_LINE'''
token_line = '''$TOKEN_LINE'''
time_line = '''$TIME_LINE'''
session_id = '''$SESSION_ID'''
body = sys.stdin.read()
body = body.replace('- **Cost:** TBD', cost_line)
body = body.replace('- **Tokens:** TBD', token_line)
body = body.replace('- **Time to PR:** TBD', time_line)
body = body.replace('<!-- claude-session-id: TBD -->', f'<!-- claude-session-id: {session_id} -->')
print(body, end='')
")
gh api repos/{owner}/{repo}/pulls/"$PR_NUMBER" --method PATCH -f body="$UPDATED_BODY" > /dev/null

echo "$PR_URL"
