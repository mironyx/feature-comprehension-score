// Tests for sign-in page styling — verifies design system classes are applied.
// Issue: #208

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(
  resolve(__dirname, '../../../../src/app/auth/sign-in/page.tsx'),
  'utf8',
);

const btnSrc = readFileSync(
  resolve(__dirname, '../../../../src/app/auth/sign-in/SignInButton.tsx'),
  'utf8',
);

describe('Sign-in page styling', () => {
  describe('Given the sign-in page renders', () => {
    it('then it centres content with flex layout', () => {
      expect(src).toContain('flex');
      expect(src).toContain('items-center');
      expect(src).toContain('justify-center');
    });

    it('then the heading uses display font', () => {
      expect(src).toContain('font-display');
    });

    it('then error messages use destructive colour', () => {
      expect(src).toContain('text-destructive');
    });
  });

  describe('Given the SignInButton renders', () => {
    it('then it imports and uses the Button component', () => {
      expect(btnSrc).toContain("from '@/components/ui/button'");
      expect(btnSrc).toContain('<Button');
    });
  });
});
