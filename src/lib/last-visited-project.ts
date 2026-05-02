// Last-visited project helpers — localStorage read/write/clear for admin root redirect.
// Design reference: docs/design/lld-v11-e11-4-navigation-routing.md § B.1, § B.3
// Issue: #432

const STORAGE_KEY = 'fcs:lastVisitedProjectId';

export const LAST_VISITED_PROJECT_KEY = STORAGE_KEY;

export function setLastVisitedProject(projectId: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, projectId);
  } catch {
    /* SSR / incognito — losing the preference is not an error */
  }
}

export function getLastVisitedProject(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearLastVisitedProject(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* SSR / incognito */
  }
}
