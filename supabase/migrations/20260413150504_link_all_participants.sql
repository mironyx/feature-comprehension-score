-- Bulk-link unlinked participants at login time.
-- Resolves chicken-and-egg: participants added by GitHub username can now
-- discover their assessments without needing a direct link first.
-- Issue: #206

CREATE OR REPLACE FUNCTION link_all_participants(
  p_user_id        uuid,
  p_github_user_id bigint
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE assessment_participants
  SET user_id = p_user_id, updated_at = now()
  WHERE github_user_id = p_github_user_id
    AND user_id IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
