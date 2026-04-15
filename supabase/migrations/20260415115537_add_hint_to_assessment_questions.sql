alter table "public"."assessment_questions" add column "hint" text;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.finalise_rubric(p_assessment_id uuid, p_org_id uuid, p_questions jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO assessment_questions (
    org_id, assessment_id, question_number,
    naur_layer, question_text, weight, reference_answer, hint
  )
  SELECT p_org_id, p_assessment_id,
    (q->>'question_number')::integer, q->>'naur_layer',
    q->>'question_text', (q->>'weight')::integer, q->>'reference_answer',
    q->>'hint'
  FROM jsonb_array_elements(p_questions) AS q;

  UPDATE assessments
  SET status = 'awaiting_responses', updated_at = now()
  WHERE id = p_assessment_id;
END;
$function$
;


