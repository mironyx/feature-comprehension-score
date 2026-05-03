// Project settings page — server component.
// Loads project + organisation_contexts row keyed by (org_id, project_id);
// renders SettingsForm. Org Member reaching this URL directly redirects to
// /assessments — settings is admin-only and the project page has no UI link
// to it, so /projects/[id] would be a no-op redirect loop. Unknown project
// returns 404.
// Design reference: docs/design/lld-v11-e11-3-project-context-config.md §B.1
// Issue: #421

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrgRole } from '@/lib/supabase/membership';
import { SetBreadcrumbs } from '@/components/set-breadcrumbs';
import { SettingsForm, type SettingsInitial } from './settings-form';

const DEFAULT_QUESTION_COUNT = 4;

interface ProjectSettingsPageProps {
  readonly params: Promise<{ id: string }>;
}

interface ProjectRow {
  id: string;
  org_id: string;
  name: string;
}

interface ContextRow {
  context: Record<string, unknown> | null;
}

function buildInitial(context: Record<string, unknown> | null): SettingsInitial {
  const ctx = context ?? {};
  return {
    glob_patterns: Array.isArray(ctx.glob_patterns)
      ? (ctx.glob_patterns as string[])
      : [],
    domain_notes: typeof ctx.domain_notes === 'string' ? ctx.domain_notes : '',
    question_count:
      typeof ctx.question_count === 'number' ? ctx.question_count : DEFAULT_QUESTION_COUNT,
  };
}

export default async function ProjectSettingsPage({ params }: ProjectSettingsPageProps) {
  const { id: projectId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: project } = await supabase
    .from('projects')
    .select('id, org_id, name')
    .eq('id', projectId)
    .maybeSingle<ProjectRow>();
  if (!project) notFound();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const role = await getOrgRole(supabase, user.id, project.org_id);
  if (role === null) redirect('/assessments');

  const { data: ctxRow } = await supabase
    .from('organisation_contexts')
    .select('context')
    .eq('org_id', project.org_id)
    .eq('project_id', projectId)
    .maybeSingle<ContextRow>();

  const initial = buildInitial(ctxRow?.context ?? null);

  return (
    <>
      <SetBreadcrumbs
        segments={[
          { label: 'Projects', href: '/projects' },
          { label: project.name, href: `/projects/${projectId}` },
          { label: 'Settings' },
        ]}
      />
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex items-center gap-1.5 rounded-sm text-label font-medium border border-border h-9 px-3.5 text-text-primary hover:bg-surface-raised mb-section-gap"
        aria-label={`Back to ${project.name}`}
      >
        <ArrowLeft size={16} aria-hidden />
        Back to {project.name}
      </Link>
      <SettingsForm projectId={projectId} projectName={project.name} initial={initial} />
    </>
  );
}
