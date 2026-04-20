// Pipeline progress step → human-readable label mapping for the client.
// V2 Epic 18, Story 18.3. See docs/design/lld-e18.md §18.3.

export const STALE_THRESHOLD_MS = 240_000;

const PROGRESS_LABELS: Record<string, string> = {
  artefact_extraction: 'Extracting artefacts from repository',
  llm_request: 'Waiting for LLM response',
  llm_tool_call: 'Retrieving additional files from repository',
  rubric_parsing: 'Processing LLM response',
  persisting: 'Saving results',
};

export function getProgressLabel(step: string | null | undefined): string | null {
  if (!step) return null;
  return PROGRESS_LABELS[step] ?? null;
}

export function isProgressStale(
  updatedAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!updatedAt) return false;
  const updatedMs = Date.parse(updatedAt);
  if (Number.isNaN(updatedMs)) return false;
  return now - updatedMs > STALE_THRESHOLD_MS;
}
