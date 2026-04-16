'use client';

// CreateAssessmentForm — client component for admin to create an FCS assessment.
// Submits to POST /api/fcs and redirects to /assessments on success.
// Issue: #121, #208

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

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
  comprehensionDepth: 'conceptual' | 'detailed';
}

interface AssessmentPayload {
  org_id: string;
  repository_id: string;
  feature_name: string;
  feature_description?: string;
  merged_pr_numbers: number[];
  participants: { github_username: string }[];
  comprehension_depth: 'conceptual' | 'detailed';
}

const INITIAL_STATE: FormState = {
  featureName: '',
  featureDescription: '',
  repositoryId: '',
  prNumbers: '',
  participants: '',
  comprehensionDepth: 'conceptual',
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

function validate(form: FormState): string[] {
  const errors: string[] = [];
  if (!form.featureName.trim()) errors.push('Feature name is required.');
  if (!form.repositoryId) errors.push('Please select a repository.');
  const rawPrs = form.prNumbers.split(',').map((s) => s.trim()).filter(Boolean);
  if (rawPrs.length === 0) {
    errors.push('Enter at least one merged PR number.');
  } else {
    const invalid = rawPrs.filter((s) => !Number.isInteger(Number(s)) || Number(s) <= 0);
    if (invalid.length > 0) errors.push(`Invalid PR number(s): ${invalid.join(', ')}`);
  }
  if (parseParticipants(form.participants).length === 0) errors.push('Enter at least one participant GitHub username.');
  return errors;
}

interface PostResult {
  error?: string;
  assessmentId?: string;
}

async function postAssessment(payload: AssessmentPayload): Promise<PostResult> {
  const res = await fetch('/api/fcs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch((err: unknown) => { console.error('postAssessment: failed to parse error response:', err); return {}; }) as { error?: string };
    return { error: body.error ?? 'Failed to create assessment. Please try again.' };
  }
  const body = (await res.json()) as { assessment_id: string };
  return { assessmentId: body.assessment_id };
}

export default function CreateAssessmentForm({ orgId, repositories }: CreateAssessmentFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  // Justification: S1854 false positive — React reads `errors` on every render via useState; the initial [] is not a dead assignment.
  const [errors, setErrors] = useState<string[]>([]);
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
      const validationErrors = validate(form);
      if (validationErrors.length > 0) { setErrors(validationErrors); return; }
      setSubmitting(true);
      setErrors([]);
      try {
        const result = await postAssessment({
          org_id: orgId,
          repository_id: form.repositoryId,
          feature_name: form.featureName.trim(),
          feature_description: form.featureDescription.trim() || undefined,
          merged_pr_numbers: parsePrNumbers(form.prNumbers),
          participants: parseParticipants(form.participants),
          comprehension_depth: form.comprehensionDepth,
        });
        if (result.error) { setErrors([result.error]); return; }
        router.push(`/assessments?created=${result.assessmentId}`);
      } catch (err) {
        console.error('CreateAssessmentForm: submit failed:', err);
        setErrors(['Network error. Please try again.']);
      } finally {
        setSubmitting(false);
      }
    },
    [form, orgId, router],
  );

  const inputClasses = 'w-full rounded-sm border border-border bg-background px-3 py-1.5 text-body text-text-primary placeholder:text-text-secondary';

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="space-y-section-gap">
        {errors.length > 0 && (
          <ul role="alert" className="text-destructive text-body space-y-1">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}

        <div className="space-y-2">
          <label htmlFor="featureName" className="text-label text-text-secondary block">Feature name *</label>
          <input
            id="featureName"
            type="text"
            required
            value={form.featureName}
            onChange={handleChange('featureName')}
            className={inputClasses}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="featureDescription" className="text-label text-text-secondary block">Feature description</label>
          <textarea
            id="featureDescription"
            value={form.featureDescription}
            onChange={handleChange('featureDescription')}
            rows={3}
            className={`${inputClasses} resize-y`}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="comprehensionDepth" className="text-label text-text-secondary block">Comprehension Depth</label>
          <select
            id="comprehensionDepth"
            value={form.comprehensionDepth}
            onChange={handleChange('comprehensionDepth')}
            className={inputClasses}
          >
            <option value="conceptual">Conceptual — Tests reasoning about approach, constraints, and rationale</option>
            <option value="detailed">Detailed — Tests knowledge of specific types, files, and function signatures</option>
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="repositoryId" className="text-label text-text-secondary block">Repository *</label>
          <select
            id="repositoryId"
            required
            value={form.repositoryId}
            onChange={handleChange('repositoryId')}
            className={inputClasses}
          >
            <option value="">Select a repository…</option>
            {repositories.map((repo) => (
              <option key={repo.id} value={repo.id}>{repo.github_repo_name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <label htmlFor="prNumbers" className="text-label text-text-secondary block">Merged PR numbers * (comma-separated)</label>
          <input
            id="prNumbers"
            type="text"
            placeholder="e.g. 42, 43, 44"
            value={form.prNumbers}
            onChange={handleChange('prNumbers')}
            className={inputClasses}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="participants" className="text-label text-text-secondary block">Participant GitHub usernames * (comma-separated)</label>
          <input
            id="participants"
            type="text"
            placeholder="e.g. alice, bob"
            value={form.participants}
            onChange={handleChange('participants')}
            className={inputClasses}
          />
        </div>

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create Assessment'}
        </Button>
      </form>
    </Card>
  );
}
