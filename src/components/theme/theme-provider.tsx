'use client'

import { createContext, useContext, useEffect, useState } from 'react'

export type Theme = 'light' | 'dark' | 'auto'

type ThemeContextValue = {
  theme: Theme
  /** Resolved theme (what's actually applied) — never 'auto' */
  resolved: 'light' | 'dark'
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'orbya-theme'

/** Lazy initializer — runs once on client mount, never re-runs. */
function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  try {
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? 'dark'
  } catch {
    return 'dark'
  }
}

/** Resolve a Theme to the actually-applied 'light' | 'dark'. */
function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (typeof window === 'undefined') return theme === 'light' ? 'light' : 'dark'
  if (theme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy init reads localStorage once; no effect-driven state sync needed.
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)
  // Derive resolved from theme + a counter that bumps on system changes.
  const [systemTick, setSystemTick] = useState(0)
  const resolved = resolveTheme(theme)

  // Pure DOM side-effect: keep <html> class in sync. No setState in body.
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolved)
  }, [resolved])

  // Subscribe to system scheme changes only when in 'auto' mode.
  useEffect(() => {
    if (theme !== 'auto') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => setSystemTick((n) => n + 1)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  // Touch systemTick so lint knows the dep is live without changing behavior.
  void systemTick

  function setTheme(t: Theme) {
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      // ignore — storage may be unavailable
    }
    setThemeState(t)
  }

  return (
    <ThemeContext.Provider value={{ theme, resolved, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

/**
 * Inline script that runs before React hydration to prevent flash.
 * Inject in <head> of root layout.
 */
export const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}') || 'dark';
    var applied = stored === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : stored;
    document.documentElement.classList.add(applied);
  } catch (e) {
    document.documentElement.classList.add('dark');
  }
})();
`.trim()
