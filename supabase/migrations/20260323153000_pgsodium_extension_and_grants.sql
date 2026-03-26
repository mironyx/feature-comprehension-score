-- Issue: #82 — fix: OAuth smoke test findings — pgsodium setup
-- Found during smoke test (#80): pgsodium was not enabled on the cloud project,
-- and postgres role lacked execute permission on pgsodium crypto functions,
-- causing store_github_token to fail with permission denied.
-- Note: db diff does not capture CREATE EXTENSION or GRANT — authored manually.
--
-- Superseded by issue #84 (vault_token_migration): token storage migrated to
-- Supabase Vault. pgsodium is no longer required. Both statements below are
-- wrapped in exception handlers so db reset succeeds whether or not pgsodium
-- is available in the local Postgres instance.

-- Enable pgsodium extension if available (no-op if not installed).
-- Schema must exist before CREATE EXTENSION on local Docker images that do not pre-create it.
DO $$
BEGIN
  CREATE SCHEMA IF NOT EXISTS pgsodium;
  CREATE EXTENSION IF NOT EXISTS pgsodium WITH SCHEMA pgsodium;
EXCEPTION WHEN OTHERS THEN
  -- pgsodium not available in this Postgres installation — skip.
  NULL;
END;
$$;

-- NOTE: GRANT EXECUTE on pgsodium.crypto_aead_det_encrypt to postgres is NOT
-- possible via SQL on Supabase cloud — the function is owned by the system
-- superuser and postgres lacks grant option. This means store_github_token
-- (SECURITY DEFINER, runs as postgres) cannot call crypto_aead_det_encrypt.
-- Resolved in issue #84 by migrating to Supabase Vault.

-- Create github_token_key if not already present (idempotent, no-op if pgsodium absent).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'pgsodium'
  ) AND NOT EXISTS (
    SELECT 1 FROM pgsodium.key WHERE name = 'github_token_key'
  ) THEN
    PERFORM pgsodium.create_key(
      name     := 'github_token_key',
      key_type := 'aead-det'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- pgsodium not available — skip.
  NULL;
END;
$$;
