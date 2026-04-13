// RetryButton — client component that calls the retry-rubric API endpoint.
// Issue: #132, #208
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function RetryButton({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/assessments/${assessmentId}/retry-rubric`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? 'Retry failed');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button variant="secondary" size="sm" onClick={handleRetry} disabled={loading}>
        {loading ? 'Retrying...' : 'Retry'}
      </Button>
      {error && <span role="alert" className="text-caption text-destructive">{error}</span>}
    </span>
  );
}
