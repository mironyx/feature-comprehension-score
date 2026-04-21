# Session: /requirements — E19 + Bug Triage

## Summary

Analysed a bug report from live E17 agentic retrieval testing (3 failed assessment attempts). Root-caused the primary failure to a missing `response_format: { type: 'json_object' }` in the tool-use path. Separated findings into a new epic (E19: GitHub Issues as Artefact Source) added to v2-requirements.md and 4 GitHub issues (3 bugs, 1 enhancement). Two human gates completed with review comments addressed.

## Shipped

| Commit | Scope |
|--------|-------|
| `eb1ee17` | docs: add E19 (GitHub issues as artefact source) to v2 requirements |

## Board state

| Issue | Title | Type | Status |
|-------|-------|------|--------|
| #279 | fix: tool-use path missing `response_format` JSON constraint | Bug (critical) | Todo |
| #280 | fix: mark tool-loop `malformed_response` errors as retryable | Bug | Todo |
| #281 | fix: assessments list not polling during rubric generation | Bug | Todo |
| #282 | feat: log file paths and issue references sent to LLM | Enhancement (E19.3) | Todo |

v2-requirements.md updated to v1.0 Final with E19 (3 stories, 17 ACs).

## Cross-cutting decisions

- **GraphQL for issue fetching:** E19 recommends GitHub GraphQL API over REST for batch issue+PR discovery. First GraphQL usage in the codebase. Deferred to `/architect`.
- **Separate `fcs_issue_sources` table:** Issue numbers stored separately from `fcs_merged_prs`, not mixed.
- **Convenience-first framing:** E19 is primarily about making assessment creation easier (provide issue numbers, auto-discover PRs), not about enriching content.

## What didn't go to plan

- Initial framing emphasised "issues as missing context" — user corrected to "convenience of selection". The value of issue content depends on the organisation.
- Initially proposed v4-requirements.md — user correctly challenged this; E19 belongs in v2.
- Initially focused on retryable flag as the bug — user pointed out the real bug is LLM not producing JSON at all. Root cause investigation revealed missing `response_format`.

## Process notes for /retro

- The `/requirements` skill worked well for adding an epic to an existing doc — review cycle handled inline `[Review]` markers cleanly.
- Bug report as input is unusual — mixed bugs, features, and observations needed triage before requirements could be scoped.
- Root-cause investigation (missing `response_format`) was essential context for writing accurate requirements and filing useful bug issues.

## Next step

Fix #279 (missing `response_format`) via `/feature` — this unblocks live testing. Then #280 (retryable flag) as a quick follow-up.
