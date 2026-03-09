/**
 * Supabase local environment configuration for integration tests.
 * Values match the Supabase CLI local dev defaults.
 * Run `npx supabase start` to get the actual keys for your instance,
 * then set them via environment variables or .env.test.local.
 */
export const SUPABASE_LOCAL_URL = process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321';

// Default local dev keys from `supabase start` output.
// Override via SUPABASE_SERVICE_ROLE_KEY env var in CI.
export const SUPABASE_LOCAL_SERVICE_ROLE_KEY =
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

export const SUPABASE_LOCAL_ANON_KEY =
  process.env['SUPABASE_ANON_KEY'] ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
