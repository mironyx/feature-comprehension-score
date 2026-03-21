import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.redirect(
    new URL('/auth/sign-in', request.url),
  );
  const supabase = createRouteHandlerSupabaseClient(request, response);
  await supabase.auth.signOut();
  return response;
}
