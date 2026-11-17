'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { NAV_LINKS } from '@/lib/site'

/**
 * Floating pill rail navigation (launcher style). Rendered on every
 * page via the root layout. The nav links are always rendered (never
 * gated on the open state), so they are present in the statically
 * exported HTML on every page.
 * Desktop: white rounded pill, vertically centered on the left edge,
 * visible at every scroll position; collapses to an icon-only rail
 * on narrower screens (CSS). Mobile: hidden off-canvas drawer,
 * opened/closed with the Menu toggle button.
 */

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const ICONS: Record<string, ReactNode> = {
  '/': (
    <Icon>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </Icon>
  ),
  '/stocks': (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Icon>
  ),
  '/picks': (
    <Icon>
      <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" />
    </Icon>
  ),
  '/trending': (
    <Icon>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </Icon>
  ),
  '/performance': (
    <Icon>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M2 20h20" />
    </Icon>
  ),
  '/sectors': (
    <Icon>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </Icon>
  ),
  '/pulse': (
    <Icon>
      <path d="M3 12h4l3 8 4-16 3 8h4" />
    </Icon>
  ),
  '/methodology': (
    <Icon>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </Icon>
  ),
  '/faq': (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </Icon>
  ),
}

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
        <Link href="/" className="rail-brand" onClick={() => setOpen(false)}>
          <span className="rail-mark" aria-hidden="true">
            ↗
          </span>
          <span className="rail-brand-text">
            <span className="rail-name">The Stock Check</span>
            <span className="rail-domain">thestockcheck.com</span>
          </span>
        </Link>
        <p className="rail-caption">BROWSE</p>
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
              <span className="nav-icon">{ICONS[l.href]}</span>
              <span className="nav-label">{l.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
