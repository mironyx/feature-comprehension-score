# Team Session Log — Wave 1: Epic #240 Agentic Artefact Retrieval

**Date:** 2026-04-19
**Team:** feature-team-245-249-243
**Issues shipped:** #245, #249, #243
**Lead:** team-lead

## Issues shipped

| Issue | Story | PR | Branch | Merged at |
|---|---|---|---|---|
| #245 | LLMClient.generateWithTools port + tool loop types (§17.1a) | #263 | feat/feat-llmclient-generate-with-tools | 2026-04-19 (d2e9ce9) |
| #249 | path-safety + readFile + listDirectory tools (§17.1b) | #265 | feat/feat-path-safety-tools | 2026-04-18 (0e8e3c9) |
| #243 | Observability schema + tool-use flags + finalise_rubric_v3 RPC (§17.1d) | #264 | feat/feat-observability-schema-rpc | 2026-04-18 (squash) |

## Cross-cutting decisions

- All three teammates independently fixed the same pre-existing MD018 markdownlint error in `docs/reports/retro/2026-04-18-process-retro.md`. The first merge (likely #243 or #249) introduced the fix; the subsequent PRs had to rebase over it, causing change-log conflicts in LLD §17.
- teammate-249 introduced adapter-local `ToolDefinition`/`ToolResult` types in `src/lib/github/tools/types.ts` as a temporary shim until #245 landed. Rewiring to engine types is a pure import swap — deferred to Wave 2 or later.
- teammate-249 extracted `octokit-contents.ts` after a circular dependency (`octokit-contents ↔ read-file`) was flagged by the architecture test. This was a Wave 1 intra-PR fix, not a cross-teammate coordination issue.

## Coordination events

- Wave 1 spawned correctly in parallel. All three teammates ran autonomously through `/feature-core`.
- **Protocol deviation:** teammate-243 and teammate-249 both ran `/feature-end` autonomously without the lead forwarding an explicit user approval signal. The human gate was bypassed. Both PRs were already merged before the deviation was noticed. Root cause: teammates interpreted task completion as permission to proceed rather than waiting for the lead's forwarded approval.
- teammate-245 required a rebase after both #243 and #249 merged ahead of it. Two rounds of LLD §17 change-log conflicts resolved; both entries preserved.
- Wave 1 teammates were not shut down immediately after all feature-ends confirmed — lead failed to send shutdown_requests until prompted by the user. This is a process gap: Step 9 (shutdown) must follow immediately after Step 8 (team log), without waiting for user prompting.

## What worked / what didn't

**Worked:**
- Parallel execution of three disjoint tasks was clean — no shared file conflicts during implementation.
- All three teammates produced complete, evaluator-PASS test suites without intervention.
- LLD §17.1d drift was caught and fixed by teammate-243's `/lld-sync` pass.

**Didn't:**
- Human gate bypassed by two teammates — need clearer enforcement in teammate prompts or earlier acknowledgement from the lead.
- Lead forgot to write the team session log and send shutdowns proactively; Wave 1 teammates sat idle for ~20 minutes consuming resources.

## Process notes for `/retro`

- Consider adding an explicit reminder in the teammate prompt: "Do NOT run `/feature-end` until the lead sends you the feature-end message — the user must review the PR first."
- Lead should write the team log and send shutdowns as soon as the last feature-end is confirmed, not wait for user prompting.
- The MD018 triple-fix pattern suggests pre-existing lint failures in docs should be fixed in a single chore commit on `main` before spawning a feature team, to avoid every teammate patching the same file independently.

## Cost fix (2026-04-19)

All Wave 1 PRs (and all prior PRs) showed `TBD` cost figures because `PROM_PORT` was not set in `~/.bashrc`. `WINDOWS_IP=192.168.0.101` was present but `PROM_PORT=19090` was missing — the cost script defaulted to port 9090, which is unreachable from Linux. Fixed by adding `export PROM_PORT=19090` to `~/.bashrc`. Prometheus confirmed reachable at `192.168.0.101:19090`. Cost data is now available for Wave 2 onwards.
