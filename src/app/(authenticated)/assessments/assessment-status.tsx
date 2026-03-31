// StatusBadge — renders assessment status as a human-readable label.
// Design reference: docs/design/lld-phase-2-demo-ready.md §2a.1
// Issue: #130

const STATUS_LABELS: Record<string, string> = {
  rubric_generation: 'Generating...',
  awaiting_responses: 'Ready',
};

export function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status;
  const muted = status === 'rubric_generation';

  return <span style={{ opacity: muted ? 0.6 : 1 }}>{label}</span>;
}
