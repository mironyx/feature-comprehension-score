import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/types';

type OrgRow = Database['public']['Tables']['organisations']['Insert'];
type OrgConfigRow = Database['public']['Tables']['org_config']['Insert'];
type RepoRow = Database['public']['Tables']['repositories']['Insert'];
type RepoCfgRow = Database['public']['Tables']['repository_config']['Insert'];
type UserOrgRow = Database['public']['Tables']['user_organisations']['Insert'];
type AssessmentRow = Database['public']['Tables']['assessments']['Insert'];
type QuestionRow = Database['public']['Tables']['assessment_questions']['Insert'];
type ParticipantRow = Database['public']['Tables']['assessment_participants']['Insert'];

// ---------------------------------------------------------------------------
// Organisation
// ---------------------------------------------------------------------------

export async function createTestOrg(
  client: SupabaseClient<Database>,
  overrides: Partial<OrgRow> = {},
): Promise<string> {
  const row: OrgRow = {
    github_org_id: Math.floor(Math.random() * 1_000_000) + 100_000,
    github_org_name: `test-org-${crypto.randomUUID().slice(0, 8)}`,
    installation_id: Math.floor(Math.random() * 1_000_000) + 100_000,
    status: 'active',
    ...overrides,
  };

  const { data, error } = await client.from('organisations').insert(row).select('id').single();

  if (error || !data) throw new Error(`createTestOrg failed: ${error?.message}`);

  // Always create org_config alongside the org
  await createTestOrgConfig(client, { org_id: data.id });

  return data.id;
}

export async function createTestOrgConfig(
  client: SupabaseClient<Database>,
  overrides: Partial<OrgConfigRow> & { org_id: string },
): Promise<void> {
  const row: OrgConfigRow = {
    prcc_enabled: true,
    fcs_enabled: true,
    enforcement_mode: 'soft',
    score_threshold: 70,
    prcc_question_count: 3,
    fcs_question_count: 5,
    min_pr_size: 20,
    trivial_commit_threshold: 5,
    exempt_file_patterns: [],
    ...overrides,
  };

  const { error } = await client.from('org_config').insert(row);
  if (error) throw new Error(`createTestOrgConfig failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export async function createTestRepo(
  client: SupabaseClient<Database>,
  orgId: string,
  overrides: Partial<RepoRow> = {},
): Promise<string> {
  const row: RepoRow = {
    org_id: orgId,
    github_repo_id: Math.floor(Math.random() * 1_000_000) + 100_000,
    github_repo_name: `test-repo-${crypto.randomUUID().slice(0, 8)}`,
    status: 'active',
    ...overrides,
  };

  const { data, error } = await client.from('repositories').insert(row).select('id').single();

  if (error || !data) throw new Error(`createTestRepo failed: ${error?.message}`);
  return data.id;
}

export async function createTestRepoConfig(
  client: SupabaseClient<Database>,
  orgId: string,
  repositoryId: string,
  overrides: Partial<RepoCfgRow> = {},
): Promise<void> {
  const row: RepoCfgRow = {
    org_id: orgId,
    repository_id: repositoryId,
    ...overrides,
  };

  const { error } = await client.from('repository_config').insert(row);
  if (error) throw new Error(`createTestRepoConfig failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// User organisation membership
// ---------------------------------------------------------------------------

export async function createTestUserOrg(
  client: SupabaseClient<Database>,
  userId: string,
  orgId: string,
  overrides: Partial<UserOrgRow> = {},
): Promise<void> {
  const row: UserOrgRow = {
    user_id: userId,
    org_id: orgId,
    github_user_id: Math.floor(Math.random() * 1_000_000) + 100_000,
    github_username: `gh-user-${crypto.randomUUID().slice(0, 8)}`,
    github_role: 'member',
    ...overrides,
  };

  const { error } = await client.from('user_organisations').insert(row);
  if (error) throw new Error(`createTestUserOrg failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Assessment
// ---------------------------------------------------------------------------

export async function createTestAssessment(
  client: SupabaseClient<Database>,
  orgId: string,
  repositoryId: string,
  overrides: Partial<AssessmentRow> = {},
): Promise<string> {
  const row: AssessmentRow = {
    org_id: orgId,
    repository_id: repositoryId,
    type: 'prcc',
    status: 'awaiting_responses',
    config_enforcement_mode: 'soft',
    config_score_threshold: 70,
    config_question_count: 3,
    config_min_pr_size: 20,
    pr_number: Math.floor(Math.random() * 1000) + 1,
    pr_head_sha: crypto.randomUUID().replace(/-/g, ''),
    ...overrides,
  };

  const { data, error } = await client.from('assessments').insert(row).select('id').single();

  if (error || !data) throw new Error(`createTestAssessment failed: ${error?.message}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Assessment question
// ---------------------------------------------------------------------------

export async function createTestQuestion(
  client: SupabaseClient<Database>,
  orgId: string,
  assessmentId: string,
  overrides: Partial<QuestionRow> = {},
): Promise<string> {
  const row: QuestionRow = {
    org_id: orgId,
    assessment_id: assessmentId,
    question_number: 1,
    naur_layer: 'world_to_program',
    question_text: 'What does this code do?',
    weight: 2,
    reference_answer: 'It processes user input and stores it in the database.',
    ...overrides,
  };

  const { data, error } = await client
    .from('assessment_questions')
    .insert(row)
    .select('id')
    .single();

  if (error || !data) throw new Error(`createTestQuestion failed: ${error?.message}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Assessment participant
// ---------------------------------------------------------------------------

export async function createTestParticipant(
  client: SupabaseClient<Database>,
  orgId: string,
  assessmentId: string,
  overrides: Partial<ParticipantRow> = {},
): Promise<string> {
  const row: ParticipantRow = {
    org_id: orgId,
    assessment_id: assessmentId,
    github_user_id: Math.floor(Math.random() * 1_000_000) + 100_000,
    github_username: `gh-participant-${crypto.randomUUID().slice(0, 8)}`,
    contextual_role: 'author',
    status: 'pending',
    ...overrides,
  };

  const { data, error } = await client
    .from('assessment_participants')
    .insert(row)
    .select('id')
    .single();

  if (error || !data) throw new Error(`createTestParticipant failed: ${error?.message}`);
  return data.id;
}

// ---------------------------------------------------------------------------
// Cleanup helpers
// ---------------------------------------------------------------------------

/**
 * Deletes an organisation and all cascaded rows. Use in afterEach/afterAll.
 */
export async function deleteTestOrg(
  client: SupabaseClient<Database>,
  orgId: string,
): Promise<void> {
  const { error } = await client.from('organisations').delete().eq('id', orgId);
  if (error) throw new Error(`deleteTestOrg failed: ${error.message}`);
}
