import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
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

export function createRouteHandlerSupabaseClient(
  request: NextRequest,
  response: NextResponse,
) {
  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });
}
