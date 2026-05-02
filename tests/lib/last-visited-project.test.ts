// Tests for last-visited-project localStorage helpers.
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md § B.1, § B.3
// Requirements reference: docs/requirements/v11-requirements.md § Story 4.6
// Issue: #432

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------

import {
  setLastVisitedProject,
  getLastVisitedProject,
  clearLastVisitedProject,
  LAST_VISITED_PROJECT_KEY,
} from '@/lib/last-visited-project';

// ---------------------------------------------------------------------------
// Minimal in-memory localStorage stub
// ---------------------------------------------------------------------------

function makeLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { store.set(key, value); }),
    removeItem: vi.fn((key: string) => { store.delete(key); }),
    clear: vi.fn(() => { store.clear(); }),
    _store: store,
  };
}

let localStorageStub: ReturnType<typeof makeLocalStorageStub>;

beforeEach(() => {
  localStorageStub = makeLocalStorageStub();
  vi.stubGlobal('localStorage', localStorageStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LAST_VISITED_PROJECT_KEY', () => {
  describe('Given the module is imported', () => {
    it('then LAST_VISITED_PROJECT_KEY is the string "fcs:lastVisitedProjectId"', () => {
      // [lld §B.3] STORAGE_KEY = 'fcs:lastVisitedProjectId' — namespaced under "fcs:".
      expect(LAST_VISITED_PROJECT_KEY).toBe('fcs:lastVisitedProjectId');
    });
  });
});

describe('setLastVisitedProject', () => {
  describe('Given a project ID', () => {
    it('then it writes the ID to localStorage under LAST_VISITED_PROJECT_KEY', () => {
      // [req §Story 4.6 AC1] "lastVisitedProjectId = [id] is written to localStorage under a stable key"
      // [lld §B.1] setLastVisitedProject writes to the module's storage key
      setLastVisitedProject('proj-abc');
      expect(localStorageStub.setItem).toHaveBeenCalledWith(LAST_VISITED_PROJECT_KEY, 'proj-abc');
    });

    it('then the stored value can be retrieved directly from the stub store', () => {
      // [req §Story 4.6 AC1] written value is persisted under the stable key
      setLastVisitedProject('proj-xyz');
      expect(localStorageStub._store.get(LAST_VISITED_PROJECT_KEY)).toBe('proj-xyz');
    });

    it('then writing a second project ID overwrites the first', () => {
      // [req §Story 4.6 AC1 + State Diagram §A.4] Set → Set transition
      // [lld §A.4] "admin visits different /projects/[id]" transitions Set → Set
      setLastVisitedProject('proj-first');
      setLastVisitedProject('proj-second');
      expect(localStorageStub._store.get(LAST_VISITED_PROJECT_KEY)).toBe('proj-second');
    });
  });

  describe('Given localStorage is unavailable (SSR / incognito)', () => {
    it('then setLastVisitedProject does not throw', () => {
      // [lld §B.3] "try/catch guards for SSR (no localStorage on server) and incognito"
      vi.unstubAllGlobals();
      vi.stubGlobal('localStorage', undefined);
      expect(() => setLastVisitedProject('proj-ssr')).not.toThrow();
    });
  });
});

describe('getLastVisitedProject', () => {
  describe('Given a project ID has been stored', () => {
    it('then getLastVisitedProject returns that ID', () => {
      // [req §Story 4.6 AC1] value written by setLastVisitedProject is readable
      // [lld §B.3] getLastVisitedProject returns localStorage.getItem(STORAGE_KEY)
      localStorageStub._store.set(LAST_VISITED_PROJECT_KEY, 'proj-stored');
      const result = getLastVisitedProject();
      expect(result).toBe('proj-stored');
    });

    it('then getLastVisitedProject reads from LAST_VISITED_PROJECT_KEY', () => {
      // [lld §B.1] consistent key is the contract
      localStorageStub._store.set(LAST_VISITED_PROJECT_KEY, 'proj-123');
      getLastVisitedProject();
      expect(localStorageStub.getItem).toHaveBeenCalledWith(LAST_VISITED_PROJECT_KEY);
    });
  });

  describe('Given nothing has been stored', () => {
    it('then getLastVisitedProject returns null', () => {
      // [req §Story 4.4 AC2] "admin has no lastVisitedProjectId stored → redirect to /projects"
      // [lld §B.3] "return localStorage.getItem(STORAGE_KEY)" — getItem returns null when absent
      const result = getLastVisitedProject();
      expect(result).toBeNull();
    });
  });

  describe('Given localStorage is unavailable (SSR / incognito)', () => {
    it('then getLastVisitedProject returns null without throwing', () => {
      // [lld §B.3] "try { return localStorage.getItem... } catch { return null }"
      vi.unstubAllGlobals();
      vi.stubGlobal('localStorage', undefined);
      let result: string | null | undefined;
      expect(() => { result = getLastVisitedProject(); }).not.toThrow();
      expect(result).toBeNull();
    });
  });
});

describe('clearLastVisitedProject', () => {
  describe('Given a project ID has been stored', () => {
    it('then clearLastVisitedProject removes the entry from localStorage', () => {
      // [req §Story 4.6 AC2] "sign-out clears lastVisitedProjectId from localStorage"
      // [lld §A.4] Set → Empty transition on sign-out
      localStorageStub._store.set(LAST_VISITED_PROJECT_KEY, 'proj-to-clear');
      clearLastVisitedProject();
      expect(localStorageStub.removeItem).toHaveBeenCalledWith(LAST_VISITED_PROJECT_KEY);
    });

    it('then after clearing, getLastVisitedProject returns null', () => {
      // [req §Story 4.6 AC2] value is gone after clear
      localStorageStub._store.set(LAST_VISITED_PROJECT_KEY, 'proj-to-clear');
      clearLastVisitedProject();
      expect(localStorageStub._store.get(LAST_VISITED_PROJECT_KEY)).toBeUndefined();
    });
  });

  describe('Given nothing has been stored', () => {
    it('then clearLastVisitedProject does not throw (no-op)', () => {
      // [lld §B.3] removeItem on absent key is a safe no-op in all browsers
      expect(() => clearLastVisitedProject()).not.toThrow();
    });
  });

  describe('Given localStorage is unavailable (SSR / incognito)', () => {
    it('then clearLastVisitedProject does not throw', () => {
      // [lld §B.3] "try { localStorage.removeItem(...) } catch { /* SSR / incognito */ }"
      vi.unstubAllGlobals();
      vi.stubGlobal('localStorage', undefined);
      expect(() => clearLastVisitedProject()).not.toThrow();
    });
  });
});
