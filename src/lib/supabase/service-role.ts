import { createServerClient } from '@supabase/ssr';
import type { Database } from './types';

const supabaseUrl =
  process.env['NEXT_PUBLIC_SUPABASE_URL'] ??
  (() => {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  })();

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
