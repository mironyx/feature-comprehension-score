import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from './env';
import type { Database } from './types';

const secretKey =
  process.env['SUPABASE_SECRET_KEY'] ??
  (() => {
    throw new Error('Missing SUPABASE_SECRET_KEY');
  })();

export function createSecretSupabaseClient() {
  return createClient<Database>(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
