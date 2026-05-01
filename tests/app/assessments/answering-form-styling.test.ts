// Tests for answering form styling — verifies design system classes are applied.
// Issue: #208

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const formSrc = readFileSync(
  resolve(__dirname, '../../../src/app/(authenticated)/projects/[id]/assessments/[aid]/answering-form.tsx'),
  'utf8',
);

const questionSrc = readFileSync(
  resolve(__dirname, '../../../src/components/question-card.tsx'),
  'utf8',
);

const warningSrc = readFileSync(
  resolve(__dirname, '../../../src/components/relevance-warning.tsx'),
  'utf8',
);

describe('Answering form styling', () => {
  describe('Given the answering form renders', () => {
    it('then the header uses display font and spacing', () => {
      expect(formSrc).toContain('font-display');
      expect(formSrc).toContain('text-text-secondary');
    });

    it('then it uses the Button component', () => {
      expect(formSrc).toContain("from '@/components/ui/button'");
      expect(formSrc).toContain('<Button');
    });

    it('then error alerts use destructive styling', () => {
      expect(formSrc).toContain('text-destructive');
    });
  });

  describe('Given a question card renders', () => {
    it('then the card uses Card component or surface styling', () => {
      expect(questionSrc).toMatch(/Card|bg-surface/);
    });

    it('then the textarea uses standard input styling', () => {
      expect(questionSrc).toContain('border-border');
      expect(questionSrc).toContain('bg-background');
    });

    it('then the Naur layer uses Badge', () => {
      expect(questionSrc).toContain('Badge');
    });
  });

  describe('Given a relevance warning renders', () => {
    it('then it uses destructive colour tokens', () => {
      expect(warningSrc).toContain('destructive');
    });
  });
});
