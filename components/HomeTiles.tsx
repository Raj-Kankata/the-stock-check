// Homepage "At a glance" tiles. Verdict counts and the names-scored
// count are baked (they come from the nightly model run); the two
// price-dependent tiles — Below fair value and Median upside —
// recompute live client-side from the shared live-price store and the
// baked fair values, which are passed in as a compact per-ticker array.
// The list memberships and rankings elsewhere on the homepage stay
// baked (as-of-close); only the prices shown in them go live.

'use client'

import Link from 'next/link'
import { pct } from '@/lib/data'
import { hasLiveQuotes, liveCloseFor, useLiveQuotes } from '@/lib/tradingview'

export interface HomeTileFv {
  symbol: string
  fv: number
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export default function HomeTiles({
  total,
  verdictCounts,
  belowFv,
  medianUpside,
  priceDate,
  fvs,
}: {
  total: number
  verdictCounts: { Growth: number; Value: number; Watch: number; Avoid: number }
  belowFv: number
  medianUpside: number
  priceDate: string
  fvs: HomeTileFv[]
}) {
  const live = useLiveQuotes()
  const liveNow = hasLiveQuotes(live)

  // Live recompute: every ticker with a live close and a positive fair
  // value contributes (fair value − live price) / live price. If the
  // live map is missing a name (it never is — the scan is all-or-none),
  // that name keeps its baked close rather than dropping out.
  let liveBelowFv = belowFv
  let liveMedianUpside = medianUpside
  if (liveNow) {
    const upsides: number[] = []
    let below = 0
    for (const { symbol, fv } of fvs) {
      const price = liveCloseFor(live, symbol)
      if (price === null || price <= 0 || fv <= 0) continue
      upsides.push((fv - price) / price)
      if (fv > price) below += 1
    }
    if (upsides.length === fvs.length) {
      liveBelowFv = below
      liveMedianUpside = median(upsides)
    }
  }

  const tiles: { label: string; value: string; sub: string; href?: string }[] = [
    {
      label: 'Names scored',
      value: String(total),
      sub: `Prices as of the ${priceDate} close`,
      href: '/stocks',
    },
    {
      label: 'Growth',
      value: String(verdictCounts.Growth),
      sub: 'Highest-conviction names',
      href: '/stocks?verdict=Growth',
    },
    {
      label: 'Value',
      value: String(verdictCounts.Value),
      sub: 'Priced below fair value on score',
      href: '/stocks?verdict=Value',
    },
    {
      label: 'Watch',
      value: String(verdictCounts.Watch),
      sub: 'Not yet a Growth or Value name',
      href: '/stocks?verdict=Watch',
    },
    {
      label: 'Avoid',
      value: String(verdictCounts.Avoid),
      sub: 'Lowest-scoring names',
      href: '/stocks?verdict=Avoid',
    },
    {
      label: 'Below fair value',
      value: String(liveBelowFv),
      sub: liveNow
        ? `of ${total} trade under fair value · live`
        : `of ${total} trade under fair value`,
      href: '/stocks?underfv=1&sort=upside',
    },
    {
      label: 'Median upside',
      value: pct(liveMedianUpside, 1),
      sub: liveNow
        ? 'Median (fair value − price) / price · live'
        : `Median (fair value − price) / price, ${priceDate} close`,
    },
  ]

  return (
    <section aria-label="At a glance">
      <div className="stat-grid">
        {tiles.map((tile) => {
          const content = (
            <>
              <div className="stat-value">{tile.value}</div>
              <div className="stat-label">{tile.label}</div>
              <div className="footnote">{tile.sub}</div>
            </>
          )
          return (
            <div key={tile.label} className="stat-tile">
              {tile.href ? (
                <Link href={tile.href} className="stat-tile-link">
                  {content}
                </Link>
              ) : (
                content
              )}
            </div>
          )
        })}
      </div>
      <p>
        <Link href="/stocks">Browse all {total} →</Link>
      </p>
    </section>
  )
}
