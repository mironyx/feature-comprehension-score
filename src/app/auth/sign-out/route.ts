import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const response = NextResponse.redirect(
    new URL('/auth/sign-in', request.url),
  );
  const supabase = createRouteHandlerSupabaseClient(request, response);
  const { error } = await supabase.auth.signOut();
  if (error) {
    // Log but still redirect — cookie is cleared on the response regardless.
    console.error('sign-out failed', error);
  }
  return response;
}
