import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from './env';
import type { Database } from './types';

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
