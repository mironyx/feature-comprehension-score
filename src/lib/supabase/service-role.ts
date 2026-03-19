import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './env';
import type { Database } from './types';

const serviceRoleKey =
  process.env['SUPABASE_SERVICE_ROLE_KEY'] ??
  (() => {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY');
  })();

export function createServiceRoleSupabaseClient() {
  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
