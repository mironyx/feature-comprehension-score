alter table "public"."org_config" drop constraint "org_config_fcs_question_count_check";

alter table "public"."org_config" drop constraint "org_config_prcc_question_count_check";

alter table "public"."repository_config" drop constraint "repository_config_fcs_question_count_check";

alter table "public"."repository_config" drop constraint "repository_config_prcc_question_count_check";

alter table "public"."org_config" add constraint "org_config_fcs_question_count_check" CHECK (((fcs_question_count >= 3) AND (fcs_question_count <= 8))) not valid;

alter table "public"."org_config" validate constraint "org_config_fcs_question_count_check";

alter table "public"."org_config" add constraint "org_config_prcc_question_count_check" CHECK (((prcc_question_count >= 3) AND (prcc_question_count <= 8))) not valid;

alter table "public"."org_config" validate constraint "org_config_prcc_question_count_check";

alter table "public"."repository_config" add constraint "repository_config_fcs_question_count_check" CHECK (((fcs_question_count >= 3) AND (fcs_question_count <= 8))) not valid;

alter table "public"."repository_config" validate constraint "repository_config_fcs_question_count_check";

alter table "public"."repository_config" add constraint "repository_config_prcc_question_count_check" CHECK (((prcc_question_count >= 3) AND (prcc_question_count <= 8))) not valid;

alter table "public"."repository_config" validate constraint "repository_config_prcc_question_count_check";


