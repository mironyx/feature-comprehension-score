import { NextRequest, NextResponse } from 'next/server';
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware';

export async function middleware(
  request: NextRequest,
): Promise<NextResponse> {
  const response = NextResponse.next({ request });
  const { supabase } = createMiddlewareSupabaseClient(request, response);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  
  if (!user) {
    const signInUrl = new URL('/auth/sign-in', request.url);
    return NextResponse.redirect(signInUrl);
  }
  
  return response;
}

// Public routes (auth/, api/webhooks/, static assets) are excluded from this
// matcher and never reach the middleware function above.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/|api/webhooks/).*)',
  ],
};
