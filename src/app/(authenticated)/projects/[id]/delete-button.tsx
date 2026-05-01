'use client';

// DeleteButton — Org Admin only; confirms then DELETEs /api/projects/[id].
// Redirects to /projects on 204; surfaces "project not empty" on 409 inline.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.6
// Issue: #399

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface DeleteButtonProps {
  readonly projectId: string;
}

export function DeleteButton({ projectId }: DeleteButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    const confirmed = window.confirm('Delete this project? This action cannot be undone.');
    if (!confirmed) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
      if (res.status === 204) {
        router.push('/projects');
        return;
      }
      if (res.status === 409) {
        setError('Project is not empty. Remove all assessments before deleting.');
        return;
      }
      setError('Failed to delete project. Please try again.');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setDeleting(false);
    }
  }, [projectId, router]);

  return (
    <div className="space-y-1">
      <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
        {deleting ? 'Deleting…' : 'Delete project'}
      </Button>
      {error && (
        <p role="alert" className="text-body text-destructive">{error}</p>
      )}
    </div>
  );
}
