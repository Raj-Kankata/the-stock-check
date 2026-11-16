import type { Metadata } from 'next'
import Link from 'next/link'
import './globals.css'
import Sidebar from '@/components/Sidebar'
import { NAV_LINKS, SITE_NAME, SITE_URL, PRICE_DATE, ENGINE_VERSION } from '@/lib/site'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'The Stock Check — Check any stock before you buy',
    template: '%s | The Stock Check',
  },
  description:
    'A free, deterministic, rules-based stock research platform. Every verdict shows its numbers, its sources and its limits. No sign-in, no tracking, no black box.',
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
        <header className="site-header">
          <div className="wrap">
            <div className="brand">
              <Link href="/">The Stock Check</Link>
              <span className="tagline">
                Check any stock before you buy — every number shown, every source named.
              </span>
            </div>
            <nav className="site-nav" aria-label="Main navigation">
              {NAV_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <div className="shell">
          <Sidebar />
          <main>{children}</main>
        </div>
        <footer className="site-footer">
          <div className="wrap">
            <p>
              <strong style={{ color: '#fff' }}>The Stock Check</strong> — free, deterministic,
              rules-based stock research. For research and education only — not investment advice.
              Data may be delayed and can contain errors; verify before trading. Past performance
              does not guarantee future results.
            </p>
            <div className="links">
              <Link href="/methodology">Methodology</Link>
              <Link href="/faq">FAQ</Link>
              <Link href="/privacy">Privacy Policy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/picks">Top Picks</Link>
              <Link href="/performance">Performance</Link>
            </div>
            <p>
              Prices as of the {PRICE_DATE} close · Engine {ENGINE_VERSION} · No sign-in, no
              tracking, no analytics.
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
