'use client'

import { useEffect, useState } from 'react'

/**
 * Dark / light theme toggle, in the site header on every page.
 * Default is light. The choice persists in localStorage ('tsc-theme')
 * and is applied before first paint by the inline script in the root
 * layout, so there is no flash of the wrong theme on load. No
 * OS-preference auto-switch: light unless the user picked dark.
 * The initial state is always 'light' (matching the server HTML);
 * the effect syncs the icon with the stored choice after mount.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    setTheme(
      document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
    )
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    if (next === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    try {
      localStorage.setItem('tsc-theme', next)
    } catch {
      /* storage unavailable (private mode) — theme still applies */
    }
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
    </button>
  )
}
