// RetryButton — client component that calls the retry-rubric API endpoint.
// Design reference: docs/design/lld-e18.md §18.2
// Issues: #132, #208, #273
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export interface RetryButtonProps {
  assessmentId: string;
  retryCount: number;
  maxRetries: number;
  errorRetryable: boolean | null;
  onSuccess?: () => void;
}

// Justification: getDisabledReason and getButtonLabel are not in the LLD §18.2 internal
// decomposition — extracted from the RetryButton component body to keep it under the
// 20-line budget (CLAUDE.md) and to make guardrail logic independently testable.
function getDisabledReason(retryCount: number, maxRetries: number, errorRetryable: boolean | null): string | null {
  if (retryCount >= maxRetries) return `Maximum retries reached (${maxRetries} of ${maxRetries})`;
  if (errorRetryable === false) return 'This error is not retryable';
  return null;
}

function getButtonLabel(loading: boolean, disabled: boolean, retryCount: number, maxRetries: number): string {
  if (loading) return 'Retrying...';
  if (disabled) return 'Retry';
  return `Retry (Attempt ${retryCount + 1} of ${maxRetries})`;
}

export function RetryButton({ assessmentId, retryCount, maxRetries, errorRetryable, onSuccess }: Readonly<RetryButtonProps>) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabledReason = getDisabledReason(retryCount, maxRetries, errorRetryable);
  const buttonLabel = getButtonLabel(loading, disabledReason !== null, retryCount, maxRetries);

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
      onSuccess?.();
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={handleRetry}
        disabled={loading || disabledReason !== null}
      >
        {buttonLabel}
      </Button>
      {disabledReason && <span className="text-caption text-text-secondary">{disabledReason}</span>}
      {error && <span role="alert" className="text-caption text-destructive">{error}</span>}
    </span>
  );
}
