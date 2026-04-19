// Client-side validation for retrieval settings form.
// Mirrors RetrievalSettingsSchema constraints.
// Design reference: docs/design/lld-v2-e17-agentic-retrieval.md §17.2a
// Issue: #251

import type { RetrievalSettings } from '@/app/api/organisations/[id]/retrieval-settings/service';

const MIN_COST_CAP = 0;
const MAX_COST_CAP = 500;
const MIN_TIMEOUT = 10;
const MAX_TIMEOUT = 600;

function validateInt(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max;
}

export function validateRetrievalSettings(settings: RetrievalSettings): string[] {
  const errors: string[] = [];
  if (!validateInt(settings.rubric_cost_cap_cents, MIN_COST_CAP, MAX_COST_CAP)) {
    errors.push(`Per-assessment spend cap must be an integer between ${MIN_COST_CAP} and ${MAX_COST_CAP} cents.`);
  }
  if (!validateInt(settings.retrieval_timeout_seconds, MIN_TIMEOUT, MAX_TIMEOUT)) {
    errors.push(`Loop timeout must be an integer between ${MIN_TIMEOUT} and ${MAX_TIMEOUT} seconds.`);
  }
  return errors;
}
