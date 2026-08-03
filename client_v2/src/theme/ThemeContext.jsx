import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';
import './tokens.css';

const ThemeContext = createContext({ theme: 'dark', setTheme: () => {}, toggle: () => {} });

const STORAGE_KEY = 'vq-theme';
const THEMES = new Set(['dark', 'light']);

function normalizeTheme(value, fallback = 'dark') {
  return THEMES.has(value) ? value : fallback;
}

function storedTheme(defaultTheme) {
  const fallback = normalizeTheme(defaultTheme);
  if (typeof window === 'undefined') return fallback;
  try {
    return normalizeTheme(localStorage.getItem(STORAGE_KEY), fallback);
  } catch {
    return fallback;
  }
}

function applyTheme(theme) {
  if (typeof document === 'undefined') return;

  const normalized = normalizeTheme(theme);
  const roots = [document.documentElement, document.body].filter(Boolean);
  roots.forEach((root) => {
    root.setAttribute('data-vq-theme', normalized);
    root.classList.toggle('dark', normalized === 'dark');
    root.style.colorScheme = normalized;
  });

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', normalized === 'dark' ? '#07090c' : '#e6eaf2');
}

/**
 * Provides the V2 theme (dark | light) and persists it. The actual
 * `data-vq-theme` attribute is applied by the consuming root element
 * (see V2Layout) so the rest of the legacy app is never affected.
 */
export function V2ThemeProvider({ children, defaultTheme = 'dark' }) {
  const [theme, setThemeState] = useState(() => storedTheme(defaultTheme));

  const setTheme = useCallback((next) => {
    const normalized = normalizeTheme(next, 'light');
    applyTheme(normalized);
    setThemeState(normalized);
    try {
      localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      /* ignore persistence errors (private mode etc.) */
    }
  }, []);

  const toggle = useCallback(() => {
    setThemeState((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggle, isDark: theme === 'dark', isLight: theme === 'light' }),
    [theme, setTheme, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
