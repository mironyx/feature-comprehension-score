// Tests for assessments list page styling — verifies design system classes are applied.
// Issue: #208

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(
  resolve(__dirname, '../../../src/app/(authenticated)/assessments/page.tsx'),
  'utf8',
);

describe('Assessments list page styling', () => {
  describe('Given the assessments list page renders', () => {
    it('then it uses PageHeader for the title', () => {
      expect(src).toContain("from '@/components/ui");
      expect(src).toContain('PageHeader');
    });

    it('then list rendering is delegated to ProjectFilter', () => {
      expect(src).toContain('ProjectFilter');
    });

    it('then empty state uses secondary text colour', () => {
      expect(src).toContain('text-text-secondary');
    });
  });
});
