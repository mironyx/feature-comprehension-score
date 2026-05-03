'use client';

// Extracted from org-context-form.tsx — shared by OrgContextForm and SettingsForm.
// Issue: #453

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';

export interface TagInputProps {
  readonly label: string;
  readonly items: string[];
  readonly max: number;
  readonly onAdd: (value: string) => void;
  readonly onRemove: (index: number) => void;
}

export function TagInput({ label, items, max, onAdd, onRemove }: TagInputProps) {
  const [draft, setDraft] = useState('');

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || items.length >= max) return;
    onAdd(trimmed);
    setDraft('');
  }

  return (
    <div className="space-y-2">
      <label className="text-label text-text-secondary block">{label} (max {max})</label>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <Badge key={`${item}-${i}`} className="bg-surface-raised text-text-primary gap-1">
            {item}
            <button
              type="button"
              onClick={() => onRemove(i)}
              className="ml-1 text-text-secondary hover:text-destructive"
              aria-label={`Remove ${item}`}
            >
              x
            </button>
          </Badge>
        ))}
      </div>
      {items.length < max && (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type and press Enter"
          className="w-full rounded-sm border border-border bg-background px-3 py-1.5 text-body text-text-primary placeholder:text-text-secondary"
        />
      )}
    </div>
  );
}
