import { createServerClient } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import { supabaseUrl, supabasePublishableKey } from './env';
import type { Database } from './types';

export function createRouteHandlerSupabaseClient(
  request: NextRequest,
  response: NextResponse,
) {
  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
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
