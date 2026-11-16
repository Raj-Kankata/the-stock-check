'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { NAV_LINKS } from '@/lib/site'

/**
 * Left sidebar navigation. Rendered on every page via the root layout.
 * The nav links are always rendered (never gated on the open state), so
 * they are present in the statically exported HTML on every page.
 * Desktop: visible left column. Mobile: hidden off-canvas drawer,
 * opened/closed with the Menu toggle button.
 */
export default function Sidebar() {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  return (
    <>
      <button
        type="button"
        className="sidebar-toggle"
        aria-expanded={open}
        aria-controls="sidebar-nav"
        aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">{open ? '✕' : '☰'}</span> Menu
      </button>
      {open && (
        <div
          className="sidebar-backdrop"
          aria-hidden="true"
          onClick={() => setOpen(false)}
        />
      )}
      <nav
        id="sidebar-nav"
        className={`sidebar${open ? ' open' : ''}`}
        aria-label="Sidebar navigation"
      >
        {NAV_LINKS.map((l) => {
          const active = pathname === l.href
          return (
            <Link
              key={l.href}
              href={l.href}
              className={active ? 'active' : undefined}
              aria-current={active ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
