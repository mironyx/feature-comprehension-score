// StatusBadge — assessment status pill with colour tokens from the spec.
// Design reference: docs/design/frontend-system.md § Status colours
// Issue: #166

import { Badge } from './badge';

interface StatusConfig {
  label: string;
  color: string;
  backgroundColor: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  rubric_generation: { label: 'Generating...', color: '#f59e0b', backgroundColor: '#92400e' },
  awaiting_responses: { label: 'Ready', color: '#60a5fa', backgroundColor: '#1e3a5f' },
  scoring: { label: 'Scoring', color: '#a78bfa', backgroundColor: '#2e1065' },
  ready: { label: 'Complete', color: '#22c55e', backgroundColor: '#052e16' },
  rubric_failed: { label: 'Failed', color: '#ef4444', backgroundColor: '#450a0a' },
};

const DEFAULT_CONFIG: StatusConfig = {
  label: '',
  color: '#7a8499',
  backgroundColor: '#1d2232',
};

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_MAP[status] ?? { ...DEFAULT_CONFIG, label: status };

  return (
    <Badge style={{ color: config.color, backgroundColor: config.backgroundColor }}>
      {config.label}
    </Badge>
  );
}
