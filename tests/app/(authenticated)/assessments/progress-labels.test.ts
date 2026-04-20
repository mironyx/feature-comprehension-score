// Tests for getProgressLabel, isProgressStale, and STALE_THRESHOLD_MS.
// V2 Epic 18, Story 18.3. Issue: #274

import { describe, it, expect } from 'vitest';
import {
  getProgressLabel,
  isProgressStale,
  STALE_THRESHOLD_MS,
} from '@/app/(authenticated)/assessments/progress-labels';

// ---------------------------------------------------------------------------
// STALE_THRESHOLD_MS constant
// ---------------------------------------------------------------------------

describe('STALE_THRESHOLD_MS', () => {
  it('equals 240_000 (240 seconds in milliseconds)', () => {
    // AC 17 [req §18.3, lld §18.3]: fixed threshold of 240 seconds
    expect(STALE_THRESHOLD_MS).toBe(240_000);
  });
});

// ---------------------------------------------------------------------------
// getProgressLabel
// ---------------------------------------------------------------------------

describe('getProgressLabel', () => {
  describe("Given step='artefact_extraction'", () => {
    it("then returns 'Extracting artefacts from repository'", () => {
      // AC 9 [req §18.3 progress label table]
      expect(getProgressLabel('artefact_extraction')).toBe(
        'Extracting artefacts from repository',
      );
    });
  });

  describe("Given step='llm_request'", () => {
    it("then returns 'Waiting for LLM response'", () => {
      // AC 10 [req §18.3 progress label table]
      expect(getProgressLabel('llm_request')).toBe('Waiting for LLM response');
    });
  });

  describe("Given step='llm_tool_call'", () => {
    it("then returns 'Retrieving additional files from repository'", () => {
      // AC 11 [req §18.3 progress label table]
      expect(getProgressLabel('llm_tool_call')).toBe(
        'Retrieving additional files from repository',
      );
    });
  });

  describe("Given step='rubric_parsing'", () => {
    it("then returns 'Processing LLM response'", () => {
      // AC 12 [req §18.3 progress label table]
      expect(getProgressLabel('rubric_parsing')).toBe('Processing LLM response');
    });
  });

  describe("Given step='persisting'", () => {
    it("then returns 'Saving results'", () => {
      // AC 13 [req §18.3 progress label table]
      expect(getProgressLabel('persisting')).toBe('Saving results');
    });
  });

  describe('Given step=null', () => {
    it('then returns null', () => {
      // AC 14 [req §18.3: null progress → no progress shown]
      expect(getProgressLabel(null)).toBeNull();
    });
  });

  describe('Given step=undefined', () => {
    it('then returns null', () => {
      // AC 14 [lld §18.3: missing/undefined treated same as null]
      expect(getProgressLabel(undefined)).toBeNull();
    });
  });

  describe("Given step='unknown_step' (unrecognised value)", () => {
    it('then returns null', () => {
      // AC 15 [lld §18.3: unknown steps have no label]
      expect(getProgressLabel('unknown_step')).toBeNull();
    });
  });

  describe("Given step='' (empty string)", () => {
    it('then returns null', () => {
      // AC 14/15: empty string treated as missing [lld §18.3]
      expect(getProgressLabel('')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// isProgressStale
// ---------------------------------------------------------------------------

describe('isProgressStale', () => {
  describe('Given updatedAt is null', () => {
    it('then returns false', () => {
      // AC 16 [req §18.3: null → not stale]
      expect(isProgressStale(null)).toBe(false);
    });
  });

  describe('Given updatedAt is undefined', () => {
    it('then returns false', () => {
      // AC 16 [lld §18.3: undefined treated same as null]
      expect(isProgressStale(undefined)).toBe(false);
    });
  });

  describe('Given updatedAt is exactly STALE_THRESHOLD_MS ago (boundary: not yet stale)', () => {
    it('then returns false', () => {
      // AC 16 [req §18.3: ≤ 240s → false; boundary is exclusive >]
      const now = Date.now();
      const updatedAt = new Date(now - STALE_THRESHOLD_MS).toISOString();
      expect(isProgressStale(updatedAt, now)).toBe(false);
    });
  });

  describe('Given updatedAt is 241 seconds ago (just over threshold)', () => {
    it('then returns true', () => {
      // AC 16 [req §18.3: > 240s → true]
      const now = Date.now();
      const updatedAt = new Date(now - (STALE_THRESHOLD_MS + 1_000)).toISOString();
      expect(isProgressStale(updatedAt, now)).toBe(true);
    });
  });

  describe('Given updatedAt is 10 seconds ago (well within threshold)', () => {
    it('then returns false', () => {
      // AC 16 [req §18.3: ≤ 240s → false]
      const now = Date.now();
      const updatedAt = new Date(now - 10_000).toISOString();
      expect(isProgressStale(updatedAt, now)).toBe(false);
    });
  });

  describe('Given updatedAt is 300 seconds ago (well over threshold)', () => {
    it('then returns true', () => {
      // AC 16 [req §18.3: > 240s → true]
      const now = Date.now();
      const updatedAt = new Date(now - 300_000).toISOString();
      expect(isProgressStale(updatedAt, now)).toBe(true);
    });
  });

  describe('Given updatedAt is in the future (clock skew)', () => {
    it('then returns false', () => {
      // AC 16 [lld §18.3: future timestamp → difference is negative → not stale]
      const now = Date.now();
      const updatedAt = new Date(now + 5_000).toISOString();
      expect(isProgressStale(updatedAt, now)).toBe(false);
    });
  });
});
