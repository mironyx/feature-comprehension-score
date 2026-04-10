-- Issue: #179 — Sign-in cutover to installation-token org membership
-- Design: docs/design/lld-onboarding-auth-cutover.md §3.1, ADR-0020
--
-- Drops user_github_tokens table, store/get_github_token RPCs, and
-- associated Vault secrets. Adds installer_github_user_id column to
-- organisations for first-install-race mitigation.

-- Clean up Vault secrets before dropping the table (vault.secrets has
-- no FK back to user_github_tokens — CASCADE does not help).
DELETE FROM vault.secrets
WHERE id IN (SELECT token_secret_id FROM user_github_tokens);

drop policy "tokens_insert_own" on "public"."user_github_tokens";

drop policy "tokens_select_own" on "public"."user_github_tokens";

drop policy "tokens_update_own" on "public"."user_github_tokens";

revoke delete on table "public"."user_github_tokens" from "anon";

revoke insert on table "public"."user_github_tokens" from "anon";

revoke references on table "public"."user_github_tokens" from "anon";

revoke select on table "public"."user_github_tokens" from "anon";

revoke trigger on table "public"."user_github_tokens" from "anon";

revoke truncate on table "public"."user_github_tokens" from "anon";

revoke update on table "public"."user_github_tokens" from "anon";

revoke delete on table "public"."user_github_tokens" from "authenticated";

revoke insert on table "public"."user_github_tokens" from "authenticated";

revoke references on table "public"."user_github_tokens" from "authenticated";

revoke select on table "public"."user_github_tokens" from "authenticated";

revoke trigger on table "public"."user_github_tokens" from "authenticated";

revoke truncate on table "public"."user_github_tokens" from "authenticated";

revoke update on table "public"."user_github_tokens" from "authenticated";

revoke delete on table "public"."user_github_tokens" from "service_role";

revoke insert on table "public"."user_github_tokens" from "service_role";

revoke references on table "public"."user_github_tokens" from "service_role";

revoke select on table "public"."user_github_tokens" from "service_role";

revoke trigger on table "public"."user_github_tokens" from "service_role";

revoke truncate on table "public"."user_github_tokens" from "service_role";

revoke update on table "public"."user_github_tokens" from "service_role";

alter table "public"."user_github_tokens" drop constraint "user_github_tokens_user_id_fkey";

alter table "public"."user_github_tokens" drop constraint "user_github_tokens_user_id_key";

drop function if exists "public"."get_github_token"(p_user_id uuid) CASCADE;

drop function if exists "public"."store_github_token"(p_user_id uuid, p_token text) CASCADE;

alter table "public"."user_github_tokens" drop constraint "user_github_tokens_pkey";

drop index if exists "public"."user_github_tokens_pkey";

drop index if exists "public"."user_github_tokens_user_id_key";

drop table "public"."user_github_tokens";

alter table "public"."organisations" add column "installer_github_user_id" bigint;


