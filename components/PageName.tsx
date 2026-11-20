'use client'

import { usePathname } from 'next/navigation'

/** Current page name for the sticky mobile header (Issue 2, 2026-11-19):
    on a phone the header pins while scrolling, but nothing said which
    page the user was on. This renders the name for the current route —
    one name per route, dynamic pages by section ("Stock check", "ETF",
    "Index", "IPO"). Desktop hides it (CSS); the desktop header already
    carries the brand, tagline and search. Unknown routes render
    nothing, never a wrong name. */
const PAGE_NAMES: { match: (path: string) => boolean; name: string }[] = [
  { match: (p) => p === '/', name: 'Home' },
  { match: (p) => p === '/performance', name: 'Performance' },
  { match: (p) => p === '/picks', name: 'Top Picks' },
  { match: (p) => p === '/pulse', name: 'Market Pulse' },
  { match: (p) => p === '/stocks', name: 'Stocks' },
  { match: (p) => p === '/screener', name: 'Screener' },
  { match: (p) => p.startsWith('/stock/'), name: 'Stock check' },
  { match: (p) => p === '/etfs', name: 'ETFs' },
  { match: (p) => p.startsWith('/etf/'), name: 'ETF' },
  { match: (p) => p === '/indexes', name: 'Indexes' },
  { match: (p) => p.startsWith('/index/'), name: 'Index' },
  { match: (p) => p === '/ipos/upcoming', name: 'Upcoming IPOs' },
  { match: (p) => p === '/ipos', name: 'IPOs' },
  { match: (p) => p.startsWith('/ipo/'), name: 'IPO' },
  { match: (p) => p === '/trending', name: 'Trending' },
  { match: (p) => p === '/sectors', name: 'Sectors' },
  { match: (p) => p === '/methodology', name: 'Methodology' },
  { match: (p) => p === '/faq', name: 'FAQ' },
  { match: (p) => p === '/legal', name: 'Legal' },
  { match: (p) => p === '/privacy', name: 'Privacy' },
  { match: (p) => p === '/terms', name: 'Terms' },
]

export default function PageName() {
  const pathname = usePathname()
  const entry = PAGE_NAMES.find((e) => e.match(pathname ?? ''))
  if (!entry) return null
  return (
    <div className="page-name" aria-current="page">
      {entry.name}
    </div>
  )
}
