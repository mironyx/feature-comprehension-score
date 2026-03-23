/**
 * Supabase local environment configuration for integration tests.
 * Run `npx supabase start`, then copy the keys it prints into `.env.test.local`:
 *
 *   SUPABASE_URL=http://127.0.0.1:54321
 *   SUPABASE_SECRET_KEY=<secret / service_role key from supabase start output>
 *   SUPABASE_PUBLISHABLE_KEY=<publishable / anon key from supabase start output>
 */
export const SUPABASE_LOCAL_URL = process.env['SUPABASE_URL'] ?? 'http://127.0.0.1:54321';

export const SUPABASE_LOCAL_SECRET_KEY = process.env['SUPABASE_SECRET_KEY'] ?? '';

export const SUPABASE_LOCAL_PUBLISHABLE_KEY = process.env['SUPABASE_PUBLISHABLE_KEY'] ?? '';
