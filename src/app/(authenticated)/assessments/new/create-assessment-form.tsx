'use client';

// CreateAssessmentForm — client component for admin to create an FCS assessment.
// Submits to POST /api/fcs and shows inline progress on success.
// Issue: #121, #208

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PollingStatusBadge } from '../polling-status-badge';
import { useStatusPoll } from '../use-status-poll';

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
  issueNumbers: string;
  participants: string;
  comprehensionDepth: 'conceptual' | 'detailed';
}

interface AssessmentPayload {
  org_id: string;
  repository_id: string;
  feature_name: string;
  feature_description?: string;
  merged_pr_numbers?: number[];
  issue_numbers?: number[];
  participants: { github_username: string }[];
  comprehension_depth: 'conceptual' | 'detailed';
}

const INITIAL_STATE: FormState = {
  featureName: '',
  featureDescription: '',
  repositoryId: '',
  prNumbers: '',
  issueNumbers: '',
  participants: '',
  comprehensionDepth: 'conceptual',
};

function parsePositiveIntegers(raw: string): number[] {
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

// Justification: extracted from validate() so we can surface the invalid tokens verbatim
// in the error message rather than a generic "not a positive integer" line.
function findInvalidNumbers(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !Number.isInteger(Number(s)) || Number(s) <= 0);
}

function validate(form: FormState): string[] {
  const errors: string[] = [];
  if (!form.featureName.trim()) errors.push('Feature name is required.');
  if (!form.repositoryId) errors.push('Please select a repository.');
  const prs = parsePositiveIntegers(form.prNumbers);
  const issues = parsePositiveIntegers(form.issueNumbers);
  if (prs.length === 0 && issues.length === 0) {
    errors.push('Enter at least one merged PR number or issue number.');
  }
  const invalidPrs = findInvalidNumbers(form.prNumbers);
  if (invalidPrs.length > 0) errors.push(`Invalid PR number(s): ${invalidPrs.join(', ')}`);
  const invalidIssues = findInvalidNumbers(form.issueNumbers);
  if (invalidIssues.length > 0) errors.push(`Invalid issue number(s): ${invalidIssues.join(', ')}`);
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

interface CreationResult {
  readonly assessmentId: string;
  readonly featureName: string;
}

function CreationProgress({ assessmentId, featureName }: CreationResult) {
  const { status } = useStatusPoll(assessmentId, 'rubric_generation');

  if (status === 'awaiting_responses') {
    return (
      <Card>
        <div className="space-y-4">
          <p className="text-body text-text-primary">
            Rubric generated successfully for <strong>{featureName}</strong>.
          </p>
          <Link href={`/assessments/${assessmentId}`} className="text-primary underline">
            View assessment
          </Link>
        </div>
      </Card>
    );
  }

  if (status === 'rubric_failed') {
    return (
      <Card>
        <div className="space-y-4">
          <p className="text-body text-destructive">
            Rubric generation failed for <strong>{featureName}</strong>.
          </p>
          <Link href="/assessments" className="text-primary underline">
            Back to assessments
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="space-y-4">
        <p className="text-body text-text-primary">
          Creating assessment: <strong>{featureName}</strong>
        </p>
        <PollingStatusBadge assessmentId={assessmentId} initialStatus="rubric_generation" />
        <div>
          <Link href="/assessments" className="text-primary underline text-body">
            Go to assessments list
          </Link>
        </div>
      </div>
    </Card>
  );
}

export default function CreateAssessmentForm({ orgId, repositories }: CreateAssessmentFormProps) {
  const [form, setForm] = useState<FormState>(INITIAL_STATE);
  // Justification: S1854 false positive — React reads `errors` on every render via useState; the initial [] is not a dead assignment.
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreationResult | null>(null);

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
        const prs = parsePositiveIntegers(form.prNumbers);
        const issues = parsePositiveIntegers(form.issueNumbers);
        const payload: AssessmentPayload = {
          org_id: orgId,
          repository_id: form.repositoryId,
          feature_name: form.featureName.trim(),
          feature_description: form.featureDescription.trim() || undefined,
          participants: parseParticipants(form.participants),
          comprehension_depth: form.comprehensionDepth,
        };
        if (prs.length > 0) payload.merged_pr_numbers = prs;
        if (issues.length > 0) payload.issue_numbers = issues;
        const result = await postAssessment(payload);
        if (result.error) { setErrors([result.error]); return; }
        setCreated({ assessmentId: result.assessmentId!, featureName: form.featureName.trim() });
      } catch (err) {
        console.error('CreateAssessmentForm: submit failed:', err);
        setErrors(['Network error. Please try again.']);
      } finally {
        setSubmitting(false);
      }
    },
    [form, orgId],
  );

  const inputClasses = 'w-full rounded-sm border border-border bg-background px-3 py-1.5 text-body text-text-primary placeholder:text-text-secondary';

  if (created) {
    return <CreationProgress assessmentId={created.assessmentId} featureName={created.featureName} />;
  }

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
          <label htmlFor="prNumbers" className="text-label text-text-secondary block">Merged PR numbers (comma-separated)</label>
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
          <label htmlFor="issueNumbers" className="text-label text-text-secondary block">Issue numbers (comma-separated)</label>
          <input
            id="issueNumbers"
            type="text"
            placeholder="e.g. 101, 202"
            value={form.issueNumbers}
            onChange={handleChange('issueNumbers')}
            className={inputClasses}
          />
          <p className="text-label text-text-secondary">Provide at least one of PR numbers or issue numbers.</p>
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
