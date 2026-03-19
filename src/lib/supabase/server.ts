import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from './types';

const supabaseUrl =
  process.env['NEXT_PUBLIC_SUPABASE_URL'] ??
  (() => {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL');
  })();

const supabaseAnonKey =
  process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ??
  (() => {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY');
  })();

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      },
    },
  });
}
