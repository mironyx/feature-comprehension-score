'use client';

// Extracted from org-context-form.tsx — shared by OrgContextForm and SettingsForm.
// Issue: #453

import { Button } from '@/components/ui/button';

const INPUT_CLASSES = 'rounded-sm border border-border bg-background px-3 py-1.5 text-body text-text-primary placeholder:text-text-secondary';

export interface VocabRowProps {
  readonly term: string;
  readonly definition: string;
  readonly onChange: (field: 'term' | 'definition', value: string) => void;
  readonly onRemove: () => void;
}

export function VocabRow({ term, definition, onChange, onRemove }: VocabRowProps) {
  return (
    <div className="flex gap-2 items-start">
      <input
        type="text"
        value={term}
        onChange={(e) => onChange('term', e.target.value)}
        placeholder="Term"
        className={`flex-1 ${INPUT_CLASSES}`}
      />
      <input
        type="text"
        value={definition}
        onChange={(e) => onChange('definition', e.target.value)}
        placeholder="Definition"
        className={`flex-[2] ${INPUT_CLASSES}`}
      />
      <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label="Remove row">
        x
      </Button>
    </div>
  );
}
