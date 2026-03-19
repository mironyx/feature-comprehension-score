import { createServerClient } from '@supabase/ssr';
import { supabaseUrl } from './env';
import type { Database } from './types';

const serviceRoleKey =
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ??
  (() => {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  })();

export function createServiceRoleSupabaseClient() {
  return createServerClient<Database>(supabaseUrl, serviceRoleKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // Service role client does not manage cookies
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
