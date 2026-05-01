set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.patch_project(p_project_id uuid, p_org_ids uuid[], p_project_fields jsonb, p_context_fields jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id uuid;
  v_row    projects%ROWTYPE;
BEGIN
  SELECT org_id INTO v_org_id
  FROM projects
  WHERE id = p_project_id AND org_id = ANY(p_org_ids);

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'project_not_found';
  END IF;

  IF p_project_fields IS NOT NULL AND p_project_fields != '{}'::jsonb THEN
    UPDATE projects
    SET
      name        = COALESCE(p_project_fields->>'name', name),
      description = COALESCE(p_project_fields->>'description', description),
      updated_at  = now()
    WHERE id = p_project_id
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM projects WHERE id = p_project_id;
  END IF;

  IF p_context_fields IS NOT NULL AND p_context_fields != '{}'::jsonb THEN
    INSERT INTO organisation_contexts (org_id, project_id, context)
    VALUES (v_org_id, p_project_id, p_context_fields)
    ON CONFLICT (org_id, project_id) DO UPDATE
      SET context    = organisation_contexts.context || EXCLUDED.context,
          updated_at = now();
  END IF;

  RETURN to_jsonb(v_row);
END;
$function$
;


