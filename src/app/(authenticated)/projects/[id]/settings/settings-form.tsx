'use client';

// SettingsForm — per-project context configuration form.
// Submits PATCH /api/projects/[id] with the changed subset.
// Maps Zod issues with path[0] === 'glob_patterns' to per-row error display.
// Design reference: docs/design/lld-v11-e11-3-project-context-config.md §B.1
// Issue: #421

import { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { TagInput } from '@/components/context/tag-input';
import { VocabRow } from '@/components/context/vocab-row';

export interface SettingsInitial {
  glob_patterns: string[];
  domain_notes: string;
  question_count: number;
  domain_vocabulary: { term: string; definition: string }[];
  focus_areas: string[];
  exclusions: string[];
}

interface SettingsFormProps {
  readonly projectId: string;
  readonly projectName: string;
  readonly initial: SettingsInitial;
}

interface ZodIssue {
  path: (string | number)[];
  message: string;
}

interface PatchPayload {
  glob_patterns?: string[];
  domain_notes?: string;
  question_count?: number;
  domain_vocabulary?: { term: string; definition: string }[];
  focus_areas?: string[];
  exclusions?: string[];
}

const INPUT_CLASSES =
  'w-full rounded-sm border border-border bg-background px-3 py-1.5 text-body text-text-primary placeholder:text-text-secondary';

const QUESTION_COUNT_MIN = 3;
const QUESTION_COUNT_MAX = 8;
const DOMAIN_NOTES_MAX = 2000;
const GLOBS_MAX = 50;

function arraysEqual<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function vocabEqual(
  a: { term: string; definition: string }[],
  b: { term: string; definition: string }[],
): boolean {
  return (
    a.length === b.length &&
    a.every((row, i) => row.term === b[i]!.term && row.definition === b[i]!.definition)
  );
}

function buildChangedSubset(
  current: SettingsInitial,
  initial: SettingsInitial,
): PatchPayload {
  const out: PatchPayload = {};
  if (!arraysEqual(current.glob_patterns, initial.glob_patterns)) {
    out.glob_patterns = current.glob_patterns;
  }
  if (current.domain_notes !== initial.domain_notes) {
    out.domain_notes = current.domain_notes;
  }
  if (current.question_count !== initial.question_count) {
    out.question_count = current.question_count;
  }
  if (!vocabEqual(current.domain_vocabulary, initial.domain_vocabulary)) {
    out.domain_vocabulary = current.domain_vocabulary;
  }
  if (!arraysEqual(current.focus_areas, initial.focus_areas)) {
    out.focus_areas = current.focus_areas;
  }
  if (!arraysEqual(current.exclusions, initial.exclusions)) {
    out.exclusions = current.exclusions;
  }
  return out;
}

function mapIssuesToGlobErrors(issues: ZodIssue[]): Record<number, string> {
  const map: Record<number, string> = {};
  for (const issue of issues) {
    if (issue.path[0] === 'glob_patterns' && typeof issue.path[1] === 'number') {
      map[issue.path[1]] = issue.message;
    }
  }
  return map;
}

interface GlobPatternListProps {
  readonly items: string[];
  readonly errors: Record<number, string>;
  readonly onAdd: (value: string) => void;
  readonly onRemove: (index: number) => void;
}

function GlobPatternList({ items, errors, onAdd, onRemove }: GlobPatternListProps) {
  const [draft, setDraft] = useState('');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || items.length >= GLOBS_MAX) return;
    onAdd(trimmed);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <label className="text-label text-text-secondary block">
        Glob patterns (max {GLOBS_MAX})
      </label>
      <ul className="space-y-1">
        {items.map((p, i) => (
          <li key={`${p}-${i}`} className="flex items-center gap-2">
            <code className="flex-1 rounded-sm bg-surface-raised px-2 py-1 text-body text-text-primary">
              {p}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRemove(i)}
              aria-label={`Remove ${p}`}
            >
              x
            </Button>
            {errors[i] && (
              <span role="alert" className="text-body text-destructive">
                {errors[i]}
              </span>
            )}
          </li>
        ))}
      </ul>
      {items.length < GLOBS_MAX && (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a glob pattern and press Enter"
          aria-label="Add glob pattern"
          className={INPUT_CLASSES}
        />
      )}
    </div>
  );
}

async function patchProject(
  projectId: string,
  payload: PatchPayload,
): Promise<
  | { ok: true }
  | { ok: false; issues?: ZodIssue[]; status: number }
> {
  const res = await fetch(`/api/projects/${projectId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.ok) return { ok: true };
  // Non-JSON error body → fall back to generic message; intentional swallow.
  const body = (await res.json().catch(() => ({}))) as {
    details?: { issues?: ZodIssue[] };
  };
  return { ok: false, status: res.status, issues: body.details?.issues };
}

export function SettingsForm({ projectId, projectName, initial }: SettingsFormProps) {
  const nextVocabId = useRef(0);
  const makeVocabRows = (rows: { term: string; definition: string }[]) =>
    rows.map((r) => ({ ...r, _id: nextVocabId.current++ }));

  const [globs, setGlobs] = useState(initial.glob_patterns);
  const [domainNotes, setDomainNotes] = useState(initial.domain_notes);
  const [questionCount, setQuestionCount] = useState(initial.question_count);
  const [vocabulary, setVocabulary] = useState(() => makeVocabRows(initial.domain_vocabulary));
  const [focusAreas, setFocusAreas] = useState(initial.focus_areas);
  const [exclusions, setExclusions] = useState(initial.exclusions);
  const [globErrors, setGlobErrors] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

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
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setGlobErrors({});
      setSuccess(false);

      const strippedVocab = vocabulary.map(({ term, definition }) => ({ term, definition }));
      const subset = buildChangedSubset(
        {
          glob_patterns: globs,
          domain_notes: domainNotes,
          question_count: questionCount,
          domain_vocabulary: strippedVocab,
          focus_areas: focusAreas,
          exclusions,
        },
        initial,
      );
      if (Object.keys(subset).length === 0) {
        setSuccess(true);
        return;
      }

      setSaving(true);
      const result = await patchProject(projectId, subset);
      setSaving(false);

      if (result.ok) {
        setSuccess(true);
        return;
      }
      if (result.status === 422 || result.status === 400) {
        const issues = result.issues ?? [];
        const fieldErrors = mapIssuesToGlobErrors(issues);
        if (Object.keys(fieldErrors).length > 0) setGlobErrors(fieldErrors);
        setError('Please fix the errors above.');
        return;
      }
      setError('Failed to save changes. Please try again.');
    },
    [projectId, globs, domainNotes, questionCount, vocabulary, focusAreas, exclusions, initial],
  );

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="space-y-section-gap">
        <h2 className="text-heading-md font-display">{projectName} — Settings</h2>
        {error && (
          <p role="alert" className="text-destructive text-body">
            {error}
          </p>
        )}
        {success && (
          <output className="text-accent text-body block">Settings saved.</output>
        )}

        <GlobPatternList
          items={globs}
          errors={globErrors}
          onAdd={(v) => {
            setGlobs((prev) => [...prev, v]);
            setGlobErrors({});
          }}
          onRemove={(i) => {
            setGlobs((prev) => prev.filter((_, idx) => idx !== i));
            setGlobErrors({});
          }}
        />

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
            Domain notes ({domainNotes.length}/{DOMAIN_NOTES_MAX})
          </label>
          <textarea
            id="domainNotes"
            value={domainNotes}
            onChange={(e) => setDomainNotes(e.target.value)}
            maxLength={DOMAIN_NOTES_MAX}
            rows={5}
            className={`${INPUT_CLASSES} resize-y`}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="questionCount" className="text-label text-text-secondary block">
            Question count ({QUESTION_COUNT_MIN}–{QUESTION_COUNT_MAX})
          </label>
          <input
            id="questionCount"
            type="number"
            min={QUESTION_COUNT_MIN}
            max={QUESTION_COUNT_MAX}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
            className={INPUT_CLASSES}
          />
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? 'Saving...' : 'Save settings'}
        </Button>
      </form>
    </Card>
  );
}
