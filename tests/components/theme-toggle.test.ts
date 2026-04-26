// Tests for ThemeToggle component — light/dark theme switching with persistence.
// Design reference: docs/design/lld-v7-frontend-ux.md § T4
// Requirements reference: docs/requirements/v7-requirements.md § Story 2.2
// Issue: #343

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — declared before imports per vitest hoisting rules
// ---------------------------------------------------------------------------

// Spy replacements for React hooks. We replace useState and useEffect so the
// component function can be called in node env (no DOM renderer required),
// while still letting tests inspect and invoke the hook side-effects.
// Hoisted because vi.mock factories run before module-scope statements.
const { useStateSpy, useEffectSpy } = vi.hoisted(() => ({
  useStateSpy: vi.fn(),
  useEffectSpy: vi.fn(),
}));

// The most recently captured effect callback, set whenever useEffect is called.
let capturedEffectCallback: (() => void) | null = null;

vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: useStateSpy,
    useEffect: useEffectSpy,
  };
});

// Stub lucide-react icons so tests can identify which icon is rendered
// without importing the full SVG implementation.
vi.mock('lucide-react', () => ({
  Sun: ({ size }: { size?: number }) => ({
    type: 'svg',
    props: { 'data-testid': 'icon-sun', size },
  }),
  Moon: ({ size }: { size?: number }) => ({
    type: 'svg',
    props: { 'data-testid': 'icon-moon', size },
  }),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { ThemeToggle, THEME_STORAGE_KEY } from '@/components/theme-toggle';
import type { Theme } from '@/components/theme-toggle';

// ---------------------------------------------------------------------------
// Helpers — localStorage stub
// ---------------------------------------------------------------------------

function makeLocalStorageStub(initial: Record<string, string> = {}): Storage {
  const store: Record<string, string> = { ...initial };
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      Object.keys(store).forEach((k) => delete store[k]);
    }),
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
    get length() {
      return Object.keys(store).length;
    },
  } as unknown as Storage;
}

// ---------------------------------------------------------------------------
// Helpers — document.documentElement stub
// ---------------------------------------------------------------------------

let attributeStore: Record<string, string> = {};

function makeDocumentElementStub() {
  return {
    setAttribute: vi.fn((name: string, value: string) => {
      attributeStore[name] = value;
    }),
    getAttribute: vi.fn((name: string) => attributeStore[name] ?? null),
  };
}

// ---------------------------------------------------------------------------
// Helpers — component rendering
// ---------------------------------------------------------------------------

// Recursively invoke function-component nodes so the lucide-react mocks (which
// are plain functions) get expanded into their plain-object form. Native
// elements (string `type`) and primitives pass through untouched. Function
// references on `type` are preserved too — required for tests that pull
// `onClick` off the button before invoking it. This compensates for the fact
// that vitest tests run without a React renderer.
type RenderNode = unknown;

function renderTree(node: RenderNode): RenderNode {
  if (!node || typeof node !== 'object') return node;
  const el = node as { type?: unknown; props?: Record<string, unknown> };
  if (typeof el.type === 'function') {
    const result = (el.type as (p: unknown) => RenderNode)(el.props ?? {});
    return renderTree(result);
  }
  if (!el.props) return node;
  const newProps: Record<string, unknown> = { ...el.props };
  if (newProps.children !== undefined) {
    newProps.children = Array.isArray(newProps.children)
      ? newProps.children.map(renderTree)
      : renderTree(newProps.children as RenderNode);
  }
  return { ...el, props: newProps };
}

type StateSetter = (value: unknown) => void;

/**
 * Configure useStateSpy to return [theme, setter] for one call and set up
 * useEffectSpy to capture the effect callback.
 */
function configureHooks(
  initialTheme: Theme,
  setter: StateSetter = vi.fn()
): void {
  useStateSpy.mockReturnValueOnce([initialTheme, setter]);
  useEffectSpy.mockImplementationOnce(
    (fn: () => void | (() => void), _deps?: unknown[]) => {
      capturedEffectCallback = fn;
    }
  );
}

/** Invoke the effect captured during the last render call. */
function runMountEffect(): void {
  if (capturedEffectCallback) capturedEffectCallback();
}

// ---------------------------------------------------------------------------
// Test-local globals
// ---------------------------------------------------------------------------

let localStorageStub: Storage;
let documentElementStub: ReturnType<typeof makeDocumentElementStub>;

beforeEach(() => {
  attributeStore = {};
  capturedEffectCallback = null;
  localStorageStub = makeLocalStorageStub();
  documentElementStub = makeDocumentElementStub();

  vi.stubGlobal('localStorage', localStorageStub);
  vi.stubGlobal('document', { documentElement: documentElementStub });

  // Default hooks for tests that do not call configureHooks explicitly.
  // useStateSpy returns ['dark', vi.fn()] unless overridden per test.
  useStateSpy.mockReturnValue(['dark', vi.fn()]);
  useEffectSpy.mockImplementation(
    (fn: () => void | (() => void), _deps?: unknown[]) => {
      capturedEffectCallback = fn;
    }
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ThemeToggle', () => {

  // -------------------------------------------------------------------------
  // Property 1: Renders a button with aria-label "Toggle theme"
  // -------------------------------------------------------------------------

  describe('Given the component is rendered', () => {
    it('then it returns a button element', () => {
      // [lld §T4 BDD] renders a button with aria-label "Toggle theme"
      const tree = JSON.stringify(renderTree(ThemeToggle()));
      expect(tree).toContain('"button"');
    });

    it('then the button has aria-label "Toggle theme"', () => {
      // [req §Story 2.2] "accessible (has an aria-label)"
      // [lld §T4 BDD] renders a button with aria-label "Toggle theme"
      const tree = JSON.stringify(renderTree(ThemeToggle()));
      expect(tree).toContain('"Toggle theme"');
    });

    it('then the element is a native <button> (keyboard operable without JS)', () => {
      // [req §Story 2.2] "keyboard operable"
      // A native <button> is focusable and activatable via Enter/Space by default.
      const tree = JSON.stringify(renderTree(ThemeToggle()));
      // Confirm the rendered type is literally the string "button"
      expect(tree).toContain('"button"');
    });
  });

  // -------------------------------------------------------------------------
  // Property 6a: Sun icon shown when theme is dark (next click goes to light)
  // -------------------------------------------------------------------------

  describe('Given the current theme is dark', () => {
    it('then the Sun icon is rendered (signalling dark-to-light action)', () => {
      // [lld §T4] "Sun (lucide-react) for dark-to-light, Moon for light-to-dark"
      // Default mock state is 'dark'.
      const tree = JSON.stringify(renderTree(ThemeToggle()));
      expect(tree).toContain('icon-sun');
      expect(tree).not.toContain('icon-moon');
    });
  });

  // -------------------------------------------------------------------------
  // Property 6b: Moon icon shown when theme is light (next click goes to dark)
  // -------------------------------------------------------------------------

  describe('Given the current theme is light', () => {
    it('then the Moon icon is rendered (signalling light-to-dark action)', () => {
      // [lld §T4] "Sun (lucide-react) for dark-to-light, Moon for light-to-dark"
      configureHooks('light');
      const tree = JSON.stringify(renderTree(ThemeToggle()));
      expect(tree).toContain('icon-moon');
      expect(tree).not.toContain('icon-sun');
    });
  });

  // -------------------------------------------------------------------------
  // Property 2: Reads saved preference from localStorage on mount
  // -------------------------------------------------------------------------

  describe('Given a saved theme preference exists in localStorage', () => {
    it('then localStorage.getItem is called with the key fcs-theme on mount', () => {
      // [req §Story 2.2] "restored on next visit"
      // [lld §T4 BDD] "reads saved preference on mount"
      localStorageStub = makeLocalStorageStub({ [THEME_STORAGE_KEY]: 'light' });
      vi.stubGlobal('localStorage', localStorageStub);

      ThemeToggle();
      runMountEffect();

      expect(localStorageStub.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
    });

    it('then data-theme on documentElement is set to the saved "light" value', () => {
      // [lld §T4] "Sets data-theme attribute on <html>"
      localStorageStub = makeLocalStorageStub({ [THEME_STORAGE_KEY]: 'light' });
      vi.stubGlobal('localStorage', localStorageStub);

      ThemeToggle();
      runMountEffect();

      expect(documentElementStub.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });

    it('then data-theme on documentElement is set to the saved "dark" value', () => {
      // [lld §T4] "Sets data-theme attribute on <html>"
      localStorageStub = makeLocalStorageStub({ [THEME_STORAGE_KEY]: 'dark' });
      vi.stubGlobal('localStorage', localStorageStub);

      ThemeToggle();
      runMountEffect();

      expect(documentElementStub.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    });
  });

  // -------------------------------------------------------------------------
  // Property 3: Falls back to prefers-color-scheme when no saved preference
  // -------------------------------------------------------------------------

  describe('Given no saved preference exists in localStorage', () => {
    it('then window.matchMedia is queried with "(prefers-color-scheme: dark)" on mount', () => {
      // [req §Story 2.2] "defaults to prefers-color-scheme media query"
      // [lld §T4 BDD] "defaults to prefers-color-scheme when no saved preference"
      const matchMediaMock = vi.fn().mockReturnValue({ matches: false });
      vi.stubGlobal('matchMedia', matchMediaMock);
      localStorageStub = makeLocalStorageStub({}); // no saved pref
      vi.stubGlobal('localStorage', localStorageStub);

      ThemeToggle();
      runMountEffect();

      expect(matchMediaMock).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    });

    it('then dark theme is applied when prefers-color-scheme: dark matches', () => {
      // [req §Story 2.2] "defaults to prefers-color-scheme"
      const matchMediaMock = vi.fn().mockReturnValue({ matches: true });
      vi.stubGlobal('matchMedia', matchMediaMock);
      localStorageStub = makeLocalStorageStub({});
      vi.stubGlobal('localStorage', localStorageStub);

      ThemeToggle();
      runMountEffect();

      expect(documentElementStub.setAttribute).toHaveBeenCalledWith('data-theme', 'dark');
    });

    it('then light theme is applied when prefers-color-scheme: dark does not match', () => {
      // [req §Story 2.2] "defaults to prefers-color-scheme"
      const matchMediaMock = vi.fn().mockReturnValue({ matches: false });
      vi.stubGlobal('matchMedia', matchMediaMock);
      localStorageStub = makeLocalStorageStub({});
      vi.stubGlobal('localStorage', localStorageStub);

      ThemeToggle();
      runMountEffect();

      expect(documentElementStub.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });
  });

  // -------------------------------------------------------------------------
  // Property 4: Clicking the button toggles theme and updates data-theme
  // -------------------------------------------------------------------------

  describe('Given the current theme is dark and the button is clicked', () => {
    it('then data-theme on documentElement becomes "light"', () => {
      // [req §Story 2.2] "theme switches immediately without a page reload"
      // [lld §T4 BDD] "toggles data-theme between light and dark on click"
      const tree = renderTree(ThemeToggle()) as { props: { onClick?: () => void } };
      const onClick = tree?.props?.onClick;
      expect(onClick, 'button must expose an onClick handler').toBeDefined();
      onClick!();
      expect(documentElementStub.setAttribute).toHaveBeenCalledWith('data-theme', 'light');
    });
  });

  describe('Given the current theme is light and the button is clicked', () => {
    it('then data-theme on documentElement becomes "dark"', () => {
      // [lld §T4 BDD] "toggles data-theme between light and dark on click"
      const appliedThemes: string[] = [];
      documentElementStub.setAttribute.mockImplementation(
        (name: string, value: string) => {
          if (name === 'data-theme') appliedThemes.push(value);
          attributeStore[name] = value;
        }
      );

      configureHooks('light');
      const tree = renderTree(ThemeToggle()) as { props: { onClick?: () => void } };
      const onClick = tree?.props?.onClick;
      expect(onClick, 'button must expose an onClick handler').toBeDefined();
      onClick!();

      expect(appliedThemes).toContain('dark');
    });
  });

  // -------------------------------------------------------------------------
  // Property 5: Clicking the button persists the new theme to localStorage
  // -------------------------------------------------------------------------

  describe('Given the button is clicked', () => {
    it('then localStorage.setItem is called with key fcs-theme and the new theme', () => {
      // [req §Story 2.2] "persisted in localStorage and restored on next visit"
      // [lld §T4 BDD] "persists preference to localStorage"
      const tree = renderTree(ThemeToggle()) as { props: { onClick?: () => void } };
      const onClick = tree?.props?.onClick;
      expect(onClick, 'button must expose an onClick handler').toBeDefined();
      onClick!();

      expect(localStorageStub.setItem).toHaveBeenCalledWith(
        THEME_STORAGE_KEY,
        expect.stringMatching(/^(light|dark)$/)
      );
    });

    it('then toggling from dark writes "light" to localStorage', () => {
      // [lld §T4 BDD] "persists preference to localStorage"
      const tree = renderTree(ThemeToggle()) as { props: { onClick?: () => void } };
      const onClick = tree?.props?.onClick;
      onClick!();
      expect(localStorageStub.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light');
    });

    it('then toggling from light writes "dark" to localStorage', () => {
      // [lld §T4 BDD] "persists preference to localStorage"
      configureHooks('light');
      const tree = renderTree(ThemeToggle()) as { props: { onClick?: () => void } };
      const onClick = tree?.props?.onClick;
      onClick!();
      expect(localStorageStub.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'dark');
    });
  });

  // -------------------------------------------------------------------------
  // Property 7: THEME_STORAGE_KEY export equals 'fcs-theme'
  // -------------------------------------------------------------------------

  describe('Given the exported THEME_STORAGE_KEY constant', () => {
    it('then it equals the string "fcs-theme"', () => {
      // [lld §T4] 'Reads/writes localStorage key "fcs-theme"'
      expect(THEME_STORAGE_KEY).toBe('fcs-theme');
    });
  });

  // -------------------------------------------------------------------------
  // Prohibition: saved preference takes precedence over prefers-color-scheme
  // -------------------------------------------------------------------------

  describe('Given a saved preference exists AND prefers-color-scheme disagrees', () => {
    it('then the saved preference wins — matchMedia result is not applied', () => {
      // [req §Story 2.2] "defaults to prefers-color-scheme" implies it is only the fallback.
      // Saved: light, system prefers: dark — the applied theme must be light.
      localStorageStub = makeLocalStorageStub({ [THEME_STORAGE_KEY]: 'light' });
      vi.stubGlobal('localStorage', localStorageStub);
      const matchMediaMock = vi.fn().mockReturnValue({ matches: true }); // system = dark
      vi.stubGlobal('matchMedia', matchMediaMock);

      ThemeToggle();
      runMountEffect();

      // Collect all data-theme calls and assert the final value is 'light'.
      const dataThemeCalls = (
        documentElementStub.setAttribute as ReturnType<typeof vi.fn>
      ).mock.calls.filter(([name]: [string]) => name === 'data-theme');
      const lastApplied = dataThemeCalls[dataThemeCalls.length - 1]?.[1] as string | undefined;
      expect(lastApplied).toBe('light');
    });
  });
});
