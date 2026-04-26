// ThemeToggle — client component for switching light/dark theme with persistence.
// Design reference: docs/design/lld-v7-frontend-ux.md § T4
// Issue: #343

'use client';

import { useState, useEffect } from 'react';
import { Sun, Moon } from 'lucide-react';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'fcs-theme';

// Restricted-storage browsers (private mode, third-party cookie blocks) can throw
// SecurityError on localStorage access; mirror the inline init script's guard.
function readSavedTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

function readPreferredTheme(): Theme {
  try {
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const initial = readSavedTheme() ?? readPreferredTheme();
    applyTheme(initial);
    setTheme(initial);
  }, []);

  const handleClick = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage unavailable — toggle still works for the session.
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={handleClick}
      className="text-text-secondary hover:text-text-primary"
    >
      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
    </button>
  );
}
