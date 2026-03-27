import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.test.local first so integration tests get real local Supabase keys.
// Must happen before the fallback assignments below.
try {
  const envFile = readFileSync(resolve(__dirname, '../.env.test.local'), 'utf-8');
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  }
} catch {
  // .env.test.local is optional; integration tests will use defaults from supabase-env.ts
}

// Fallback values for unit tests that import server-side clients without a real Supabase instance.
process.env['NEXT_PUBLIC_SUPABASE_URL'] ??= 'http://localhost:54321';
process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] ??= 'test-publishable-key';
process.env['SUPABASE_SECRET_KEY'] ??= 'test-secret-key';
process.env['GITHUB_WEBHOOK_SECRET'] ??= 'test-webhook-secret';
