// Assessment answering page — displays questions for a participant to answer.
// Serves access-denied and already-submitted states inline.
// Design reference: docs/design/lld-phase-2-web-auth-db.md §2.5
// Issue: #61

import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createSecretSupabaseClient } from '@/lib/supabase/secret';
import type { Database } from '@/lib/supabase/types';
import AnsweringForm from './answering-form';
import { logger } from '@/lib/logger';

type AssessmentRow = Database['public']['Tables']['assessments']['Row'];
type QuestionRow = Database['public']['Tables']['assessment_questions']['Row'];

interface AssessmentWithRelations extends AssessmentRow {
  repositories: { github_repo_name: string };
  organisations: { github_org_name: string };
}

// ---------------------------------------------------------------------------
// Contract types
// ---------------------------------------------------------------------------

interface AssessmentPageProps {
  readonly params: Promise<{ id: string }>;
}

interface ParticipantRow {
  id: string;
  status: 'pending' | 'submitted';
  submitted_at: string | null;
}

type AnsweringQuestion = Pick<QuestionRow, 'id' | 'question_number' | 'naur_layer' | 'question_text'>;

// ---------------------------------------------------------------------------
// Sub-views
// ---------------------------------------------------------------------------

function AccessDeniedPage() {
  return (
    <main>
      <h1>Access Denied</h1>
      <p>You are not a participant on this assessment.</p>
      <Link href="/assessments">Back to assessments</Link>
    </main>
  );
}

function AlreadySubmittedPage({ assessmentId }: { readonly assessmentId: string }) {
  return (
    <main>
      <h1>Already Submitted</h1>
      <p>You have already submitted your answers for this assessment.</p>
      <Link href={`/assessments/${assessmentId}/submitted`}>View confirmation</Link>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchAssessment(
  adminSupabase: ReturnType<typeof createSecretSupabaseClient>,
  assessmentId: string,
): Promise<AssessmentWithRelations> {
  const { data, error } = await adminSupabase
    .from('assessments')
    .select('*, repositories!inner(github_repo_name), organisations!inner(github_org_name)')
    .eq('id', assessmentId)
    .single();

  if (error || !data) notFound();
  return data as unknown as AssessmentWithRelations;
}

async function fetchParticipant(
  adminSupabase: ReturnType<typeof createSecretSupabaseClient>,
  assessmentId: string,
  userId: string,
): Promise<ParticipantRow | null> {
  const { data } = await adminSupabase
    .from('assessment_participants')
    .select('id, status, submitted_at')
    .eq('assessment_id', assessmentId)
    .eq('user_id', userId)
    .maybeSingle();

  return data as ParticipantRow | null;
}

async function fetchQuestions(
  adminSupabase: ReturnType<typeof createSecretSupabaseClient>,
  assessmentId: string,
): Promise<AnsweringQuestion[]> {
  const { data } = await adminSupabase
    .from('assessment_questions')
    .select('id, question_number, naur_layer, question_text')
    .eq('assessment_id', assessmentId)
    .order('question_number', { ascending: true });

  return (data ?? []) as AnsweringQuestion[];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function AssessmentPage({ params }: AssessmentPageProps) {
  const { id: assessmentId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/sign-in');

  const adminSupabase = createSecretSupabaseClient();
  const githubUserIdRaw = user.user_metadata?.['provider_id'];
  const githubUserId = typeof githubUserIdRaw === 'string' ? parseInt(githubUserIdRaw, 10) : undefined;

  // link_participant runs concurrently with fetchAssessment — it has no dependency on
  // assessment data. fetchParticipant runs after because it queries by user_id which the
  // RPC may have just written.
  // Uses the user's client (not adminSupabase) so auth.uid() resolves inside the
  // SECURITY DEFINER function — see #133.
  const [, assessment] = await Promise.all([
    githubUserId
      ? supabase.rpc('link_participant', { p_assessment_id: assessmentId, p_github_user_id: githubUserId })
          .then(({ error }) => { if (error) logger.error({ err: error }, 'link_participant failed — participant linking is best-effort'); })
      : Promise.resolve(),
    fetchAssessment(adminSupabase, assessmentId),
  ]);

  const participant = await fetchParticipant(adminSupabase, assessmentId, user.id);

  if (!participant) return <AccessDeniedPage />;
  if (participant.status === 'submitted') return <AlreadySubmittedPage assessmentId={assessmentId} />;

  const questions = await fetchQuestions(adminSupabase, assessmentId);

  return (
    <AnsweringForm
      assessment={assessment}
      questions={questions}
    />
  );
}
