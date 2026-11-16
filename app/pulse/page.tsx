import type { Metadata } from 'next'
import Link from 'next/link'
import { Card } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Market Pulse',
  description:
    'A macro brief refreshed every 6 hours — trend, breadth, volatility, credit, internals and macro regime. The FRED macro feed is not wired in this build, so no readings are published yet.',
}

const PANELS: { name: string; wouldShow: string; reason: string }[] = [
  {
    name: 'Trend',
    wouldShow: 'Whether the broad market is trending up or down — for example SPY against its moving averages.',
    reason: 'No live price feed is wired in this build, so no trend reading is published.',
  },
  {
    name: 'Breadth',
    wouldShow: 'How broad a move is — advancing vs declining issues, new highs vs new lows.',
    reason: 'No live breadth feed is wired in this build, so no breadth reading is published.',
  },
  {
    name: 'Volatility (VIX)',
    wouldShow: 'The VIX level and its regime, and what it implies for the expected daily move in the S&P 500.',
    reason: 'No live VIX feed is wired in this build, so no VIX value is published here.',
  },
  {
    name: 'Credit',
    wouldShow: 'Credit spreads — whether corporate borrowing stress is rising or falling.',
    reason: 'No live credit feed is wired in this build, so no credit reading is published.',
  },
  {
    name: 'Internals',
    wouldShow: 'Market internals such as put/call positioning and short-term momentum.',
    reason: 'No live internals feed is wired in this build, so no internals reading is published.',
  },
  {
    name: 'Macro Regime',
    wouldShow:
      'The Macro Economic Indicator — a composite of GDP, industrial production, unemployment and retail sales — and the regime it implies.',
    reason:
      'The FRED macro feed is unavailable in this build, so the composite cannot be computed and no regime is asserted.',
  },
]

export default function PulsePage() {
  return (
    <>
      <h1>Market Pulse</h1>
      <p className="page-intro">
        A macro brief, refreshed every 6 hours. When the feeds are live, this page carries one
        short brief plus six panels — trend, breadth, volatility, credit, internals and macro
        regime.
      </p>

      <div className="callout red">
        <strong>Data unavailable — no readings in this build.</strong> The FRED macro feed
        (Macro Economic Indicator — a composite of GDP, industrial production, unemployment and
        retail sales) is unavailable in this build, and no live market-data feed is wired yet.
        Every panel below shows &ldquo;Data unavailable&rdquo; and <strong>no regime is
        asserted on this page</strong>: no Bullish/Bearish score, no Reflation/expansion label,
        and nothing derived from failed data. A number that is not measured is not shown.
      </div>

      <div className="two-col">
        {PANELS.map((p) => (
          <Card key={p.name} title={p.name}>
            <p>
              <strong>Data unavailable.</strong> {p.reason}
            </p>
            <p className="footnote">{p.wouldShow}</p>
          </Card>
        ))}
      </div>

      <Card title="What happens next">
        <p>
          The pulse will publish real readings once the FRED feed is wired and the market-data
          feed is connected. Until then this page stays as it is — an honest empty state, not a
          made-up one.
        </p>
        <p>
          For the rotation model, which <em>is</em> published — formulas and a live calculator
          — see <Link href="/sectors">Sector Rotation</Link>. For how the stock scores are
          built, see <Link href="/methodology">Methodology</Link>.
        </p>
      </Card>
    </>
  )
}
