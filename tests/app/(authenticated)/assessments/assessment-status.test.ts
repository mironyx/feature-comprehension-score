// Tests for StatusBadge re-export — verifies the re-export works.
// Full StatusBadge tests are in tests/components/ui/status-badge.test.ts
// Issue: #166 (updated from #130)

import { describe, it, expect } from 'vitest';
import { StatusBadge } from '@/app/(authenticated)/assessments/assessment-status';

describe('StatusBadge (re-export)', () => {
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

  it('renders "Scoring" for scoring status', () => {
    const result = StatusBadge({ status: 'scoring' });
    expect(JSON.stringify(result)).toContain('Scoring');
  });
});
