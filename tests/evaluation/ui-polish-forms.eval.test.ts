// Adversarial evaluation tests for issue #208 — UI polish pass.
// AC-1: Forms have consistent, readable layout with proper spacing, labels, and alignment.
// AC-2: Responsive on desktop viewports (mobile not required for V1).
// AC-3: Matches design tokens / component library in use.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Source file cache
// ---------------------------------------------------------------------------

const root = resolve(__dirname, '../../src');

function src(relPath: string): string {
  return readFileSync(resolve(root, relPath), 'utf8');
}

const signInPage     = src('app/auth/sign-in/page.tsx');
const signInButton   = src('app/auth/sign-in/SignInButton.tsx');
const createForm     = src('app/(authenticated)/assessments/new/create-assessment-form.tsx');
const _newPage       = src('app/(authenticated)/assessments/new/page.tsx');
const assessments    = src('app/(authenticated)/assessments/page.tsx');
const retryButton    = src('app/(authenticated)/assessments/retry-button.tsx');
const answeringForm  = src('app/assessments/[id]/answering-form.tsx');
const submittedPage  = src('app/assessments/[id]/submitted/page.tsx');
const orgSelect      = src('app/org-select/page.tsx');
const questionCard   = src('components/question-card.tsx');
const relevanceWarn  = src('components/relevance-warning.tsx');

// ---------------------------------------------------------------------------
// AC-1a: Labels are associated with inputs via matching htmlFor / id pairs
// ---------------------------------------------------------------------------

describe('AC-1a — label/input association in create-assessment-form', () => {
  it('featureName label htmlFor matches the input id', () => {
    expect(createForm).toContain('htmlFor="featureName"');
    expect(createForm).toContain('id="featureName"');
  });

  it('featureDescription label htmlFor matches the textarea id', () => {
    expect(createForm).toContain('htmlFor="featureDescription"');
    expect(createForm).toContain('id="featureDescription"');
  });

  it('repositoryId label htmlFor matches the select id', () => {
    expect(createForm).toContain('htmlFor="repositoryId"');
    expect(createForm).toContain('id="repositoryId"');
  });

  it('prNumbers label htmlFor matches the input id', () => {
    expect(createForm).toContain('htmlFor="prNumbers"');
    expect(createForm).toContain('id="prNumbers"');
  });

  it('participants label htmlFor matches the input id', () => {
    expect(createForm).toContain('htmlFor="participants"');
    expect(createForm).toContain('id="participants"');
  });
});

describe('AC-1a — question card answer textarea has an associated label', () => {
  it('textarea id matches its aria-label or a label element', () => {
    // The textarea uses aria-label rather than a paired label element — verify it is present.
    expect(questionCard).toMatch(/aria-label=.*[Aa]nswer/);
  });
});

// ---------------------------------------------------------------------------
// AC-1b: Required fields carry a visual indicator on their labels
// ---------------------------------------------------------------------------

describe('AC-1b — required fields have a visual indicator on their labels', () => {
  it('feature name label carries a required indicator (*)', () => {
    expect(createForm).toMatch(/Feature name[^"]*\*/);
  });

  it('repository label carries a required indicator (*)', () => {
    expect(createForm).toMatch(/Repository[^"]*\*/);
  });

  it('at-least-one-of helper text is present for PR / issue number inputs', () => {
    // E19.1 (#287): PR numbers and issue numbers are each individually optional,
    // but at least one of them must be provided. A helper text conveys this to the user.
    expect(createForm).toMatch(/at least one of PR numbers or issue numbers/i);
  });

  it('participants label carries a required indicator (*)', () => {
    expect(createForm).toMatch(/[Pp]articipant[^"]*\*/);
  });
});

// ---------------------------------------------------------------------------
// AC-1c: Card/spacing tokens used (not arbitrary spacing values)
// ---------------------------------------------------------------------------

describe('AC-1c — spacing tokens used, not arbitrary pixel values', () => {
  it('create-assessment-form uses section-gap spacing token', () => {
    expect(createForm).toContain('space-y-section-gap');
  });

  it('question-card uses card-pad or space-y tokens', () => {
    expect(questionCard).toMatch(/space-y-|p-card-pad|gap-/);
  });

  it('relevance-warning uses card-pad token for padding', () => {
    expect(relevanceWarn).toContain('p-card-pad');
  });

  it('answering-form uses section-gap for vertical rhythm', () => {
    expect(answeringForm).toContain('space-y-section-gap');
  });
});

// ---------------------------------------------------------------------------
// AC-2: Responsive classes on pages that own their own <main> wrapper
// ---------------------------------------------------------------------------

describe('AC-2 — responsive padding on pages that own their own <main>', () => {
  it('answering-form uses responsive padding (content-pad-sm + md:content-pad)', () => {
    expect(answeringForm).toContain('px-content-pad-sm');
    expect(answeringForm).toMatch(/md:px-content-pad/);
  });

  it('submitted page uses responsive padding (content-pad-sm + md:content-pad)', () => {
    expect(submittedPage).toContain('px-content-pad-sm');
    expect(submittedPage).toMatch(/md:px-content-pad/);
  });

  it('sign-in page uses horizontal padding for narrow viewports', () => {
    expect(signInPage).toContain('px-content-pad-sm');
  });

  it('org-select page uses horizontal padding for narrow viewports', () => {
    expect(orgSelect).toContain('px-content-pad-sm');
  });

  it('answering-form caps width with max-w-page token', () => {
    expect(answeringForm).toContain('max-w-page');
  });

  it('submitted page caps width with max-w-page token', () => {
    expect(submittedPage).toContain('max-w-page');
  });
});

// ---------------------------------------------------------------------------
// AC-3: Design token usage — changed files must not introduce arbitrary colours
// ---------------------------------------------------------------------------

// CSS hex colour: a '#' followed by 3–8 hex digits that is NOT an issue reference.
// Issue refs appear as "// Issue: #NNN" or "// Issues: #NNN" — exclude those lines.
function hasHardcodedColour(source: string): boolean {
  return source
    .split('\n')
    .filter(line => !/^\s*\/\/.*#\d/.test(line)) // exclude comment lines with #NNN refs
    .some(line => /#[0-9a-fA-F]{3,8}\b/.test(line));
}

describe('AC-3 — no hardcoded hex colours in changed source files', () => {
  it('sign-in page has no hardcoded hex colours', () => {
    expect(hasHardcodedColour(signInPage)).toBe(false);
  });

  it('SignInButton has no hardcoded hex colours', () => {
    expect(hasHardcodedColour(signInButton)).toBe(false);
  });

  it('create-assessment-form has no hardcoded hex colours', () => {
    expect(hasHardcodedColour(createForm)).toBe(false);
  });

  it('assessments page has no hardcoded hex colours', () => {
    expect(hasHardcodedColour(assessments)).toBe(false);
  });

  it('retry-button has no hardcoded hex colours', () => {
    expect(hasHardcodedColour(retryButton)).toBe(false);
  });

  it('answering-form has no hardcoded hex colours', () => {
    expect(hasHardcodedColour(answeringForm)).toBe(false);
  });

  it('submitted page has no hardcoded hex colours', () => {
    expect(hasHardcodedColour(submittedPage)).toBe(false);
  });

  it('org-select page has no hardcoded hex colours', () => {
    expect(hasHardcodedColour(orgSelect)).toBe(false);
  });

  it('question-card has no hardcoded hex colours', () => {
    expect(hasHardcodedColour(questionCard)).toBe(false);
  });

  it('relevance-warning has no hardcoded hex colours', () => {
    expect(hasHardcodedColour(relevanceWarn)).toBe(false);
  });
});

describe('AC-3 — UI component tokens used in changed files', () => {
  it('retry-button uses Button from design system', () => {
    expect(retryButton).toContain("from '@/components/ui/button'");
    expect(retryButton).toContain('<Button');
  });

  it('retry-button error uses design token colours, not arbitrary ones', () => {
    expect(retryButton).toContain('text-destructive');
  });

  it('org-select list items use design token border and hover colours', () => {
    expect(orgSelect).toContain('border-border');
    expect(orgSelect).toContain('hover:border-accent');
  });

  it('org-select uses surface token for item background', () => {
    expect(orgSelect).toContain('bg-surface');
  });

  it('submitted page heading uses success colour token', () => {
    expect(submittedPage).toContain('text-success');
  });

  it('submitted page uses display font for heading', () => {
    expect(submittedPage).toContain('font-display');
  });
});

// ---------------------------------------------------------------------------
// AC-3: Pages outside the authenticated layout must not use arbitrary inline styles
// ---------------------------------------------------------------------------

describe('AC-3 — no inline style attributes in changed source files', () => {
  const INLINE_STYLE = /style=\{/;

  it('sign-in page has no inline style', () => {
    expect(signInPage).not.toMatch(INLINE_STYLE);
  });

  it('create-assessment-form has no inline style', () => {
    expect(createForm).not.toMatch(INLINE_STYLE);
  });

  it('answering-form has no inline style', () => {
    expect(answeringForm).not.toMatch(INLINE_STYLE);
  });

  it('org-select page has no inline style', () => {
    expect(orgSelect).not.toMatch(INLINE_STYLE);
  });

  it('question-card has no inline style', () => {
    expect(questionCard).not.toMatch(INLINE_STYLE);
  });
});
