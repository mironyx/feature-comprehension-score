import { NextRequest, NextResponse } from 'next/server';
import { createMiddlewareSupabaseClient } from '@/lib/supabase/middleware';

const PUBLIC_PATHS = [
  '/auth/sign-in',
  '/auth/callback',
  '/api/webhooks/',
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(
  request: NextRequest,
): Promise<NextResponse> {
  const { pathname } = new URL(request.url);

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request });
  }

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

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|auth/|api/webhooks/).*)',
  ],
};
