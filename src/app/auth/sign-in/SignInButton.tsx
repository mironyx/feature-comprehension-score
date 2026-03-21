'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export function SignInButton() {
  const [loading, setLoading] = useState(false);

  async function handleSignIn() {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    // Page navigates away; no need to reset loading state
  }

  return (
    <button onClick={handleSignIn} disabled={loading} type="button">
      {loading ? 'Signing in…' : 'Sign in with GitHub'}
    </button>
  );
}
