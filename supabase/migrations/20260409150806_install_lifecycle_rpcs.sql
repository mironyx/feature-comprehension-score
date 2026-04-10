-- Install lifecycle RPCs.
-- Adds handle_installation_deleted: atomically deactivates org + deletes user_organisations rows.
-- Issue: #180
-- Design: docs/design/lld-onboarding-auth-webhooks.md §3.1

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_installation_deleted(p_installation_id bigint)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_now    timestamptz := now();
BEGIN
  SELECT id INTO v_org_id
  FROM organisations
  WHERE installation_id = p_installation_id;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE organisations
    SET status = 'inactive', updated_at = v_now
    WHERE id = v_org_id;

  DELETE FROM user_organisations
    WHERE org_id = v_org_id;
END;
$function$
;


