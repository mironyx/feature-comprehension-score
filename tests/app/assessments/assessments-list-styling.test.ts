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

    it('then it uses Button for the new assessment link', () => {
      expect(src).toContain('Button');
    });

    it('then list items use Card styling', () => {
      expect(src).toContain('Card');
    });

    it('then the success message uses accent colour', () => {
      expect(src).toContain('text-accent');
    });
  });
});
