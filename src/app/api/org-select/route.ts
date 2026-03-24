// API route — sets the selected org cookie and redirects to /assessments.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.3

import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/route-handler';
import { setSelectedOrgId } from '@/lib/supabase/org-context';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const orgId = searchParams.get('orgId');

  if (!orgId) {
    return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
  }

  const response = NextResponse.redirect(`${origin}/assessments`);
  const supabase = createRouteHandlerSupabaseClient(request, response);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  // Verify the user is actually a member of this org.
  const { data: membership } = await supabase
    .from('user_organisations')
    .select('org_id')
    .eq('user_id', user.id)
    .eq('org_id', orgId);

  if (!membership || membership.length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  setSelectedOrgId(response, orgId);
  return response;
}
