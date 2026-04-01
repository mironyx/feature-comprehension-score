'use client';

// OrgContextForm — admin panel for managing organisation assessment context.
// Design reference: docs/requirements/v1-prompt-changes.md §Change 2 (UI Surface)
// Issue: #158

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { validateOrgContext } from './org-context-validation';
import type { OrganisationContext } from '@/lib/engine/prompts';

interface OrgContextFormProps {
  readonly orgId: string;
  readonly initial: OrganisationContext;
}

// ---------------------------------------------------------------------------
// Tag input sub-component
// ---------------------------------------------------------------------------

interface TagInputProps {
  readonly label: string;
  readonly items: string[];
  readonly max: number;
  readonly onAdd: (value: string) => void;
  readonly onRemove: (index: number) => void;
}

function TagInput({ label, items, max, onAdd, onRemove }: TagInputProps) {
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

// ---------------------------------------------------------------------------
// Vocabulary row sub-component
// ---------------------------------------------------------------------------

interface VocabRowProps {
  readonly term: string;
  readonly definition: string;
  readonly onChange: (field: 'term' | 'definition', value: string) => void;
  readonly onRemove: () => void;
}

const INPUT_CLASSES = 'rounded-sm border border-border bg-background px-3 py-1.5 text-body text-text-primary placeholder:text-text-secondary';

function VocabRow({ term, definition, onChange, onRemove }: VocabRowProps) {
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

// ---------------------------------------------------------------------------
// Submit helper
// ---------------------------------------------------------------------------

async function submitContext(orgId: string, ctx: OrganisationContext): Promise<string | null> {
  const res = await fetch(`/api/organisations/${orgId}/context`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ctx),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    return body.error ?? 'Failed to save. Please try again.';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main form
// ---------------------------------------------------------------------------

export default function OrgContextForm({ orgId, initial }: OrgContextFormProps) {
  const [vocabulary, setVocabulary] = useState(initial.domain_vocabulary ?? []);
  const [focusAreas, setFocusAreas] = useState(initial.focus_areas ?? []);
  const [exclusions, setExclusions] = useState(initial.exclusions ?? []);
  const [domainNotes, setDomainNotes] = useState(initial.domain_notes ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const addVocabRow = useCallback(() => {
    setVocabulary((prev) => [...prev, { term: '', definition: '' }]);
  }, []);

  const updateVocabRow = useCallback(
    (index: number, field: 'term' | 'definition', value: string) => {
      setVocabulary((prev) =>
        prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
      );
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSuccess(false);

      const ctx: OrganisationContext = {
        domain_vocabulary: vocabulary.length > 0 ? vocabulary : undefined,
        focus_areas: focusAreas.length > 0 ? focusAreas : undefined,
        exclusions: exclusions.length > 0 ? exclusions : undefined,
        domain_notes: domainNotes.trim() || undefined,
      };

      const validationErrors = validateOrgContext(ctx);
      if (validationErrors.length > 0) { setErrors(validationErrors); return; }

      setSubmitting(true);
      setErrors([]);
      try {
        const errorMsg = await submitContext(orgId, ctx);
        if (errorMsg) { setErrors([errorMsg]); return; }
        setSuccess(true);
      } catch (err) {
        console.error('OrgContextForm: submit failed:', err);
        setErrors(['Network error. Please try again.']);
      } finally {
        setSubmitting(false);
      }
    },
    [vocabulary, focusAreas, exclusions, domainNotes, orgId],
  );

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="space-y-section-gap">
        <h2 className="text-heading-md font-display">Assessment Context</h2>
        <p className="text-body text-text-secondary">
          Configure domain-specific context to improve the quality of generated assessment questions.
        </p>

        {errors.length > 0 && (
          <ul role="alert" className="text-destructive text-body space-y-1">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}

        {success && (
          <output className="text-accent text-body block">
            Context saved successfully.
          </output>
        )}

        <fieldset className="space-y-2">
          <legend className="text-label text-text-secondary">Domain vocabulary</legend>
          {vocabulary.map((row, i) => (
            <VocabRow
              key={`${row.term}-${i}`}
              term={row.term}
              definition={row.definition}
              onChange={(field, value) => updateVocabRow(i, field, value)}
              onRemove={() => setVocabulary((prev) => prev.filter((_, idx) => idx !== i))}
            />
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={addVocabRow}>
            + Add term
          </Button>
        </fieldset>

        <TagInput
          label="Focus areas"
          items={focusAreas}
          max={5}
          onAdd={(v) => setFocusAreas((prev) => [...prev, v])}
          onRemove={(i) => setFocusAreas((prev) => prev.filter((_, idx) => idx !== i))}
        />

        <TagInput
          label="Exclusions"
          items={exclusions}
          max={5}
          onAdd={(v) => setExclusions((prev) => [...prev, v])}
          onRemove={(i) => setExclusions((prev) => prev.filter((_, idx) => idx !== i))}
        />

        <div className="space-y-2">
          <label htmlFor="domainNotes" className="text-label text-text-secondary block">
            Domain notes ({domainNotes.length}/500)
          </label>
          <textarea
            id="domainNotes"
            value={domainNotes}
            onChange={(e) => setDomainNotes(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Describe any domain-specific context that would help generate better questions. Example: This team uses CQRS with event sourcing. Domain events are the primary integration mechanism between bounded contexts."
            className={`w-full ${INPUT_CLASSES} resize-y`}
          />
        </div>

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save context'}
        </Button>
      </form>
    </Card>
  );
}
