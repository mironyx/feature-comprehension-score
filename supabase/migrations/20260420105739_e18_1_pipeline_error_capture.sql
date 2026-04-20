alter table "public"."assessments" add column "rubric_error_code" text;

alter table "public"."assessments" add column "rubric_error_message" text;

alter table "public"."assessments" add column "rubric_error_retryable" boolean;


