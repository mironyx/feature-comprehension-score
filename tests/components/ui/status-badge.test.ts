// Tests for StatusBadge — assessment status pill with colour tokens.
// Design reference: docs/design/frontend-system.md § Status colours
// Issue: #166

import { describe, it, expect } from 'vitest';
import { StatusBadge } from '@/components/ui/status-badge';

describe('StatusBadge', () => {
  describe('Given status="rubric_generation"', () => {
    it('then renders label "Generating..." with amber colour tokens', () => {
      const el = StatusBadge({ status: 'rubric_generation' });

      expect(el.props.children).toBe('Generating...');
      expect(el.props.style.color).toBe('#f59e0b');
      expect(el.props.style.backgroundColor).toBe('#92400e');
    });
  });

  describe('Given status="awaiting_responses"', () => {
    it('then renders label "Ready" with blue colour tokens', () => {
      const el = StatusBadge({ status: 'awaiting_responses' });

      expect(el.props.children).toBe('Ready');
      expect(el.props.style.color).toBe('#60a5fa');
      expect(el.props.style.backgroundColor).toBe('#1e3a5f');
    });
  });

  describe('Given status="scoring"', () => {
    it('then renders label "Scoring" with purple colour tokens', () => {
      const el = StatusBadge({ status: 'scoring' });

      expect(el.props.children).toBe('Scoring');
      expect(el.props.style.color).toBe('#a78bfa');
      expect(el.props.style.backgroundColor).toBe('#2e1065');
    });
  });

  describe('Given status="ready"', () => {
    it('then renders label "Complete" with green colour tokens', () => {
      const el = StatusBadge({ status: 'ready' });

      expect(el.props.children).toBe('Complete');
      expect(el.props.style.color).toBe('#22c55e');
      expect(el.props.style.backgroundColor).toBe('#052e16');
    });
  });

  describe('Given status="rubric_failed"', () => {
    it('then renders label "Failed" with red colour tokens', () => {
      const el = StatusBadge({ status: 'rubric_failed' });

      expect(el.props.children).toBe('Failed');
      expect(el.props.style.color).toBe('#ef4444');
      expect(el.props.style.backgroundColor).toBe('#450a0a');
    });
  });

  describe('Given an unknown status', () => {
    it('then renders the raw status string with default styling', () => {
      const el = StatusBadge({ status: 'draft' });

      expect(el.props.children).toBe('draft');
      expect(el.props.style.color).toBe('#7a8499');
      expect(el.props.style.backgroundColor).toBe('#1d2232');
    });
  });
});
