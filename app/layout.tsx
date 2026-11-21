import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import SearchBox from '@/components/SearchBox'
import MarketStrip from '@/components/MarketStrip'
import ThemeToggle from '@/components/ThemeToggle'
import PageName from '@/components/PageName'
import BrandMark from '@/components/BrandMark'
import { SITE_NAME, SITE_URL, ENGINE_VERSION } from '@/lib/site'
import { ANALYTICS_ENABLED, CF_BEACON_TOKEN } from '@/lib/analytics'
import { searchIndex, etfSearchIndex, indexSearchIndex, ipoSearchIndex, notScoredSearchIndex } from '@/lib/public'
import { RESULTS } from '@/lib/data'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'The Stock Check — Check any stock before you buy',
    template: '%s | The Stock Check',
  },
  description:
    'A free, deterministic, rules-based stock research platform. Every verdict shows its numbers, its sources and its limits. No sign-in, no black box. Anonymous page and search stats only — see the Privacy Policy.',
  icons: {
    icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }],
  },
  openGraph: {
    siteName: SITE_NAME,
    type: 'website',
    url: SITE_URL,
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en">
      <body>
        {/* No-flash theme script: runs before first paint, applies the
            stored choice (light unless the user picked dark). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('tsc-theme');if(t==='dark'){document.documentElement.setAttribute('data-theme','dark');}}catch(e){}})();`,
          }}
        />
        <header className="site-header">
          <div className="wrap">
            <div className="header-top">
              <Sidebar />
              <div className="brand">
                <Link href="/">
                  <span className="brand-mark" aria-hidden="true">
                    <BrandMark />
                  </span>
                  <span className="brand-text">
                    <span className="brand-name">The Stock Check</span>
                    <span className="brand-domain">thestockcheck.com</span>
                  </span>
                </Link>
                <span className="tagline">Five pillars. One honest check.</span>
              </div>
              <div className="header-search">
                <SearchBox entries={searchIndex()} etfEntries={etfSearchIndex()} indexEntries={indexSearchIndex()} ipoEntries={ipoSearchIndex()} notScoredEntries={notScoredSearchIndex()} />
              </div>
              <ThemeToggle />
              <PageName />
            </div>
            <MarketStrip />
          </div>
        </header>
        <div className="shell">
          <main>{children}</main>
        </div>
        <footer className="site-footer">
          <div className="wrap">
            <p>
              <strong style={{ color: 'var(--ink)' }}>The Stock Check</strong> — free, deterministic,
              rules-based stock research. For research and education only — not investment advice,
              and not a recommendation, offer or solicitation to buy or sell any security. This is
              not a stock promotion. Scores, verdicts and fair values are valuation context only,
              not buy or exit instructions. Data may be delayed, incomplete or inaccurate; do your
              own research and consult a licensed financial advisor. Past performance does not
              guarantee future results. We are not liable for decisions made from this content.
            </p>
            <div className="links">
              <Link href="/methodology">Methodology</Link>
              <Link href="/faq">FAQ</Link>
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/legal">Legal</Link>
              <Link href="/picks">Top Picks</Link>
              <Link href="/performance">Performance</Link>
            </div>
            <p>© 2026 The Stock Check. All rights reserved.</p>
            <p>
              Prices are the {RESULTS.price_date} close unless marked LIVE during market hours
              (quotes delayed ~15 min, TradingView) · Engine {ENGINE_VERSION} ·{' '}
              {ANALYTICS_ENABLED
                ? 'No sign-in. Anonymous page and search stats only — see Privacy.'
                : 'No sign-in, no tracking, no analytics.'}
            </p>
          </div>
        </footer>
        {/* Cloudflare Web Analytics beacon (cookieless page views). Rendered
            ONLY once CF_BEACON_TOKEN is set in lib/analytics.ts — while it is
            empty, no beacon ships and no page-view stats are collected. */}
        {CF_BEACON_TOKEN !== '' && (
          <script
            defer
            src="https://static.cloudflareinsights.com/beacon.min.js"
            data-cf-beacon={JSON.stringify({ token: CF_BEACON_TOKEN })}
          />
        )}
      </body>
    </html>
  )
}
