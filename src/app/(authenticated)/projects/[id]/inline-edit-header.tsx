'use client';

// InlineEditHeader — pencil affordance for project name and description.
// PATCHes /api/projects/[id]; optimistic update; inline error on 409.
// Design reference: docs/design/lld-v11-e11-1-project-management.md §B.6
// Issue: #399

import { useState, useCallback, useEffect } from 'react';
import { Pencil, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface InlineEditHeaderProps {
  readonly projectId: string;
  readonly initialName: string;
  readonly initialDescription: string | null;
}

interface PatchResult {
  name: string;
  description: string | null;
}

async function patchProject(projectId: string, name: string, description: string | null): Promise<{ ok: true; data: PatchResult } | { ok: false; status: number }> {
  const res = await fetch(`/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description: description ?? undefined }),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const data = (await res.json()) as PatchResult;
  return { ok: true, data };
}

export function InlineEditHeader({ projectId, initialName, initialDescription }: InlineEditHeaderProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(initialName);
  const [editDescription, setEditDescription] = useState(initialDescription ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(null), 5000);
    return () => clearTimeout(timer);
  }, [error]);

  const handleEdit = useCallback(() => {
    setEditName(name);
    setEditDescription(description ?? '');
    setEditing(true);
  }, [name, description]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const handleSave = useCallback(async () => {
    const prevName = name;
    const prevDescription = description;
    setName(editName);
    setDescription(editDescription || null);
    setSaving(true);
    setEditing(false);

    const result = await patchProject(projectId, editName, editDescription || null);
    setSaving(false);

    if (!result.ok) {
      setName(prevName);
      setDescription(prevDescription);
      if (result.status === 409) {
        setError('A project with that name already exists.');
      } else {
        setError('Failed to save changes. Please try again.');
      }
    }
  }, [projectId, editName, editDescription, name, description]);

  const inputClasses = 'w-full rounded-sm border border-border bg-background px-3 py-1.5 text-body text-text-primary placeholder:text-text-secondary';

  return (
    <div className="space-y-2">
      {error && (
        <p role="alert" className="text-body text-destructive">{error}</p>
      )}
      {editing ? (
        <div className="space-y-2">
          <input
            aria-label="Project name"
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className={inputClasses}
          />
          <textarea
            aria-label="Project description"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            rows={3}
            className={`${inputClasses} resize-y`}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} aria-label="Save changes">
              <Check size={14} className="mr-1" /> Save
            </Button>
            <Button size="sm" variant="secondary" onClick={handleCancel} aria-label="Cancel editing">
              <X size={14} className="mr-1" /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <p className="text-heading text-text-primary">{name}</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleEdit}
              disabled={saving}
              aria-label="Edit project name and description"
            >
              <Pencil size={14} />
            </Button>
          </div>
          {description ? (
            <p className="text-body text-text-secondary">{description}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
