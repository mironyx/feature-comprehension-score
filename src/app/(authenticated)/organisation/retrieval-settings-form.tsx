'use client';

// RetrievalSettingsForm — admin panel for tool-use flag, cost cap, and loop timeout.
// Design reference: docs/design/lld-v2-e17-agentic-retrieval.md §17.2a
// Issue: #251

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { validateRetrievalSettings } from './retrieval-settings-validation';
import type { RetrievalSettings } from '@/app/api/organisations/[id]/retrieval-settings/service';

interface RetrievalSettingsFormProps {
  readonly orgId: string;
  readonly initial: RetrievalSettings;
}

const INPUT_CLASSES = 'rounded-sm border border-border bg-background px-3 py-1.5 text-body text-text-primary placeholder:text-text-secondary';

async function submitSettings(
  orgId: string,
  settings: RetrievalSettings,
): Promise<string | null> {
  const res = await fetch(`/api/organisations/${orgId}/retrieval-settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
  if (!res.ok) {
    // Non-JSON error bodies fall through to the generic message below; the
    // HTTP failure is already signalled by `!res.ok`.
    const body = await res.json().catch(() => ({})) as { error?: string };
    return body.error ?? 'Failed to save. Please try again.';
  }
  return null;
}

export default function RetrievalSettingsForm({ orgId, initial }: RetrievalSettingsFormProps) {
  const [toolUseEnabled, setToolUseEnabled] = useState(initial.tool_use_enabled);
  const [costCap, setCostCap] = useState(initial.rubric_cost_cap_cents);
  const [timeout, setTimeoutSeconds] = useState(initial.retrieval_timeout_seconds);
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      setSuccess(false);

      const settings: RetrievalSettings = {
        tool_use_enabled: toolUseEnabled,
        rubric_cost_cap_cents: costCap,
        retrieval_timeout_seconds: timeout,
      };

      const validationErrors = validateRetrievalSettings(settings);
      if (validationErrors.length > 0) { setErrors(validationErrors); return; }

      setSubmitting(true);
      setErrors([]);
      try {
        const errorMsg = await submitSettings(orgId, settings);
        if (errorMsg) { setErrors([errorMsg]); return; }
        setSuccess(true);
      } catch (err) {
        console.error('RetrievalSettingsForm: submit failed:', err);
        setErrors(['Network error. Please try again.']);
      } finally {
        setSubmitting(false);
      }
    },
    [orgId, toolUseEnabled, costCap, timeout],
  );

  return (
    <Card>
      <form onSubmit={handleSubmit} noValidate className="space-y-section-gap">
        <h2 className="text-heading-md font-display">Retrieval</h2>
        <p className="text-body text-text-secondary">
          Configure whether the rubric-generation LLM can read files from the repository on demand, and the per-assessment spend cap and timeout for that loop.
        </p>

        {errors.length > 0 && (
          <ul role="alert" className="text-destructive text-body space-y-1">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}

        {success && (
          <output className="text-accent text-body block">
            Retrieval settings saved.
          </output>
        )}

        <div className="flex items-center gap-3">
          <input
            id="tool_use_enabled"
            type="checkbox"
            checked={toolUseEnabled}
            onChange={(e) => setToolUseEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          <label htmlFor="tool_use_enabled" className="text-label text-text-primary">
            Enable tool-based retrieval
          </label>
        </div>

        <div className="space-y-2">
          <label htmlFor="rubric_cost_cap_cents" className="text-label text-text-secondary block">
            Per-assessment spend cap (cents, 0–500)
          </label>
          <input
            id="rubric_cost_cap_cents"
            type="number"
            min={0}
            max={500}
            step={1}
            value={costCap}
            onChange={(e) => setCostCap(Number(e.target.value))}
            className={`w-32 ${INPUT_CLASSES}`}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="retrieval_timeout_seconds" className="text-label text-text-secondary block">
            Loop timeout (seconds, 10–600)
          </label>
          <input
            id="retrieval_timeout_seconds"
            type="number"
            min={10}
            max={600}
            step={1}
            value={timeout}
            onChange={(e) => setTimeoutSeconds(Number(e.target.value))}
            className={`w-32 ${INPUT_CLASSES}`}
          />
        </div>

        <Button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save retrieval settings'}
        </Button>
      </form>
    </Card>
  );
}
