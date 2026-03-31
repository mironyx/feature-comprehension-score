/**
 * E2E database seeding helpers — seed test data via the Supabase admin client.
 * Uses the service-role client to bypass RLS.
 *
 * These helpers are standalone (no @/ imports) so Playwright can resolve them.
 * Issue: #138
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Organisation + config
// ---------------------------------------------------------------------------

export async function seedOrg(
  client: SupabaseClient,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const row = {
    github_org_id: Math.floor(Math.random() * 1_000_000) + 100_000,
    github_org_name: `e2e-org-${Date.now()}`,
    installation_id: Math.floor(Math.random() * 1_000_000) + 100_000,
    status: 'active',
    ...overrides,
  };
  const { data, error } = await client
    .from('organisations')
    .insert(row)
    .select('id')
    .single();
  if (error || !data) throw new Error(`seedOrg: ${error?.message}`);

  const { error: configErr } = await client.from('org_config').insert({
    org_id: data.id,
    prcc_enabled: true,
    fcs_enabled: true,
    enforcement_mode: 'soft',
    score_threshold: 70,
    prcc_question_count: 3,
    fcs_question_count: 3,
    min_pr_size: 20,
    trivial_commit_threshold: 5,
    exempt_file_patterns: [],
  });
  if (configErr) throw new Error(`seedOrg config: ${configErr.message}`);

  return data.id;
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export async function seedRepo(
  client: SupabaseClient,
  orgId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const row = {
    org_id: orgId,
    github_repo_id: Math.floor(Math.random() * 1_000_000) + 100_000,
    github_repo_name: `e2e-repo-${Date.now()}`,
    status: 'active',
    ...overrides,
  };
  const { data, error } = await client
    .from('repositories')
    .insert(row)
    .select('id')
    .single();
  if (error || !data) throw new Error(`seedRepo: ${error?.message}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// User-org membership
// ---------------------------------------------------------------------------

export async function seedUserOrg(
  client: SupabaseClient,
  userId: string,
  orgId: string,
  role: 'admin' | 'member' = 'admin',
): Promise<void> {
  const { error } = await client.from('user_organisations').insert({
    user_id: userId,
    org_id: orgId,
    github_user_id: Math.floor(Math.random() * 1_000_000) + 100_000,
    github_username: `e2e-user-${Date.now()}`,
    github_role: role,
  });
  if (error) throw new Error(`seedUserOrg: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Assessment (FCS type, awaiting_responses)
// ---------------------------------------------------------------------------

export async function seedAssessment(
  client: SupabaseClient,
  orgId: string,
  repoId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const row = {
    org_id: orgId,
    repository_id: repoId,
    type: 'fcs',
    status: 'awaiting_responses',
    feature_name: 'E2E Test Feature',
    config_enforcement_mode: 'soft',
    config_score_threshold: 70,
    config_question_count: 3,
    config_min_pr_size: 20,
    ...overrides,
  };
  const { data, error } = await client
    .from('assessments')
    .insert(row)
    .select('id')
    .single();
  if (error || !data) throw new Error(`seedAssessment: ${error?.message}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

interface QuestionSeed {
  questionNumber: number;
  naurLayer: 'world_to_program' | 'design_justification' | 'modification_capacity';
  questionText: string;
  referenceAnswer: string;
  weight: number;
}

const DEFAULT_QUESTIONS: QuestionSeed[] = [
  {
    questionNumber: 1,
    naurLayer: 'world_to_program',
    questionText: 'How does this feature map real-world domain concepts to code structures?',
    referenceAnswer: 'The payment entity maps to the PaymentProcessor class.',
    weight: 3,
  },
  {
    questionNumber: 2,
    naurLayer: 'design_justification',
    questionText: 'Why was the observer pattern chosen for event handling?',
    referenceAnswer: 'To decouple event producers from consumers.',
    weight: 2,
  },
  {
    questionNumber: 3,
    naurLayer: 'modification_capacity',
    questionText: 'What would need to change to support a new payment provider?',
    referenceAnswer: 'Add a new adapter implementing the PaymentGateway interface.',
    weight: 1,
  },
];

export async function seedQuestions(
  client: SupabaseClient,
  orgId: string,
  assessmentId: string,
  questions: QuestionSeed[] = DEFAULT_QUESTIONS,
): Promise<string[]> {
  const rows = questions.map((q) => ({
    org_id: orgId,
    assessment_id: assessmentId,
    question_number: q.questionNumber,
    naur_layer: q.naurLayer,
    question_text: q.questionText,
    reference_answer: q.referenceAnswer,
    weight: q.weight,
  }));

  const { data, error } = await client
    .from('assessment_questions')
    .insert(rows)
    .select('id, question_number')
    .order('question_number', { ascending: true });

  if (error || !data) throw new Error(`seedQuestions: ${error?.message}`);
  return data.map((r: { id: string }) => r.id);
}

// ---------------------------------------------------------------------------
// Participant
// ---------------------------------------------------------------------------

export async function seedParticipant(
  client: SupabaseClient,
  orgId: string,
  assessmentId: string,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const row = {
    org_id: orgId,
    assessment_id: assessmentId,
    user_id: userId,
    github_user_id: Math.floor(Math.random() * 1_000_000) + 100_000,
    github_username: `e2e-participant-${Date.now()}`,
    contextual_role: 'author',
    status: 'pending',
    ...overrides,
  };
  const { data, error } = await client
    .from('assessment_participants')
    .insert(row)
    .select('id')
    .single();
  if (error || !data) throw new Error(`seedParticipant: ${error?.message}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Scoring — update assessment and questions with scores
// ---------------------------------------------------------------------------

export async function seedScores(
  client: SupabaseClient,
  assessmentId: string,
  aggregateScore: number,
  questionScores: { questionId: string; score: number }[],
): Promise<void> {
  const { error: assessmentErr } = await client
    .from('assessments')
    .update({ aggregate_score: aggregateScore, scoring_incomplete: false })
    .eq('id', assessmentId);
  if (assessmentErr) throw new Error(`seedScores assessment: ${assessmentErr.message}`);

  for (const qs of questionScores) {
    const { error } = await client
      .from('assessment_questions')
      .update({ aggregate_score: qs.score })
      .eq('id', qs.questionId);
    if (error) throw new Error(`seedScores question: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Mark participant as submitted
// ---------------------------------------------------------------------------

export async function markParticipantSubmitted(
  client: SupabaseClient,
  participantId: string,
): Promise<void> {
  const { error } = await client
    .from('assessment_participants')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .eq('id', participantId);
  if (error) throw new Error(`markParticipantSubmitted: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export async function cleanupOrg(
  client: SupabaseClient,
  orgId: string,
): Promise<void> {
  await client.from('organisations').delete().eq('id', orgId);
}
