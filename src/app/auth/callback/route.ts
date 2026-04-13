import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';
import { resolveUserOrgsViaApp } from '@/lib/supabase/org-membership';
import { emitSigninEvent } from '@/lib/observability/signin-events';
import { logger } from '@/lib/logger';

function redirectSignIn(origin: string, error: string): NextResponse {
  return NextResponse.redirect(`${origin}/auth/sign-in?error=${error}`);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  if (!code) return redirectSignIn(origin, 'missing_code');

  const response = NextResponse.redirect(`${origin}/assessments`);
  const supabase = createRouteHandlerSupabaseClient(request, response);

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return redirectSignIn(origin, 'auth_failed');

  const { user } = data.session;
  const githubUserId = Number(user.user_metadata['provider_id']);
  const githubLogin = String(user.user_metadata['user_name'] ?? '');
  if (!Number.isFinite(githubUserId) || githubUserId === 0 || !githubLogin) {
    return redirectSignIn(origin, 'auth_failed');
  }

  try {
    const secretClient = createSecretSupabaseClient();
    const matched = await resolveUserOrgsViaApp(
      secretClient,
      { userId: user.id, githubUserId, githubLogin },
      {},
    );
    // Bulk-link any assessment_participants rows added by GitHub username
    // before this user ever logged in. Best-effort — must not block login.
    // Resolves #206.
    const { error: linkError } = await secretClient.rpc('link_all_participants', {
      p_user_id: user.id,
      p_github_user_id: githubUserId,
    });
    if (linkError) logger.warn({ err: linkError, userId: user.id }, 'link_all_participants failed');
    emitSigninEvent(matched.length > 0 ? 'success' : 'no_access', {
      user_id: user.id,
      github_user_id: githubUserId,
      matched_org_count: matched.length,
    });
    return response;
  } catch (err) {
    logger.error({ err, userId: user.id }, 'resolveUserOrgsViaApp failed');
    emitSigninEvent('error', {
      user_id: user.id,
      github_user_id: githubUserId,
      matched_org_count: 0,
    });
    return redirectSignIn(origin, 'auth_failed');
  }
}
