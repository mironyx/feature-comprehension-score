import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.test.local for integration tests (local Supabase dev keys)
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
