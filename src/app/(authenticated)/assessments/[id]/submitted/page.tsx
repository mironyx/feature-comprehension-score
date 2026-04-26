// Assessment submitted confirmation page — shown after a participant submits answers.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.5
// Issue: #61

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

interface SubmittedPageProps {
  readonly params: Promise<{ id: string }>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SubmittedPage({ params }: SubmittedPageProps) {
  const { id: assessmentId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const adminSupabase = createSecretSupabaseClient();

  const [assessmentResult, participantsResult] = await Promise.all([
    adminSupabase
      .from('assessments')
      .select('feature_name')
      .eq('id', assessmentId)
      .single(),
    adminSupabase
      .from('assessment_participants')
      .select('id, status, user_id')
      .eq('assessment_id', assessmentId),
  ]);

  if (assessmentResult.error || !assessmentResult.data) notFound();

  const assessment = assessmentResult.data as { feature_name: string | null };
  const participants = (participantsResult.data ?? []) as { id: string; status: string; user_id: string }[];
  if (!participants.some(p => p.user_id === user.id)) notFound();
  const total = participants.length;
  const completed = participants.filter(p => p.status === 'submitted').length;

  return (
    <div className="space-y-section-gap text-center">
      <h1 className="text-heading-xl font-display text-success">Answers Submitted</h1>
      <p className="text-body text-text-primary">Thank you. Your answers have been recorded.</p>
      {assessment.feature_name && <p className="text-body text-text-secondary">Feature: {assessment.feature_name}</p>}
      <p className="text-body text-text-secondary">
        Participation: {completed} of {total} complete
      </p>
      <Link href="/assessments" className="text-body text-accent hover:text-accent-hover">Back to my assessments</Link>
    </div>
  );
}
