// Tests for assessment pages layout restructure — verifies the three assessment pages
// live under the (authenticated) route group so the auth layout (NavBar + Breadcrumbs)
// wraps them, and that the pages no longer render their own <main> wrapper (the layout
// already provides one).
// Design reference: docs/design/lld-v7-frontend-ux.md § T2
// Issue: #341

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '../../../../..');

const AUTHED_BASE = 'src/app/(authenticated)/assessments/[id]';
const LEGACY_BASE = 'src/app/assessments/[id]';

const ANSWERING_PAGE = `${AUTHED_BASE}/page.tsx`;
const ANSWERING_FORM = `${AUTHED_BASE}/answering-form.tsx`;
const RESULTS_PAGE = `${AUTHED_BASE}/results/page.tsx`;
const SUBMITTED_PAGE = `${AUTHED_BASE}/submitted/page.tsx`;
const AUTH_LAYOUT = 'src/app/(authenticated)/layout.tsx';

function readSrc(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('Assessment page layout restructure (#341)', () => {
  describe('Given the (authenticated) route group provides NavBar', () => {
    it('then the assessment answering page lives under (authenticated)/', () => {
      expect(existsSync(resolve(ROOT, ANSWERING_PAGE))).toBe(true);
    });

    it('then the results page lives under (authenticated)/', () => {
      expect(existsSync(resolve(ROOT, RESULTS_PAGE))).toBe(true);
    });

    it('then the submitted page lives under (authenticated)/', () => {
      expect(existsSync(resolve(ROOT, SUBMITTED_PAGE))).toBe(true);
    });

    it('then the (authenticated) layout renders NavBar', () => {
      const layoutSrc = readSrc(AUTH_LAYOUT);
      expect(layoutSrc).toContain('<NavBar');
    });

    it('then no assessment [id] pages remain at the legacy location', () => {
      expect(existsSync(resolve(ROOT, `${LEGACY_BASE}/page.tsx`))).toBe(false);
      expect(existsSync(resolve(ROOT, `${LEGACY_BASE}/results/page.tsx`))).toBe(false);
      expect(existsSync(resolve(ROOT, `${LEGACY_BASE}/submitted/page.tsx`))).toBe(false);
    });
  });

  describe('Given the (authenticated) layout already provides a <main> wrapper', () => {
    it('then the answering form does not render its own <main>', () => {
      expect(readSrc(ANSWERING_FORM)).not.toMatch(/<main\b/);
    });

    it('then the answering page sub-views do not render <main>', () => {
      expect(readSrc(ANSWERING_PAGE)).not.toMatch(/<main\b/);
    });

    it('then the results page does not render <main>', () => {
      expect(readSrc(RESULTS_PAGE)).not.toMatch(/<main\b/);
    });

    it('then the submitted page does not render <main>', () => {
      expect(readSrc(SUBMITTED_PAGE)).not.toMatch(/<main\b/);
    });
  });
});
