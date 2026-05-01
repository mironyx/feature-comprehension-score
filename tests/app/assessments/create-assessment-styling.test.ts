// Tests for create assessment form styling — verifies design system classes are applied.
// Issue: #208

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// T2.4: assessments/new/ deleted in T2.3 — re-enable after #413 ships
const FORM_PATH = resolve(__dirname, '../../../src/app/(authenticated)/projects/[id]/assessments/new/create-assessment-form.tsx');
const PAGE_PATH = resolve(__dirname, '../../../src/app/(authenticated)/projects/[id]/assessments/new/page.tsx');
const formExists = existsSync(FORM_PATH) && existsSync(PAGE_PATH);
const formSrc = formExists ? readFileSync(FORM_PATH, 'utf8') : '';
const pageSrc = formExists ? readFileSync(PAGE_PATH, 'utf8') : '';

describe.skipIf(!formExists)('Create assessment form styling', () => {
  describe('Given the create assessment form renders', () => {
    it('then inputs use the standard input classes', () => {
      expect(formSrc).toContain('border-border');
      expect(formSrc).toContain('bg-background');
      expect(formSrc).toContain('text-text-primary');
    });

    it('then labels use the label text style', () => {
      expect(formSrc).toContain('text-label');
      expect(formSrc).toContain('text-text-secondary');
    });

    it('then the form has vertical spacing', () => {
      expect(formSrc).toContain('space-y-');
    });

    it('then it uses the Button component for submit', () => {
      expect(formSrc).toContain("from '@/components/ui/button'");
      expect(formSrc).toContain('<Button');
    });

    it('then errors use destructive colour', () => {
      expect(formSrc).toContain('text-destructive');
    });
  });

  describe('Given the new assessment page renders', () => {
    it('then it uses PageHeader and Card', () => {
      expect(pageSrc).toContain("from '@/components/ui");
    });
  });
});
