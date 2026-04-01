// Tests for PageHeader — title + optional subtitle + optional action slot.
// Design reference: docs/design/frontend-system.md § PageHeader
// Issue: #166

import { describe, it, expect } from 'vitest';
import { PageHeader } from '@/components/ui/page-header';

describe('PageHeader', () => {
  describe('Given only a title', () => {
    it('then renders a heading with display font classes', () => {
      const el = PageHeader({ title: 'My Assessments' });
      const h1 = el.props.children[0];

      expect(h1.type).toBe('div');
      const heading = h1.props.children[0];
      expect(heading.type).toBe('h1');
      expect(heading.props.className).toContain('text-heading-xl');
      expect(heading.props.className).toContain('font-display');
      expect(heading.props.children).toBe('My Assessments');
    });

    it('then does not render a subtitle paragraph', () => {
      const el = PageHeader({ title: 'Title' });
      const h1 = el.props.children[0];
      const subtitle = h1.props.children[1];

      expect(subtitle).toBeNull();
    });
  });

  describe('Given a title and subtitle', () => {
    it('then renders a subtitle paragraph with secondary text', () => {
      const el = PageHeader({ title: 'Title', subtitle: 'Some description' });
      const left = el.props.children[0];
      const subtitle = left.props.children[1];

      expect(subtitle.type).toBe('p');
      expect(subtitle.props.className).toContain('text-body');
      expect(subtitle.props.className).toContain('text-text-secondary');
      expect(subtitle.props.children).toBe('Some description');
    });
  });

  describe('Given a title and action', () => {
    it('then renders the action element in the right slot', () => {
      const action = 'action-slot';
      const el = PageHeader({ title: 'Title', action });
      const right = el.props.children[1];

      expect(right).toBe(action);
    });
  });
});
