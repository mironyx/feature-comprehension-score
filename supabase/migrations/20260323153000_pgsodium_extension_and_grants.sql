-- Issue: #82 — fix: OAuth smoke test findings — pgsodium setup
-- Found during smoke test (#80): pgsodium was not enabled on the cloud project,
-- and postgres role lacked execute permission on pgsodium crypto functions,
-- causing store_github_token to fail with permission denied.
-- Note: db diff does not capture CREATE EXTENSION or GRANT — authored manually.

-- Enable pgsodium extension (idempotent).
CREATE EXTENSION IF NOT EXISTS pgsodium WITH SCHEMA pgsodium;

-- NOTE: GRANT EXECUTE on pgsodium.crypto_aead_det_encrypt to postgres is NOT
-- possible via SQL on Supabase cloud — the function is owned by the system
-- superuser and postgres lacks grant option. This means store_github_token
-- (SECURITY DEFINER, runs as postgres) cannot call crypto_aead_det_encrypt.
-- Known limitation: token storage non-functional on cloud until resolved.
-- Options under investigation: Supabase Vault, ownership transfer via support.
-- Tracked in issue #82.

-- Create github_token_key if not already present (idempotent).
-- The earlier migration (20260309000003) skipped this when pgsodium was absent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pgsodium.key WHERE name = 'github_token_key'
  ) THEN
    PERFORM pgsodium.create_key(
      name     := 'github_token_key',
      key_type := 'aead-det'
    );
  END IF;
END;
$$;
