-- Migration: RLS policies
-- Enables Row Level Security and creates all access policies for every table.
-- Policy naming convention: {table}_{operation}_{who}
-- Design reference: v1-design.md section 4.3
--
-- The webhook handler uses the Supabase service role (bypasses RLS).
-- User-initiated operations use the Supabase client with the user's JWT (RLS enforced).

-- organisations: members can read their own orgs.
-- INSERT/UPDATE/DELETE managed by the webhook handler (service role) only.
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY organisations_select_member ON organisations
  FOR SELECT USING (id IN (SELECT get_user_org_ids()));

-- org_config: members can read; only org admins can update.
ALTER TABLE org_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_config_select_member ON org_config
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY org_config_update_admin ON org_config
  FOR UPDATE USING (is_org_admin(org_id));

-- repositories: members can read.
ALTER TABLE repositories ENABLE ROW LEVEL SECURITY;

CREATE POLICY repositories_select_member ON repositories
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));

-- repository_config: members can read; only org admins can insert or update.
ALTER TABLE repository_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY repo_config_select_member ON repository_config
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));

CREATE POLICY repo_config_insert_admin ON repository_config
  FOR INSERT WITH CHECK (is_org_admin(org_id));

CREATE POLICY repo_config_update_admin ON repository_config
  FOR UPDATE USING (is_org_admin(org_id));

-- user_organisations: users can only see their own org memberships.
-- INSERT/UPDATE managed by the auth callback (service role).
ALTER TABLE user_organisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_orgs_select_own ON user_organisations
  FOR SELECT USING (user_id = auth.uid());

-- user_github_tokens: users can only access their own token record.
ALTER TABLE user_github_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY tokens_select_own ON user_github_tokens
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY tokens_insert_own ON user_github_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY tokens_update_own ON user_github_tokens
  FOR UPDATE USING (user_id = auth.uid());

-- assessments: org admins see all; participants see only their own assessments.
-- UPDATE restricted to org admins (skip and close operations).
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY assessments_select_admin ON assessments
  FOR SELECT USING (is_org_admin(org_id));

CREATE POLICY assessments_select_participant ON assessments
  FOR SELECT USING (is_assessment_participant(id));

CREATE POLICY assessments_update_admin ON assessments
  FOR UPDATE USING (is_org_admin(org_id));

-- assessment_questions: org admins see all; participants see questions on their assessments.
-- Note: reference answer column filtering is handled at the application layer, not RLS.
ALTER TABLE assessment_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY questions_select_admin ON assessment_questions
  FOR SELECT USING (is_org_admin(org_id));

CREATE POLICY questions_select_participant ON assessment_questions
  FOR SELECT USING (is_assessment_participant(assessment_id));

-- assessment_participants: org admins see all; users see only their own participant records.
ALTER TABLE assessment_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY participants_select_admin ON assessment_participants
  FOR SELECT USING (is_org_admin(org_id));

CREATE POLICY participants_select_own ON assessment_participants
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY participants_update_own ON assessment_participants
  FOR UPDATE USING (user_id = auth.uid());

-- participant_answers: participants can insert and view only their own answers.
-- Org admins can view all answers (for flagged assessment review, Story 2.5).
ALTER TABLE participant_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY answers_insert_own ON participant_answers
  FOR INSERT WITH CHECK (
    participant_id IN (
      SELECT id FROM assessment_participants
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY answers_select_own ON participant_answers
  FOR SELECT USING (
    participant_id IN (
      SELECT id FROM assessment_participants
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY answers_select_admin ON participant_answers
  FOR SELECT USING (is_org_admin(org_id));

-- fcs_merged_prs: any org member can read (needed for FCS creation UI).
ALTER TABLE fcs_merged_prs ENABLE ROW LEVEL SECURITY;

CREATE POLICY fcs_prs_select_member ON fcs_merged_prs
  FOR SELECT USING (org_id IN (SELECT get_user_org_ids()));

-- sync_debounce: no user-facing policies. Accessed exclusively via the webhook handler
-- (service role).
ALTER TABLE sync_debounce ENABLE ROW LEVEL SECURITY;
