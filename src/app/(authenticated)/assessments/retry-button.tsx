// RetryButton — client component that calls the retry-rubric API endpoint.
// Issue: #132
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function RetryButton({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRetry() {
    setLoading(true);
    const res = await fetch(`/api/assessments/${assessmentId}/retry-rubric`, {
      method: 'POST',
    });
    if (res.ok) router.refresh();
    setLoading(false);
  }

  return (
    <button onClick={handleRetry} disabled={loading}>
      {loading ? 'Retrying...' : 'Retry'}
    </button>
  );
}
