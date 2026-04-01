// Tests for Button component — variant and size classes.
// Design reference: docs/design/frontend-system.md § Button variants
// Issue: #166

import { describe, it, expect } from 'vitest';
import { Button } from '@/components/ui/button';

describe('Button', () => {
  describe('Given default props', () => {
    it('then renders a button with primary variant classes', () => {
      const el = Button({ children: 'Click' });

      expect(el.type).toBe('button');
      expect(el.props.className).toContain('bg-accent');
      expect(el.props.className).toContain('text-background');
    });

    it('then renders with md size by default (h-9)', () => {
      const el = Button({ children: 'Click' });

      expect(el.props.className).toContain('h-9');
      expect(el.props.className).toContain('px-3.5');
    });
  });

  describe('Given variant="secondary"', () => {
    it('then renders with border and transparent background', () => {
      const el = Button({ variant: 'secondary', children: 'Cancel' });

      expect(el.props.className).toContain('border');
      expect(el.props.className).toContain('border-border');
      expect(el.props.className).toContain('text-text-primary');
    });
  });

  describe('Given variant="destructive"', () => {
    it('then renders with destructive background and white text', () => {
      const el = Button({ variant: 'destructive', children: 'Delete' });

      expect(el.props.className).toContain('bg-destructive');
      expect(el.props.className).toContain('text-white');
    });
  });

  describe('Given variant="ghost"', () => {
    it('then renders with transparent background and secondary text', () => {
      const el = Button({ variant: 'ghost', children: 'More' });

      expect(el.props.className).toContain('text-text-secondary');
      expect(el.props.className).not.toContain('border-border');
    });
  });

  describe('Given size="sm"', () => {
    it('then renders with smaller height', () => {
      const el = Button({ size: 'sm', children: 'Small' });

      expect(el.props.className).toContain('h-8');
      expect(el.props.className).toContain('px-2.5');
    });
  });

  describe('Given extra HTML attributes', () => {
    it('then passes them through to the button element', () => {
      const el = Button({ type: 'submit', disabled: true, children: 'Go' });

      expect(el.props.type).toBe('submit');
      expect(el.props.disabled).toBe(true);
    });
  });
});
