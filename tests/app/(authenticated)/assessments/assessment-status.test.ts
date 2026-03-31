// Tests for StatusBadge component — renders status-specific labels.
// Design reference: docs/design/lld-phase-2-demo-ready.md §2a.1
// Issue: #130

import { describe, it, expect } from 'vitest';
import { StatusBadge } from '@/app/(authenticated)/assessments/assessment-status';

describe('StatusBadge', () => {
  it('renders "Generating..." for rubric_generation status', () => {
    const result = StatusBadge({ status: 'rubric_generation' });
    expect(JSON.stringify(result)).toContain('Generating...');
  });

  it('renders "Ready" for awaiting_responses status', () => {
    const result = StatusBadge({ status: 'awaiting_responses' });
    expect(JSON.stringify(result)).toContain('Ready');
  });

  it('renders "Failed" for rubric_failed status', () => {
    const result = StatusBadge({ status: 'rubric_failed' });
    expect(JSON.stringify(result)).toContain('Failed');
  });

  it('renders the raw status for unknown statuses', () => {
    const result = StatusBadge({ status: 'scoring' });
    expect(JSON.stringify(result)).toContain('scoring');
  });
});
