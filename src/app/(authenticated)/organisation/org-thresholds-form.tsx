'use client';

// OrgThresholdsForm — admin panel for managing artefact-quality and FCS low thresholds.
// Design reference: docs/requirements/v2-requirements.md §Epic 11 Story 11.2
// Issue: #237

import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { validateOrgThresholds } from './org-thresholds-validation';
import type { OrgThresholds } from '@/lib/engine/org-thresholds';

interface OrgThresholdsFormProps {
  readonly orgId: string;
  readonly initial: OrgThresholds;
}

const INPUT_CLASSES =
  'rounded-sm border border-border bg-background px-3 py-1.5 text-body text-text-primary placeholder:text-text-secondary';

async function submitThresholds(
  orgId: string,
  thresholds: OrgThresholds,
): Promise<string | null> {
  const res = await fetch(`/api/organisations/${orgId}/thresholds`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(thresholds),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    return body.error ?? 'Failed to save. Please try again.';
  }
  return null;
}

export default function OrgThresholdsForm({ orgId, initial }: OrgThresholdsFormProps) {
  const [artefactPct, setArtefactPct] = useState(
    Math.round(initial.artefact_quality_threshold * 100),
  );
  const [fcsPct, setFcsPct] = useState(initial.fcs_low_threshold);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSuccess(false);

      const thresholds: OrgThresholds = {
        artefact_quality_threshold: artefactPct / 100,
        fcs_low_threshold: fcsPct,
      };

      const validationErrors = validateOrgThresholds(thresholds);
      if (validationErrors.length > 0) { setErrors(validationErrors); return; }

      setSubmitting(true);
      setErrors([]);
      try {
        const errorMsg = await submitThresholds(orgId, thresholds);
        if (errorMsg) { setErrors([errorMsg]); return; }
        setSuccess(true);
      } catch (err) {
        console.error('OrgThresholdsForm: submit failed:', err);
        setErrors(['Network error. Please try again.']);
      } finally {
        setSubmitting(false);
      }
    },
    [orgId, artefactPct, fcsPct],
  );

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="space-y-section-gap">
        <h2 className="text-heading-md font-display">Assessment Thresholds</h2>
        <p className="text-body text-text-secondary">
          Control when the results page flags low artefact quality and low FCS scores.
        </p>

        {errors.length > 0 && (
          <ul role="alert" className="text-destructive text-body space-y-1">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}

        {success && (
          <output className="text-accent text-body block">
            Thresholds saved successfully.
          </output>
        )}

        <div className="space-y-2">
          <label htmlFor="artefactQualityThreshold" className="text-label text-text-secondary block">
            Artefact quality low threshold ({artefactPct}%)
          </label>
          <input
            id="artefactQualityThreshold"
            type="number"
            min={0}
            max={100}
            step={1}
            value={artefactPct}
            onChange={(e) => setArtefactPct(Number(e.target.value))}
            className={`w-24 ${INPUT_CLASSES}`}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="fcsLowThreshold" className="text-label text-text-secondary block">
            FCS low threshold ({fcsPct})
          </label>
          <input
            id="fcsLowThreshold"
            type="number"
            min={0}
            max={100}
            step={1}
            value={fcsPct}
            onChange={(e) => setFcsPct(Number(e.target.value))}
            className={`w-24 ${INPUT_CLASSES}`}
          />
        </div>

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save thresholds'}
        </Button>
      </form>
    </Card>
  );
}
