// Tests for Tabs component + organisation-page tab integration.
// Design reference: docs/design/lld-v7-frontend-ux.md §T8
// Requirements reference: docs/requirements/v7-requirements.md §Epic 4 Story 4.1
// Issue: #347

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ---------------------------------------------------------------------------
// File-level module mocks — hoisted by vitest before all imports.
//
// Ordering notes:
//  - next/navigation is mocked for BOTH Part 1 (Tabs hooks) and Part 2 (page
//    redirect / forbidden).  The factory supplies all consumers in one place.
//  - react's useState is stubbed so the Tabs component body can be called
//    synchronously in the node environment.
//  - @/components/ui/tabs is mocked with a string-typed export so that when
//    the organisation page JSX renders <Tabs ...>, the element type is the
//    literal string "Tabs" — which JSON.stringify preserves verbatim,
//    enabling prop assertions in Part 2.
//    Part 1 obtains the REAL Tabs via vi.importActual inside each test.
// ---------------------------------------------------------------------------

const mockSearchParamsGet = vi.fn((_key: string): string | null => null);

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  forbidden: vi.fn(() => {
    throw new Error('NEXT_FORBIDDEN');
  }),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  useSearchParams: vi.fn(() => ({ get: mockSearchParamsGet })),
}));

// Stub useState: returns [initialValue, noopSetter].
// The component always renders with the initial state derived from props/URL —
// exactly what is needed to assert the rendering contract.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useState: vi.fn((initial: unknown) => [initial, vi.fn()]),
  };
});

// String-typed Tabs mock — see ordering note above.
vi.mock('@/components/ui/tabs', () => ({
  Tabs: 'Tabs',
}));

// Organisation page dependencies (Part 2):
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/org-context', () => ({
  getSelectedOrgId: vi.fn(),
}));

vi.mock('@/lib/supabase/org-prompt-context', () => ({
  loadOrgPromptContext: vi.fn(),
}));

vi.mock('@/lib/supabase/org-retrieval-settings', () => ({
  loadOrgRetrievalSettings: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: unknown }) => ({
    type: 'a',
    props: { href, children },
  }),
}));

vi.mock('@/app/(authenticated)/organisation/load-assessments', () => ({
  loadOrgAssessmentsOverview: vi.fn().mockResolvedValue([]),
}));

vi.mock(
  '@/app/(authenticated)/organisation/org-context-form',
  () => ({ default: 'OrgContextForm' }),
);

vi.mock(
  '@/app/(authenticated)/organisation/retrieval-settings-form',
  () => ({ default: 'RetrievalSettingsForm' }),
);

vi.mock(
  '@/app/(authenticated)/organisation/deleteable-assessment-table',
  () => ({ DeleteableAssessmentTable: 'DeleteableAssessmentTable' }),
);

vi.mock(
  '@/app/(authenticated)/organisation/assessment-overview-table',
  () => ({ AssessmentOverviewTable: 'AssessmentOverviewTable' }),
);

// ---------------------------------------------------------------------------
// Part 1 — Tabs component (standalone)
//
// The file-level mock for @/components/ui/tabs returns the string "Tabs".
// Part 1 tests bypass it by calling vi.importActual to get the real function.
// The real function currently throws "not implemented" — every rendering test
// in Part 1 should therefore fail with that error, confirming tests are wired
// correctly and not vacuously passing.
// ---------------------------------------------------------------------------

import type { ReactElement } from 'react';
import type { TabsProps } from '@/components/ui/tabs';

function makeTabs(overrides: Partial<TabsProps> = {}): TabsProps {
  return {
    tabs: [
      { id: 'alpha', label: 'Alpha', content: 'Alpha content' },
      { id: 'beta', label: 'Beta', content: 'Beta content' },
      { id: 'gamma', label: 'Gamma', content: 'Gamma content' },
    ],
    ...overrides,
  };
}

async function renderTabs(props: TabsProps): Promise<string> {
  // importActual bypasses the string mock and loads the real implementation.
  const { Tabs } = await vi.importActual<typeof import('@/components/ui/tabs')>(
    '@/components/ui/tabs',
  );
  return renderToStaticMarkup(Tabs(props) as ReactElement);
}

describe('Tabs component (§T8, #347)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockSearchParamsGet so each test starts with no URL query param.
    mockSearchParamsGet.mockReturnValue(null);
  });

  // -------------------------------------------------------------------------
  // Property 1: All tab labels are rendered [req §Epic 4 S4.1 / lld §T8]
  // -------------------------------------------------------------------------

  describe('Given a Tabs component with three tabs', () => {
    it('then all tab labels are present in the rendered output', async () => {
      // AC: all tab labels must appear in the tab bar
      // [req §Epic 4 S4.1 "three tabs are displayed", lld §T8 "renders all tab labels"]
      const html = await renderTabs(makeTabs());
      expect(html).toContain('Alpha');
      expect(html).toContain('Beta');
      expect(html).toContain('Gamma');
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: Tab bar container has required CSS classes [lld §T8]
  // -------------------------------------------------------------------------

  describe('Given any Tabs component', () => {
    it('then the tab bar carries flex and bottom-border classes', async () => {
      // AC: Tab bar: `flex border-b border-border` [lld §T8 Styling]
      const html = await renderTabs(makeTabs());
      expect(html).toContain('flex');
      expect(html).toContain('border-b');
      expect(html).toContain('border-border');
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: Tab panels container carries py-section-gap [lld §T8]
  // -------------------------------------------------------------------------

  describe('Given any Tabs component', () => {
    it('then the tab panels container carries py-section-gap', async () => {
      // AC: Tab panels container: `py-section-gap` [lld §T8 Styling]
      const html = await renderTabs(makeTabs());
      expect(html).toContain('py-section-gap');
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: defaultTab supplied — that tab is active on mount [lld §T8]
  // -------------------------------------------------------------------------

  describe('Given defaultTab="beta" and no URL query param', () => {
    it('then the beta tab content is visible', async () => {
      // AC: "shows the default tab content on mount" [lld §T8 BDD spec]
      // [req §Epic 4 S4.1 "Assessments tab is active (default)"]
      const html = await renderTabs(makeTabs({ defaultTab: 'beta' }));
      expect(html).toContain('Beta content');
    });

    it('then the non-default tabs content is NOT rendered', async () => {
      // AC: "Only the active tab's content is visible" [req §Epic 4 S4.1]
      const html = await renderTabs(makeTabs({ defaultTab: 'beta' }));
      expect(html).not.toContain('Alpha content');
      expect(html).not.toContain('Gamma content');
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: defaultTab absent — first tab is active [lld §T8]
  // -------------------------------------------------------------------------

  describe('Given no defaultTab and no URL query param', () => {
    it('then the first tab content is visible by default', async () => {
      // AC: falls back to tabs[0].id when defaultTab is not supplied [lld §T8]
      const html = await renderTabs(makeTabs({ defaultTab: undefined }));
      expect(html).toContain('Alpha content');
    });

    it('then the non-first tab content is NOT rendered', async () => {
      // Prohibition: non-active tab content must not appear [req §Epic 4 S4.1]
      const html = await renderTabs(makeTabs({ defaultTab: undefined }));
      expect(html).not.toContain('Beta content');
      expect(html).not.toContain('Gamma content');
    });
  });

  // -------------------------------------------------------------------------
  // Property 6: URL query param overrides defaultTab when queryParam is set
  // -------------------------------------------------------------------------

  describe('Given queryParam="tab" and URL has ?tab=gamma', () => {
    it('then the gamma tab content is shown (URL param overrides defaultTab)', async () => {
      // AC: "deep links to specific tabs work (initial active tab read from URL)"
      // [req §Epic 4 S4.1, lld §T8 "queryParam — syncs active tab to URL ?tab=context"]
      mockSearchParamsGet.mockImplementation((key: string) =>
        key === 'tab' ? 'gamma' : null,
      );
      const html = await renderTabs(makeTabs({ defaultTab: 'alpha', queryParam: 'tab' }));
      expect(html).toContain('Gamma content');
      expect(html).not.toContain('Alpha content');
    });
  });

  // -------------------------------------------------------------------------
  // Property 7: URL param with no matching tab — defaultTab wins [lld §T8]
  // -------------------------------------------------------------------------

  describe('Given queryParam="tab" and URL has ?tab=nonexistent', () => {
    it('then the defaultTab content is shown (unrecognised URL value falls back)', async () => {
      // AC: "URL param with no matching value → defaultTab (or tabs[0]) wins"
      // [lld §T8, issue acceptance criteria]
      mockSearchParamsGet.mockImplementation((key: string) =>
        key === 'tab' ? 'nonexistent' : null,
      );
      const html = await renderTabs(makeTabs({ defaultTab: 'beta', queryParam: 'tab' }));
      expect(html).toContain('Beta content');
      expect(html).not.toContain('Gamma content');
    });
  });

  // -------------------------------------------------------------------------
  // Property 8: URL param ignored when queryParam is NOT set [lld §T8]
  // -------------------------------------------------------------------------

  describe('Given queryParam is not set but URL has ?tab=gamma', () => {
    it('then the defaultTab is used — URL param is ignored', async () => {
      // AC: "URL param ignored when queryParam absent" [issue acceptance criteria]
      mockSearchParamsGet.mockImplementation((key: string) =>
        key === 'tab' ? 'gamma' : null,
      );
      const html = await renderTabs(makeTabs({ defaultTab: 'alpha', queryParam: undefined }));
      expect(html).toContain('Alpha content');
      expect(html).not.toContain('Gamma content');
    });
  });

  // -------------------------------------------------------------------------
  // Property 9: Active tab carries accent styling [req §Epic 4 S4.1 / lld §T8]
  // -------------------------------------------------------------------------

  describe('Given the alpha tab is active', () => {
    it('then the active tab button carries accent text and bottom-border classes', async () => {
      // AC: "Active tab has accent styling (bottom border)" [lld §T8, issue AC]
      // Expected classes: text-accent border-b-2 border-accent
      const html = await renderTabs(makeTabs({ defaultTab: 'alpha' }));
      expect(html).toContain('text-accent');
      expect(html).toContain('border-b-2');
      expect(html).toContain('border-accent');
    });
  });

  // -------------------------------------------------------------------------
  // Property 10: Inactive tabs carry secondary text classes [lld §T8]
  // -------------------------------------------------------------------------

  describe('Given the alpha tab is active and beta is inactive', () => {
    it('then an inactive tab carries text-text-secondary class', async () => {
      // AC: "Inactive tabs: text-text-secondary hover:text-text-primary" [lld §T8]
      const html = await renderTabs(makeTabs({ defaultTab: 'alpha' }));
      expect(html).toContain('text-text-secondary');
    });

    it('then an inactive tab carries hover:text-text-primary class', async () => {
      // AC: "Inactive tabs: ... hover:text-text-primary" [lld §T8]
      const html = await renderTabs(makeTabs({ defaultTab: 'alpha' }));
      expect(html).toContain('hover:text-text-primary');
    });
  });

  // -------------------------------------------------------------------------
  // Property 11: Tab switching is client-side — tabs are buttons, not anchors
  // -------------------------------------------------------------------------

  describe('Given any Tabs component', () => {
    it('then each tab trigger is rendered as a <button> element, not an <a>', async () => {
      // AC: "Tab switching is client-side (no page reload — must be button or click
      //     handler, not anchor <a>)" [issue acceptance criteria]
      const html = await renderTabs(makeTabs());
      // All three tab labels appear inside button elements, not anchor tags.
      expect(html).toContain('<button');
      expect(html).not.toMatch(/<a\s[^>]*>Alpha<\/a>/);
      expect(html).not.toMatch(/<a\s[^>]*>Beta<\/a>/);
      expect(html).not.toMatch(/<a\s[^>]*>Gamma<\/a>/);
    });
  });

  // -------------------------------------------------------------------------
  // Property 12: aria-selected="true" only on active tab [ARIA / accessibility]
  // -------------------------------------------------------------------------

  describe('Given the beta tab is active', () => {
    it('then aria-selected="true" appears exactly once (on the active tab)', async () => {
      // AC: "aria-selected="true" only on active tab" [issue acceptance criteria]
      const html = await renderTabs(makeTabs({ defaultTab: 'beta' }));
      const trueCount = (html.match(/aria-selected="true"/g) ?? []).length;
      expect(trueCount).toBe(1);
    });

    it('then aria-selected="false" appears on inactive tabs', async () => {
      // AC: complementary to aria-selected="true" above — 2 inactive tabs
      const html = await renderTabs(makeTabs({ defaultTab: 'beta' }));
      const falseCount = (html.match(/aria-selected="false"/g) ?? []).length;
      expect(falseCount).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Property 13: ARIA roles — tablist / tab / tabpanel [issue acceptance criteria]
  // -------------------------------------------------------------------------

  describe('Given any Tabs component', () => {
    it('then there is a role="tablist" element wrapping the tab triggers', async () => {
      // AC: "role="tab" / role="tablist" / role="tabpanel" if present in spec"
      // [issue acceptance criteria — ARIA landmarks]
      const html = await renderTabs(makeTabs());
      expect(html).toContain('role="tablist"');
    });

    it('then each tab trigger has role="tab"', async () => {
      // AC: role="tab" on individual tab triggers [issue acceptance criteria]
      const html = await renderTabs(makeTabs());
      const tabRoleCount = (html.match(/role="tab"/g) ?? []).length;
      expect(tabRoleCount).toBe(3); // one per tab
    });

    it('then the active panel has role="tabpanel"', async () => {
      // AC: role="tabpanel" on content panel [issue acceptance criteria]
      const html = await renderTabs(makeTabs({ defaultTab: 'alpha' }));
      expect(html).toContain('role="tabpanel"');
    });
  });
});

// ---------------------------------------------------------------------------
// Part 2 — Organisation page integration (#347)
//
// The page is a Next.js server component.  All child dependencies are mocked
// at file scope above.  Tabs is mocked as the string "Tabs" — the page's JSX
// produces { type: "Tabs", props: { tabs, defaultTab, queryParam } } which
// survives JSON.stringify verbatim, enabling prop-level assertions.
// ---------------------------------------------------------------------------

const ORG_ID = 'org-001';
const USER_ID = 'user-001';
const mockCookieStore = {};

const DEFAULT_RETRIEVAL = {
  tool_use_enabled: false,
  rubric_cost_cap_cents: 20,
  retrieval_timeout_seconds: 120,
};

function makeAdminClient() {
  const user = {
    id: USER_ID,
    user_metadata: { user_name: 'alice', provider_id: '42' },
  };
  const membership = [{ org_id: ORG_ID, github_role: 'admin' }];
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: membership, error: null }),
        }),
      }),
    }),
  };
}

async function renderOrgPage(): Promise<unknown> {
  // Wire up the already-mocked modules for this render.
  const { createServerSupabaseClient } = await import('@/lib/supabase/server');
  const { getSelectedOrgId } = await import('@/lib/supabase/org-context');
  const { loadOrgPromptContext } = await import('@/lib/supabase/org-prompt-context');
  const { loadOrgRetrievalSettings } = await import('@/lib/supabase/org-retrieval-settings');
  const { cookies } = await import('next/headers');
  const { loadOrgAssessmentsOverview } = await import(
    '@/app/(authenticated)/organisation/load-assessments'
  );

  vi.mocked(createServerSupabaseClient).mockResolvedValue(makeAdminClient() as never);
  vi.mocked(getSelectedOrgId).mockReturnValue(ORG_ID);
  vi.mocked(loadOrgPromptContext).mockResolvedValue(undefined);
  vi.mocked(loadOrgRetrievalSettings).mockResolvedValue(DEFAULT_RETRIEVAL);
  vi.mocked(loadOrgAssessmentsOverview).mockResolvedValue([]);
  vi.mocked(cookies).mockResolvedValue(mockCookieStore as never);

  const { default: OrganisationPage } = await import(
    '@/app/(authenticated)/organisation/page'
  );
  return OrganisationPage();
}

describe('Organisation page — tabs integration (#347)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Property 14: Page renders a Tabs element (not three stacked sections)
  // -------------------------------------------------------------------------

  describe('Given an org admin visits /organisation', () => {
    it('then the page renders a Tabs element', async () => {
      // AC: "Page renders a Tabs element (mocked)" [issue acceptance criteria §org integration]
      // [req §Epic 4 S4.1, lld §T8 "Update the organisation page to wrap sections in tabs"]
      const result = await renderOrgPage();
      expect(JSON.stringify(result)).toContain('"Tabs"');
    });
  });

  // -------------------------------------------------------------------------
  // Property 15: Tabs receives three tabs with ids: assessments, context, retrieval
  // -------------------------------------------------------------------------

  describe('Given an org admin visits /organisation', () => {
    it('then the tabs prop contains a tab with id="assessments"', async () => {
      // [lld §T8 table row 1: assessments]
      const result = await renderOrgPage();
      expect(JSON.stringify(result)).toContain('"id":"assessments"');
    });

    it('then the tabs prop contains a tab with id="context"', async () => {
      // [lld §T8 table row 2: context]
      const result = await renderOrgPage();
      expect(JSON.stringify(result)).toContain('"id":"context"');
    });

    it('then the tabs prop contains a tab with id="retrieval"', async () => {
      // [lld §T8 table row 3: retrieval]
      const result = await renderOrgPage();
      expect(JSON.stringify(result)).toContain('"id":"retrieval"');
    });
  });

  // -------------------------------------------------------------------------
  // Property 16: Tab labels match spec [lld §T8]
  // -------------------------------------------------------------------------

  describe('Given an org admin visits /organisation', () => {
    it('then the assessments tab has label "Assessments"', async () => {
      // [lld §T8 table: label "Assessments"]
      const result = await renderOrgPage();
      expect(JSON.stringify(result)).toContain('"label":"Assessments"');
    });

    it('then the context tab has label "Context"', async () => {
      // [lld §T8 table: label "Context"]
      const result = await renderOrgPage();
      expect(JSON.stringify(result)).toContain('"label":"Context"');
    });

    it('then the retrieval tab has label "Retrieval"', async () => {
      // [lld §T8 table: label "Retrieval"]
      const result = await renderOrgPage();
      expect(JSON.stringify(result)).toContain('"label":"Retrieval"');
    });
  });

  // -------------------------------------------------------------------------
  // Property 17: defaultTab is "assessments" [lld §T8]
  // -------------------------------------------------------------------------

  describe('Given an org admin visits /organisation', () => {
    it('then the Tabs component receives defaultTab="assessments"', async () => {
      // AC: "Default tab: assessments" [lld §T8, issue acceptance criteria]
      // [req §Epic 4 S4.1 "Assessments tab is active (default)"]
      const result = await renderOrgPage();
      expect(JSON.stringify(result)).toContain('"defaultTab":"assessments"');
    });
  });

  // -------------------------------------------------------------------------
  // Property 18: queryParam is "tab" for deep-link support [lld §T8]
  // -------------------------------------------------------------------------

  describe('Given an org admin visits /organisation', () => {
    it('then the Tabs component receives queryParam="tab"', async () => {
      // AC: "URL sync: ?tab=context allows deep linking" [lld §T8]
      // [req §Epic 4 S4.1 "Consider URL query param for tab state"]
      const result = await renderOrgPage();
      expect(JSON.stringify(result)).toContain('"queryParam":"tab"');
    });
  });

  // -------------------------------------------------------------------------
  // Property 19: Content components are wired to the correct tab slots
  // -------------------------------------------------------------------------

  describe('Given an org admin visits /organisation', () => {
    it('then DeleteableAssessmentTable appears in the Tabs props (assessments tab content)', async () => {
      // [lld §T8 "content: <DeleteableAssessmentTable>"]
      // The string mock ensures the component name is serialisable.
      const result = await renderOrgPage();
      const rendered = JSON.stringify(result);
      // The Tabs element must appear, and within its serialised props,
      // the DeleteableAssessmentTable string must follow it.
      const tabsPos = rendered.indexOf('"Tabs"');
      const tablePos = rendered.indexOf('DeleteableAssessmentTable', tabsPos);
      expect(tabsPos).toBeGreaterThanOrEqual(0);
      expect(tablePos).toBeGreaterThan(tabsPos);
    });

    it('then OrgContextForm appears in the Tabs props (context tab content)', async () => {
      // [lld §T8 "content: <OrgContextForm>"]
      const result = await renderOrgPage();
      const rendered = JSON.stringify(result);
      const tabsPos = rendered.indexOf('"Tabs"');
      const formPos = rendered.indexOf('OrgContextForm', tabsPos);
      expect(tabsPos).toBeGreaterThanOrEqual(0);
      expect(formPos).toBeGreaterThan(tabsPos);
    });

    it('then RetrievalSettingsForm appears in the Tabs props (retrieval tab content)', async () => {
      // [lld §T8 "content: <RetrievalSettingsForm>"]
      const result = await renderOrgPage();
      const rendered = JSON.stringify(result);
      const tabsPos = rendered.indexOf('"Tabs"');
      const settingsPos = rendered.indexOf('RetrievalSettingsForm', tabsPos);
      expect(tabsPos).toBeGreaterThanOrEqual(0);
      expect(settingsPos).toBeGreaterThan(tabsPos);
    });
  });
});
