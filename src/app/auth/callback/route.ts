import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';
import { syncOrgMembership } from '@/lib/supabase/org-sync';

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
    const secretClient = createSecretSupabaseClient();
    const { error: rpcError } = await secretClient.rpc('store_github_token', {
      p_user_id: user.id,
      p_token: provider_token,
    });
    if (rpcError) {
      console.error('Failed to store provider token:', rpcError);
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/auth/sign-in?error=token_storage_failed`);
    }

    // Sync org memberships — step 5 deferred from §2.2, now implemented in §2.3.
    // syncOrgMembership is no-throw: all GitHub/DB errors are handled internally.
    await syncOrgMembership(secretClient, user.id, provider_token);
  } else {
    console.warn('No provider_token in session for user:', user.id);
  }

  return response;
}
