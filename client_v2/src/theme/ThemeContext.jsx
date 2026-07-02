import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import './tokens.css';

const ThemeContext = createContext({ theme: 'dark', setTheme: () => {}, toggle: () => {} });

const STORAGE_KEY = 'vq-theme';

/**
 * Provides the V2 theme (dark | light) and persists it. The actual
 * `data-vq-theme` attribute is applied by the consuming root element
 * (see V2Layout) so the rest of the legacy app is never affected.
 */
export function V2ThemeProvider({ children, defaultTheme = 'dark' }) {
  const [theme, setThemeState] = useState(() => {
    if (typeof window === 'undefined') return defaultTheme;
    return localStorage.getItem(STORAGE_KEY) || defaultTheme;
  });

  const setTheme = useCallback((next) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore persistence errors (private mode etc.) */
    }
  }, []);

  const toggle = useCallback(() => {
    setThemeState((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    // keep <meta name="theme-color"> roughly in sync when V2 is active
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#07090c' : '#e6eaf2');
    
    // Apply the theme to body so that Portals also inherit the theme styles
    document.body.setAttribute('data-vq-theme', theme);
  }, [theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggle, isDark: theme === 'dark', isLight: theme === 'light' }),
    [theme, setTheme, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
