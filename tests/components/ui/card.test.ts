// Tests for Card component — surface container.
// Design reference: docs/design/frontend-system.md § Card
// Issue: #166

import { describe, it, expect } from 'vitest';
import { Card } from '@/components/ui/card';

describe('Card', () => {
  describe('Given default props', () => {
    it('then renders a div with surface styling', () => {
      const el = Card({ children: 'Content' });

      expect(el.type).toBe('div');
      expect(el.props.className).toContain('bg-surface');
      expect(el.props.className).toContain('border');
      expect(el.props.className).toContain('border-border');
      expect(el.props.className).toContain('rounded-md');
      expect(el.props.className).toContain('shadow-sm');
      expect(el.props.className).toContain('p-card-pad');
    });
  });

  describe('Given a custom className', () => {
    it('then appends it to the default classes', () => {
      const el = Card({ className: 'mt-4', children: 'Content' });

      expect(el.props.className).toContain('bg-surface');
      expect(el.props.className).toContain('mt-4');
    });
  });
});
