import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/sign-in?error=missing_code`);
  }

  const response = NextResponse.redirect(`${origin}/assessments`);
  const supabase = createRouteHandlerSupabaseClient(request, response);

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(`${origin}/auth/sign-in?error=auth_failed`);
  }

  const { user, provider_token } = data.session;

  if (provider_token) {
    const { error: rpcError } = await createSecretSupabaseClient().rpc('store_github_token', {
      p_user_id: user.id,
      p_token: provider_token,
    });
    if (rpcError) {
      console.error('Failed to store provider token:', rpcError);
    }
  } else {
    console.warn('No provider_token in session for user:', user.id);
  }

  return response;
}
