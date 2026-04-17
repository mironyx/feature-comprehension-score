alter table "public"."org_config" add column "artefact_quality_threshold" numeric(3,2) not null default 0.40;

alter table "public"."org_config" add column "fcs_low_threshold" integer not null default 60;

alter table "public"."org_config" add constraint "org_config_artefact_quality_threshold_check" CHECK (((artefact_quality_threshold >= 0.0) AND (artefact_quality_threshold <= 1.0))) not valid;

alter table "public"."org_config" validate constraint "org_config_artefact_quality_threshold_check";

alter table "public"."org_config" add constraint "org_config_fcs_low_threshold_check" CHECK (((fcs_low_threshold >= 0) AND (fcs_low_threshold <= 100))) not valid;

alter table "public"."org_config" validate constraint "org_config_fcs_low_threshold_check";


