-- Migration: update get_effective_config to include context_file_patterns
-- Replaces the function to add COALESCE for the new column.
-- Design reference: docs/design/lld-artefact-pipeline.md section 2.5
-- Issue: #45

DROP FUNCTION IF EXISTS get_effective_config(uuid);

CREATE FUNCTION get_effective_config(repo_id uuid)
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
