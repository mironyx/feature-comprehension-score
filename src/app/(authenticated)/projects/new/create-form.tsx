'use client';

// CreateProjectForm — POSTs to /api/projects, redirects to /projects/:id on 201.
// Surfaces 409 inline as "Name already in use".
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.5
// Issue: #398

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export interface CreateProjectFormProps {
  readonly orgId: string;
}

export default function CreateProjectForm({ orgId }: CreateProjectFormProps) {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          name: form.name,
          ...(form.description ? { description: form.description } : {}),
        }),
      });
      if (res.status === 201) {
        const project = await res.json() as { id: string };
        router.push(`/projects/${project.id}`);
      } else if (res.status === 409) {
        setError('Name already in use');
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      <div className="space-y-1">
        <label htmlFor="project-name" className="block text-label text-text-primary">
          Name
        </label>
        <input
          id="project-name"
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="project-description" className="block text-label text-text-primary">
          Description <span className="text-text-secondary">(optional)</span>
        </label>
        <textarea
          id="project-description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          className="w-full rounded-sm border border-border bg-surface px-3 py-2 text-body text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
        />
      </div>
      {error && (
        <p role="alert" className="text-body text-destructive">{error}</p>
      )}
      <Button type="submit" disabled={loading}>
        {loading ? 'Creating…' : 'Create project'}
      </Button>
    </form>
  );
}
