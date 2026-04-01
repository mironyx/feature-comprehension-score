// Tests for Badge and StatusBadge components.
// Design reference: docs/design/frontend-system.md § Badge / StatusBadge
// Issue: #166

import { describe, it, expect } from 'vitest';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  describe('Given default props', () => {
    it('then renders a span with pill styling', () => {
      const el = Badge({ children: 'Label' });

      expect(el.type).toBe('span');
      expect(el.props.className).toContain('text-caption');
      expect(el.props.className).toContain('font-medium');
      expect(el.props.className).toContain('rounded-sm');
      expect(el.props.className).toContain('px-2');
      expect(el.props.className).toContain('py-0.5');
    });
  });

  describe('Given a custom className', () => {
    it('then appends it to default classes', () => {
      const el = Badge({ className: 'ml-2', children: 'Tag' });

      expect(el.props.className).toContain('rounded-sm');
      expect(el.props.className).toContain('ml-2');
    });
  });
});
