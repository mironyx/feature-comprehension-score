'use client';

// CreateAssessmentForm — client component for admin to create an FCS assessment.
// Submits to POST /api/fcs and redirects to /assessments on success.
// Issue: #121

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Repository {
  id: string;
  github_repo_name: string;
}

interface CreateAssessmentFormProps {
  readonly orgId: string;
  readonly repositories: Repository[];
}

interface FormState {
  featureName: string;
  featureDescription: string;
  repositoryId: string;
  prNumbers: string;
  participants: string;
}

interface AssessmentPayload {
  org_id: string;
  repository_id: string;
  feature_name: string;
  feature_description?: string;
  merged_pr_numbers: number[];
  participants: { github_username: string }[];
}

const INITIAL_STATE: FormState = {
  featureName: '',
  featureDescription: '',
  repositoryId: '',
  prNumbers: '',
  participants: '',
};

function parsePrNumbers(raw: string): number[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);
}

function parseParticipants(raw: string): { github_username: string }[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((github_username) => ({ github_username }));
}

function validate(form: FormState): string | null {
  if (!form.featureName.trim()) return 'Feature name is required.';
  if (!form.repositoryId) return 'Please select a repository.';
  const rawPrs = form.prNumbers.split(',').map((s) => s.trim()).filter(Boolean);
  if (rawPrs.length === 0) return 'Enter at least one merged PR number.';
  const invalid = rawPrs.filter((s) => !Number.isInteger(Number(s)) || Number(s) <= 0);
  if (invalid.length > 0) return `Invalid PR number(s): ${invalid.join(', ')}`;
  if (parseParticipants(form.participants).length === 0) return 'Enter at least one participant GitHub username.';
  return null;
}

async function postAssessment(payload: AssessmentPayload): Promise<string | null> {
  const res = await fetch('/api/fcs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch((err: unknown) => { console.error('postAssessment: failed to parse error response:', err); return {}; }) as { error?: string };
    return body.error ?? 'Failed to create assessment. Please try again.';
  }
  return null;
}

export default function CreateAssessmentForm({ orgId, repositories }: CreateAssessmentFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = useCallback(
    (field: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    },
    [],
  );

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      const validationError = validate(form);
      if (validationError) { setError(validationError); return; }
      setSubmitting(true);
      setError(null);
      try {
        const apiError = await postAssessment({
          org_id: orgId,
          repository_id: form.repositoryId,
          feature_name: form.featureName.trim(),
          feature_description: form.featureDescription.trim() || undefined,
          merged_pr_numbers: parsePrNumbers(form.prNumbers),
          participants: parseParticipants(form.participants),
        });
        if (apiError) { setError(apiError); return; }
        router.push('/assessments');
      } catch (err) {
        console.error('CreateAssessmentForm: submit failed:', err);
        setError('Network error. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [form, orgId, router],
  );

  return (
    <form onSubmit={handleSubmit} noValidate>
      {error && <p role="alert">{error}</p>}

      <label htmlFor="featureName">Feature name *</label>
      <input
        id="featureName"
        type="text"
        required
        value={form.featureName}
        onChange={handleChange('featureName')}
      />

      <label htmlFor="featureDescription">Feature description</label>
      <textarea
        id="featureDescription"
        value={form.featureDescription}
        onChange={handleChange('featureDescription')}
      />

      <label htmlFor="repositoryId">Repository *</label>
      <select
        id="repositoryId"
        required
        value={form.repositoryId}
        onChange={handleChange('repositoryId')}
      >
        <option value="">Select a repository…</option>
        {repositories.map((repo) => (
          <option key={repo.id} value={repo.id}>{repo.github_repo_name}</option>
        ))}
      </select>

      <label htmlFor="prNumbers">Merged PR numbers * (comma-separated)</label>
      <input
        id="prNumbers"
        type="text"
        placeholder="e.g. 42, 43, 44"
        value={form.prNumbers}
        onChange={handleChange('prNumbers')}
      />

      <label htmlFor="participants">Participant GitHub usernames * (comma-separated)</label>
      <input
        id="participants"
        type="text"
        placeholder="e.g. alice, bob"
        value={form.participants}
        onChange={handleChange('participants')}
      />

      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating…' : 'Create Assessment'}
      </button>
    </form>
  );
}
