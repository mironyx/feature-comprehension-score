import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import { supabaseUrl, supabasePublishableKey } from './env';
import type { Database } from './types';

export function createMiddlewareSupabaseClient(
  request: NextRequest,
  response: NextResponse,
) {
  const supabase = createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
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
