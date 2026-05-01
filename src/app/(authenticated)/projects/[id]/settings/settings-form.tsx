'use client';

// SettingsForm — per-project context configuration form.
// Submits PATCH /api/projects/[id] with the changed subset.
// Maps Zod issues with path[0] === 'glob_patterns' to per-row error display.
// Design reference: docs/design/lld-v11-e11-3-project-context-config.md §B.1
// Issue: #421

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export interface SettingsInitial {
  glob_patterns: string[];
  domain_notes: string;
  question_count: number;
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
}

const INPUT_CLASSES =
  'w-full rounded-sm border border-border bg-background px-3 py-1.5 text-body text-text-primary placeholder:text-text-secondary';

const QUESTION_COUNT_MIN = 3;
const QUESTION_COUNT_MAX = 8;
const DOMAIN_NOTES_MAX = 2000;
const GLOBS_MAX = 50;

function buildChangedSubset(
  current: SettingsInitial,
  initial: SettingsInitial,
): PatchPayload {
  const out: PatchPayload = {};
  if (
    current.glob_patterns.length !== initial.glob_patterns.length ||
    current.glob_patterns.some((p, i) => p !== initial.glob_patterns[i])
  ) {
    out.glob_patterns = current.glob_patterns;
  }
  if (current.domain_notes !== initial.domain_notes) {
    out.domain_notes = current.domain_notes;
  }
  if (current.question_count !== initial.question_count) {
    out.question_count = current.question_count;
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
  const [globs, setGlobs] = useState(initial.glob_patterns);
  const [domainNotes, setDomainNotes] = useState(initial.domain_notes);
  const [questionCount, setQuestionCount] = useState(initial.question_count);
  const [globErrors, setGlobErrors] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setError(null);
      setGlobErrors({});
      setSuccess(false);

      const subset = buildChangedSubset(
        { glob_patterns: globs, domain_notes: domainNotes, question_count: questionCount },
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
    [projectId, globs, domainNotes, questionCount, initial],
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
