// Tests for OrgContextForm validation and submit logic.
// Design reference: docs/requirements/v1-prompt-changes.md §Change 2 (UI Surface)
// Issue: #158

import { describe, it, expect } from 'vitest';
import type { OrganisationContext } from '@/lib/engine/prompts';
import {
  validateOrgContext,
} from '@/app/(authenticated)/organisation/org-context-validation';

// ---------------------------------------------------------------------------
// Validation tests
// ---------------------------------------------------------------------------

describe('validateOrgContext', () => {
  describe('Given a valid context with all fields populated', () => {
    it('then it returns no errors', () => {
      const ctx: OrganisationContext = {
        domain_vocabulary: [{ term: 'saga', definition: 'long-running process' }],
        focus_areas: ['API design'],
        exclusions: ['legacy module'],
        domain_notes: 'We use CQRS.',
      };

      expect(validateOrgContext(ctx)).toEqual([]);
    });
  });

  describe('Given an empty context', () => {
    it('then it returns no errors (all fields optional)', () => {
      expect(validateOrgContext({})).toEqual([]);
    });
  });

  describe('Given focus_areas exceeds max 5', () => {
    it('then it returns an error', () => {
      const ctx: OrganisationContext = {
        focus_areas: ['a', 'b', 'c', 'd', 'e', 'f'],
      };

      const errors = validateOrgContext(ctx);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/focus areas/i);
    });
  });

  describe('Given exclusions exceeds max 5', () => {
    it('then it returns an error', () => {
      const ctx: OrganisationContext = {
        exclusions: ['a', 'b', 'c', 'd', 'e', 'f'],
      };

      const errors = validateOrgContext(ctx);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/exclusion/i);
    });
  });

  describe('Given domain_notes exceeds 500 chars', () => {
    it('then it returns an error', () => {
      const ctx: OrganisationContext = {
        domain_notes: 'x'.repeat(501),
      };

      const errors = validateOrgContext(ctx);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/domain notes/i);
    });
  });

  describe('Given a vocabulary entry with empty term', () => {
    it('then it returns an error', () => {
      const ctx: OrganisationContext = {
        domain_vocabulary: [{ term: '', definition: 'something' }],
      };

      const errors = validateOrgContext(ctx);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/term/i);
    });
  });

  describe('Given a vocabulary entry with empty definition', () => {
    it('then it returns an error', () => {
      const ctx: OrganisationContext = {
        domain_vocabulary: [{ term: 'saga', definition: '' }],
      };

      const errors = validateOrgContext(ctx);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/definition/i);
    });
  });

  describe('Given focus_areas with an empty string', () => {
    it('then it returns an error', () => {
      const ctx: OrganisationContext = {
        focus_areas: ['API design', ''],
      };

      const errors = validateOrgContext(ctx);

      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/focus area.*blank/i);
    });
  });
});
