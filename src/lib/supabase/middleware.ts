import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
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

export function createMiddlewareSupabaseClient(
  request: NextRequest,
  response: NextResponse,
): { supabase: SupabaseClient<Database>; response: NextResponse } {
  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  return { supabase, response };
}
