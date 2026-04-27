'use client';

// Design reference: docs/design/lld-v8-repository-management.md §T2
// Issue: #366

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface AddRepositoryButtonProps {
  readonly orgId: string;
  readonly githubRepoId: number;
  readonly githubRepoName: string;
}

const BUTTON_CLASSES =
  'inline-flex items-center justify-center rounded-sm text-label font-medium ' +
  'bg-accent text-background hover:bg-accent-hover disabled:opacity-50 ' +
  'h-7 px-2.5 cursor-pointer';

export function AddRepositoryButton({ orgId, githubRepoId, githubRepoName }: AddRepositoryButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/organisations/${orgId}/repositories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_repo_id: githubRepoId, github_repo_name: githubRepoName }),
      });
      if (res.status === 409) { setError('Already registered'); return; }
      if (!res.ok) { setError('Failed to add. Please try again.'); return; }
      router.refresh();
    } catch {
      // Swallowed: fetch only rejects on network failure; HTTP errors handled above.
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={handleAdd}
        disabled={loading}
        className={BUTTON_CLASSES}
      >
        {loading ? 'Adding…' : 'Add'}
      </button>
      {error ? <span className="text-caption text-destructive">{error}</span> : null}
    </div>
  );
}
