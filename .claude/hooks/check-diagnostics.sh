#!/bin/bash
# PostToolUse hook: feeds VS Code extension diagnostics back into Claude Code.
#
# How it works:
#   1. Claude Code triggers this hook after every Write/Edit tool call
#   2. Claude Code pipes a JSON payload to stdin with the edited file path and cwd
#   3. This script maps that file path to a .diagnostics/ JSON file
#      (written by the companion VS Code extension "diagnostics-exporter")
#   4. It polls for up to 5 seconds, waiting for a diagnostics file whose
#      analyzedAt timestamp is newer than when the hook started
#   5. If fresh diagnostics are found, it writes a JSON response to stdout using
#      Claude Code's hookSpecificOutput.additionalContext protocol
#   6. Claude receives the diagnostics as inline context in the conversation
#
# Dependencies:
#   - Node.js (for JSON parsing — jq not available on all systems)
#   - VS Code extension "diagnostics-exporter" writing to .diagnostics/
#
# Configuration (in .claude/settings.json):
#   "hooks": { "PostToolUse": [{ "matcher": "Write|Edit",
#     "hooks": [{ "type": "command", "command": ".claude/hooks/check-diagnostics.sh", "timeout": 10 }] }] }

set -euo pipefail

node -e "
const fs = require('fs');
const path = require('path');

// Record when the hook started — used to distinguish fresh vs stale diagnostics
const hookStartTime = Date.now();

// Debug log helper — append to .claude/hooks/hook.log
// Remove this function and all log() calls once the pipeline is validated
function log(cwd, msg) {
  try {
    const logFile = path.join(cwd || '.', '.claude', 'hooks', 'hook.log');
    fs.appendFileSync(logFile, new Date().toISOString() + ' ' + msg + '\n');
  } catch (_) {}
}

// --- Read the JSON payload that Claude Code pipes to stdin ---
let chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());
  const filePath = input.tool_input?.file_path || '';
  const cwd = input.cwd || '';

  log(cwd, 'Hook fired for: ' + filePath);

  if (!filePath || !cwd) {
    log(cwd, 'Skipped: no filePath or cwd');
    process.exit(0);
  }

  // Skip in git worktrees — VS Code diagnostics-exporter only watches the main
  // worktree, so polling here will always time out with no result.
  const diagRoot = path.join(cwd, '.diagnostics');
  if (!fs.existsSync(diagRoot)) {
    log(cwd, 'Skipped: no .diagnostics dir (likely a worktree)');
    process.exit(0);
  }

  // --- Normalise paths (Windows backslashes to forward slashes) ---
  const normFile = filePath.replace(/\\\\/g, '/');
  const normCwd = cwd.replace(/\\\\/g, '/');

  // Derive relative path from project root
  let relPath = normFile;
  if (normFile.startsWith(normCwd + '/')) {
    relPath = normFile.slice(normCwd.length + 1);
  }

  // Check TypeScript/JavaScript, YAML, and Dockerfile
  const basename = relPath.split('/').pop() || '';
  if (!/\\.(tsx?|jsx?|ya?ml)$/.test(relPath) && basename !== 'Dockerfile') {
    log(cwd, 'Skipped non-source file: ' + relPath);
    process.exit(0);
  }

  // --- Map source file to its diagnostics export ---
  // e.g. src/lib/engine/scoring.ts -> .diagnostics/src/lib/engine/scoring.ts.json
  const diagFile = path.join(cwd, '.diagnostics', relPath + '.json');

  // --- Poll for fresh diagnostics (500ms intervals, up to 5s) ---
  // We check analyzedAt against hookStartTime — only a file written after
  // this hook fired counts as fresh. This avoids both stale reads and the
  // race condition where a fast provider writes the file before we start polling.
  let attempts = 0;
  const maxAttempts = 10;
  const intervalMs = 500;

  function check() {
    attempts++;

    if (fs.existsSync(diagFile)) {
      try {
        const diag = JSON.parse(fs.readFileSync(diagFile, 'utf8'));
        const analyzedAt = new Date(diag.analyzedAt).getTime();

        if (analyzedAt > hookStartTime) {
          // Fresh diagnostics — report them if there are any issues
          if (diag.diagnostics && diag.diagnostics.length > 0) {
            const lines = diag.diagnostics.map(d =>
              '  ' + d.severity + ' at line ' + d.line + ':' + d.column
              + ' [' + d.source + '/' + d.code + '] ' + d.message
            );
            const summary = 'VS Code diagnostics for ' + diag.file
              + ' (' + diag.diagnostics.length + ' issues):\\n' + lines.join('\\n');

            log(cwd, 'Found ' + diag.diagnostics.length + ' diagnostics for ' + relPath + ' (attempt ' + attempts + ')');

            // --- Write response using Claude Code's hook protocol ---
            process.stdout.write(JSON.stringify({
              hookSpecificOutput: {
                hookEventName: 'PostToolUse',
                additionalContext: summary
              }
            }));
            process.exit(0);
          } else {
            // Fresh analysis, no issues — exit silently
            log(cwd, 'Fresh analysis: no issues for ' + relPath + ' (attempt ' + attempts + ')');
            process.exit(0);
          }
        }
        // else: file exists but analyzedAt <= hookStartTime — stale, keep polling
      } catch (e) {
        // File might be mid-write by the extension, retry on next tick
      }
    }

    if (attempts < maxAttempts) {
      setTimeout(check, intervalMs);
    } else {
      log(cwd, 'No fresh diagnostics after ' + maxAttempts + ' attempts for ' + relPath);
      process.exit(0);
    }
  }

  // Start polling immediately — no initial delay needed since we use timestamps
  check();
});
"
