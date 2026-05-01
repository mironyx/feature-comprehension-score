// Projects list page — server component.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.5
// Issue: #398

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getSelectedOrgId } from '@/lib/supabase/org-context';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import type { ProjectResponse } from '@/types/projects';

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ProjectsPage() {
  const cookieStore = await cookies();
  const orgId = getSelectedOrgId(cookieStore);
  if (!orgId) redirect('/org-select');

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const { data: row } = await supabase
    .from('user_organisations')
    .select('github_role, admin_repo_github_ids')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const isAdmin = row?.github_role === 'admin';
  const isRepoAdmin = ((row?.admin_repo_github_ids ?? []) as number[]).length > 0;
  if (!isAdmin && !isRepoAdmin) redirect('/assessments');

  const { data } = await supabase
    .from('projects')
    .select('id, org_id, name, description, created_at, updated_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  const projects = (data ?? []) as ProjectResponse[];

  return (
    <div className="space-y-section-gap">
      <PageHeader title="Projects" />
      {projects.length === 0 ? (
        <div className="space-y-3">
          <p className="text-body text-text-secondary">No projects yet.</p>
          <Link href="/projects/new" className="text-body text-accent hover:underline">
            Create project
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Card>
                <div>
                  <Link href={`/projects/${p.id}`} className="text-body text-text-primary hover:text-accent">
                    {p.name}
                  </Link>
                  {p.description ? (
                    <p className="text-caption text-text-secondary mt-0.5">{p.description}</p>
                  ) : null}
                  <p className="text-caption text-text-secondary mt-0.5">{p.created_at.slice(0, 10)}</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
