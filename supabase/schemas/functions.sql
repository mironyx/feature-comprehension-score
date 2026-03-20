-- Declarative schema: functions
-- Consolidated from migrations: functions, get_effective_config_context_patterns.
-- Design reference: docs/design/lld-phase-2-web-auth-db.md §2.1 Declarative schema adoption
-- Issue: #65

-- pgsodium key for GitHub OAuth token encryption (ADR-0003).
-- The key material is managed internally by pgsodium and never leaves the database.
-- Guard: pgsodium schema may not be present in all local dev environments.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pgsodium'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'pgsodium' AND table_name = 'key'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pgsodium.key WHERE name = 'github_token_key'
    ) THEN
      PERFORM pgsodium.create_key(
        name     := 'github_token_key',
        key_type := 'aead-det'
      );
    END IF;
  END IF;
END;
$$;

-- get_user_org_ids: returns all org IDs the current user belongs to.
-- SECURITY DEFINER avoids circular RLS dependency on user_organisations.
CREATE OR REPLACE FUNCTION get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT org_id
  FROM user_organisations
  WHERE user_id = auth.uid()
$$;

-- is_org_admin: checks whether the current user is an admin/owner of a given org.
CREATE OR REPLACE FUNCTION is_org_admin(check_org_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_organisations
    WHERE user_id = auth.uid()
      AND org_id = check_org_id
      AND github_role IN ('admin', 'owner')
  )
$$;

-- is_assessment_participant: checks whether the current user is an active participant
-- on a given assessment.
CREATE OR REPLACE FUNCTION is_assessment_participant(check_assessment_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM assessment_participants
    WHERE assessment_id = check_assessment_id
      AND user_id = auth.uid()
      AND status != 'removed'
  )
$$;

-- link_participant: links a Supabase user to their assessment_participants record
-- when they first access an assessment. SECURITY DEFINER bypasses RLS because the
-- participant record has no user_id yet. Safe: only links auth.uid() to a record
-- matching the provided github_user_id — cannot impersonate another user.
CREATE OR REPLACE FUNCTION link_participant(
  p_assessment_id  uuid,
  p_github_user_id bigint
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p_id uuid;
BEGIN
  UPDATE assessment_participants
  SET user_id = auth.uid(), updated_at = now()
  WHERE assessment_id = p_assessment_id
    AND github_user_id = p_github_user_id
    AND user_id IS NULL
  RETURNING id INTO p_id;

  RETURN p_id;
END;
$$;

-- get_effective_config: resolves effective repository configuration by coalescing
-- per-repo overrides with org-level defaults (section 3.4).
-- Includes context_file_patterns (added in migration context_file_patterns, issue #45).
CREATE OR REPLACE FUNCTION get_effective_config(repo_id uuid)
RETURNS TABLE (
  prcc_enabled             boolean,
  fcs_enabled              boolean,
  enforcement_mode         text,
  score_threshold          integer,
  prcc_question_count      integer,
  fcs_question_count       integer,
  min_pr_size              integer,
  trivial_commit_threshold integer,
  exempt_file_patterns     text[],
  context_file_patterns    text[]
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(rc.prcc_enabled, oc.prcc_enabled),
    COALESCE(rc.fcs_enabled, oc.fcs_enabled),
    COALESCE(rc.enforcement_mode, oc.enforcement_mode),
    COALESCE(rc.score_threshold, oc.score_threshold),
    COALESCE(rc.prcc_question_count, oc.prcc_question_count),
    COALESCE(rc.fcs_question_count, oc.fcs_question_count),
    COALESCE(rc.min_pr_size, oc.min_pr_size),
    COALESCE(rc.trivial_commit_threshold, oc.trivial_commit_threshold),
    COALESCE(rc.exempt_file_patterns, oc.exempt_file_patterns),
    COALESCE(rc.context_file_patterns, oc.context_file_patterns)
  FROM repositories r
  JOIN org_config oc ON oc.org_id = r.org_id
  LEFT JOIN repository_config rc ON rc.repository_id = r.id
  WHERE r.id = repo_id
$$;
