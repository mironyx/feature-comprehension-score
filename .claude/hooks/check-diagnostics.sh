#!/bin/bash
# PostToolUse hook: reads VS Code extension diagnostics after Write/Edit operations.
# Uses Node.js for JSON parsing (jq not available on all systems).

set -euo pipefail

node -e "
let chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => {
  const input = JSON.parse(Buffer.concat(chunks).toString());
  const filePath = input.tool_input?.file_path || '';
  const cwd = input.cwd || '';

  if (!filePath || !cwd) process.exit(0);

  // Normalise paths (Windows backslashes to forward slashes)
  const normFile = filePath.replace(/\\\\/g, '/');
  const normCwd = cwd.replace(/\\\\/g, '/');

  // Get relative path
  let relPath = normFile;
  if (normFile.startsWith(normCwd + '/')) {
    relPath = normFile.slice(normCwd.length + 1);
  }

  // Only check source files
  if (!/\\.(tsx?|jsx?)$/.test(relPath)) process.exit(0);

  const fs = require('fs');
  const path = require('path');

  // Diagnostics file path
  const diagFile = path.join(cwd, '.diagnostics', relPath + '.json');

  // Wait for the extension to export diagnostics
  setTimeout(() => {
    if (!fs.existsSync(diagFile)) process.exit(0);

    try {
      const diag = JSON.parse(fs.readFileSync(diagFile, 'utf8'));
      if (!diag.diagnostics || diag.diagnostics.length === 0) process.exit(0);

      const lines = diag.diagnostics.map(d =>
        '  ' + d.severity + ' at line ' + d.line + ':' + d.column + ' [' + d.source + '/' + d.code + '] ' + d.message
      );
      const summary = 'VS Code diagnostics for ' + diag.file + ' (' + diag.diagnostics.length + ' issues):\\\n' + lines.join('\\\n');

      console.log(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext: summary
        }
      }));
    } catch (e) {
      process.exit(0);
    }
  }, 3000);
});
"
