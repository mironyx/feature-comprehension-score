-- Fix participant discovery before link_participant fires.
-- Allows unlinked participants (user_id IS NULL) to see their assessments
-- by matching github_user_id via user_organisations.
-- Issue: #206

-- 1. Replace is_assessment_participant to also match by github_user_id
CREATE OR REPLACE FUNCTION is_assessment_participant(check_assessment_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM assessment_participants ap
    WHERE ap.assessment_id = check_assessment_id
      AND ap.status != 'removed'
      AND (
        ap.user_id = auth.uid()
        OR (
          ap.user_id IS NULL
          AND ap.github_user_id IN (
            SELECT uo.github_user_id
            FROM user_organisations uo
            WHERE uo.user_id = auth.uid()
          )
        )
      )
  )
$$;

-- 2. Replace participants_select_own policy to also match by github_user_id
DROP POLICY IF EXISTS participants_select_own ON assessment_participants;

CREATE POLICY participants_select_own ON assessment_participants
  FOR SELECT USING (
    user_id = auth.uid()
    OR (
      user_id IS NULL
      AND github_user_id IN (
        SELECT uo.github_user_id
        FROM user_organisations uo
        WHERE uo.user_id = auth.uid()
      )
    )
  );
