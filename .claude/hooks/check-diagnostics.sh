#!/bin/bash
# PostToolUse hook: feeds VS Code extension diagnostics back into Claude Code.
#
# How it works:
#   1. Claude Code triggers this hook after every Write/Edit tool call
#   2. Claude Code pipes a JSON payload to stdin with the edited file path and cwd
#   3. This script maps that file path to a .diagnostics/ JSON file
#      (written by the companion VS Code extension "diagnostics-exporter")
#   4. It polls for up to 5 seconds, giving the extension time to analyse and export
#   5. If diagnostics are found, it writes a JSON response to stdout using
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

  // --- Normalise paths (Windows backslashes to forward slashes) ---
  const normFile = filePath.replace(/\\\\/g, '/');
  const normCwd = cwd.replace(/\\\\/g, '/');

  // Derive relative path from project root
  let relPath = normFile;
  if (normFile.startsWith(normCwd + '/')) {
    relPath = normFile.slice(normCwd.length + 1);
  }

  // Only check TypeScript/JavaScript source files
  if (!/\\.(tsx?|jsx?)$/.test(relPath)) {
    log(cwd, 'Skipped non-source file: ' + relPath);
    process.exit(0);
  }

  // --- Map source file to its diagnostics export ---
  // e.g. src/lib/engine/scoring.ts -> .diagnostics/src/lib/engine/scoring.ts.json
  const diagFile = path.join(cwd, '.diagnostics', relPath + '.json');

  // --- Delete stale diagnostics so we only pick up fresh results ---
  // The extension will recreate the file once it re-analyses the source.
  // If the edit fixed the issue, the file stays gone — no stale false positives.
  try { fs.unlinkSync(diagFile); log(cwd, 'Deleted stale diagnostics: ' + relPath); } catch (_) {}

  // --- Poll for diagnostics (500ms intervals, up to 5s) ---
  // The VS Code extension needs time to analyse the file after it changes
  let attempts = 0;
  const maxAttempts = 10;
  const intervalMs = 500;

  function check() {
    attempts++;

    if (fs.existsSync(diagFile)) {
      try {
        const diag = JSON.parse(fs.readFileSync(diagFile, 'utf8'));

        if (diag.diagnostics && diag.diagnostics.length > 0) {
          // Format diagnostics as human-readable lines
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
        }
      } catch (e) {
        // File might be mid-write by the extension, retry on next tick
      }
    }

    if (attempts < maxAttempts) {
      setTimeout(check, intervalMs);
    } else {
      log(cwd, 'No diagnostics found after ' + maxAttempts + ' attempts for ' + relPath);
      process.exit(0);
    }
  }

  // Initial delay before first poll — give the extension a moment to react
  setTimeout(check, intervalMs);
});
"
