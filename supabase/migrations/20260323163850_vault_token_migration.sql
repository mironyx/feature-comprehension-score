-- Issue: #84 — fix: migrate store_github_token to Supabase Vault
-- Design reference: docs/design/lld-phase-2-web-auth-db.md §2.2
-- Authored manually: supabase db diff cannot run because the shadow DB lacks the
-- pgsodium extension that earlier migrations reference.
--
-- What this migration does:
--   1. Drops store_github_token (pgsodium-based implementation).
--   2. Alters user_github_tokens: replaces encrypted_token+key_id with token_secret_id uuid.
--      Any existing encrypted tokens are dropped — they are unusable on cloud anyway
--      (store_github_token has been non-functional on cloud since deployment).
--      Users will simply re-authenticate to refresh their token.
--   3. Creates Vault-based store_github_token and new get_github_token.

set check_function_bodies = off;

-- 1. Drop the pgsodium-based implementation.
DROP FUNCTION IF EXISTS public.store_github_token(uuid, text);

-- 2. Alter user_github_tokens: swap pgsodium columns for a Vault secret UUID.
--    Existing rows are deleted first (tokens are unrecoverable without pgsodium on cloud).
DELETE FROM public.user_github_tokens;

ALTER TABLE public.user_github_tokens
  DROP COLUMN IF EXISTS encrypted_token,
  DROP COLUMN IF EXISTS key_id,
  ADD COLUMN token_secret_id uuid NOT NULL;

-- 3. Vault-based store_github_token.
--    Uses vault.create_secret / vault.update_secret — both accessible to the postgres
--    role on Supabase cloud, unlike pgsodium.crypto_aead_det_encrypt.
CREATE OR REPLACE FUNCTION public.store_github_token(p_user_id uuid, p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing_secret_id uuid;
BEGIN
  SELECT token_secret_id INTO v_existing_secret_id
  FROM user_github_tokens
  WHERE user_id = p_user_id;

  IF v_existing_secret_id IS NOT NULL THEN
    -- Rotate the secret in-place; the UUID in user_github_tokens stays stable.
    PERFORM vault.update_secret(v_existing_secret_id, p_token);
    UPDATE user_github_tokens
    SET updated_at = now()
    WHERE user_id = p_user_id;
  ELSE
    INSERT INTO user_github_tokens (user_id, token_secret_id)
    VALUES (
      p_user_id,
      vault.create_secret(
        p_token,
        'github_token_' || p_user_id::text,
        'GitHub OAuth token for user ' || p_user_id::text
      )
    );
  END IF;
END;
$$;

-- 4. get_github_token: decrypts the stored token via vault.decrypted_secrets.
--    Returns NULL if no token has been stored for the user.
CREATE OR REPLACE FUNCTION public.get_github_token(p_user_id uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT s.secret
  FROM user_github_tokens t
  JOIN vault.decrypted_secrets s ON s.id = t.token_secret_id
  WHERE t.user_id = p_user_id
$$;
