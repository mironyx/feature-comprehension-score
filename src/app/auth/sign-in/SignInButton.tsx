'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

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
        scopes: 'read:user',
      },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
    // On success the browser navigates away; no need to reset loading state
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="text-body text-destructive">{error}</p>}
      <Button onClick={handleSignIn} disabled={loading} type="button" className="w-full">
        {loading ? 'Signing in…' : 'Sign in with GitHub'}
      </Button>
    </div>
  );
}
