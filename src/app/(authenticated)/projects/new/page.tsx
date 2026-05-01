// Projects new page — server shell for CreateProjectForm client component.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.5
// Issue: #398

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { isAdminOrRepoAdmin } from '@/lib/supabase/membership';
import { PageHeader } from '@/components/ui/page-header';
import CreateProjectForm from './create-form';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function NewProjectPage() {
  const cookieStore = await cookies();
  const orgId = getSelectedOrgId(cookieStore);
  if (!orgId) redirect('/org-select');

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  if (!await isAdminOrRepoAdmin(supabase, user.id, orgId)) redirect('/assessments');

  return (
    <div className="space-y-section-gap">
      <PageHeader title="New Project" subtitle="Create a project for your team" />
      <CreateProjectForm orgId={orgId} />
    </div>
  );
}
