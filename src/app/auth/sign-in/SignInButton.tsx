'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export function SignInButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${globalThis.location.origin}/auth/callback`,
        scopes: 'user:email read:user read:org',
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
    // On success the browser navigates away; no need to reset loading state
  }

  return (
    <>
      {error && <p role="alert">{error}</p>}
      <button onClick={handleSignIn} disabled={loading} type="button">
        {loading ? 'Signing in…' : 'Sign in with GitHub'}
      </button>
    </>
  );
}
