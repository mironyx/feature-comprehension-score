'use client';

// OrgContextForm — admin panel for managing organisation assessment context.
// Design reference: docs/requirements/v1-prompt-changes.md §Change 2 (UI Surface)
// Issue: #158

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { validateOrgContext } from './org-context-validation';
import type { OrganisationContext } from '@/lib/engine/prompts';
import { TagInput } from '@/components/context/tag-input';
import { VocabRow } from '@/components/context/vocab-row';

const INPUT_CLASSES = 'rounded-sm border border-border bg-background px-3 py-1.5 text-body text-text-primary placeholder:text-text-secondary';

interface OrgContextFormProps {
  readonly orgId: string;
  readonly initial: OrganisationContext;
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
  const nextVocabId = useRef(0);
  const makeVocabRows = (rows: { term: string; definition: string }[]) =>
    rows.map((r) => ({ ...r, _id: nextVocabId.current++ }));

  const [vocabulary, setVocabulary] = useState(() => makeVocabRows(initial.domain_vocabulary ?? []));
  const [focusAreas, setFocusAreas] = useState(initial.focus_areas ?? []);
  const [exclusions, setExclusions] = useState(initial.exclusions ?? []);
  const [domainNotes, setDomainNotes] = useState(initial.domain_notes ?? '');
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const addVocabRow = useCallback(() => {
    const id = nextVocabId.current++;
    setVocabulary((prev) => [...prev, { term: '', definition: '', _id: id }]);
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

      const strippedVocab = vocabulary.map(({ term, definition }) => ({ term, definition }));
      const ctx: OrganisationContext = {
        domain_vocabulary: strippedVocab.length > 0 ? strippedVocab : undefined,
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
              key={row._id}
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
