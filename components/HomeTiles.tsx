// Homepage "At a glance" tiles. Verdict counts and the names-scored
// count are baked (they come from the nightly model run); the two
// price-dependent tiles — Below fair value and Median upside —
// recompute live client-side from the shared live-price store and the
// baked fair values, which are passed in as a compact per-ticker array.
// The list memberships and rankings elsewhere on the homepage stay
// baked (as-of-close); only the prices shown in them go live.

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import FearGreedDial from '@/components/FearGreedDial'
import { pct } from '@/lib/format'
import {
  fetchFearGreed,
  formatCtTime,
  hasLiveQuotes,
  isMarketHours,
  liveCloseFor,
  useLiveQuotes,
  type FearGreedLive,
} from '@/lib/tradingview'

// CNN Fear & Greed live polls: the endpoint updates through the
// session (roughly every 30 min) and the payload is ~178 KB, so the
// tile polls every 10 minutes during market hours only — never after
// hours, when the baked close value is the reading.
const FG_POLL_MS = 600_000

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
  avCoverage,
  etfCount,
  fearGreed,
}: {
  total: number
  verdictCounts: { Growth: number; Value: number; Watch: number; Avoid: number }
  belowFv: number
  medianUpside: number
  priceDate: string
  fvs: HomeTileFv[]
  /** Alpha Vantage trailing-earnings pull coverage (backtest data, not
      card coverage). Optional: the tile hides when the field is absent. */
  avCoverage?: { pulled: number; universe: number; as_of: string }
  /** ETF board size. Optional: the tile hides when absent. */
  etfCount?: number
  /** CNN Fear & Greed Index (baked close value). Optional: the tile
      hides when absent. Goes live during market hours on 10-minute
      polls (fetchFearGreed) and shows the baked close after hours. */
  fearGreed?: { score: number; rating: string; as_of: string }
}) {
  const live = useLiveQuotes()
  const liveNow = hasLiveQuotes(live)

  // Fear & Greed live state (homepage indicator only — the analysis
  // lives on /pulse). Baked close value until the first live poll
  // lands; after hours the baked value stays on screen, labelled
  // with its date, never as live.
  const [fgLive, setFgLive] = useState<FearGreedLive | null>(null)
  const [fgLiveAt, setFgLiveAt] = useState<string | null>(null)
  useEffect(() => {
    let stopped = false
    const refresh = async () => {
      if (document.hidden || !isMarketHours(new Date())) return
      const next = await fetchFearGreed()
      if (stopped || !next) return
      setFgLive(next)
      setFgLiveAt(formatCtTime(new Date(next.updatedAt)))
    }
    refresh()
    const pollId = setInterval(refresh, FG_POLL_MS)
    return () => {
      stopped = true
      clearInterval(pollId)
    }
  }, [])
  const fgScore =
    fgLive !== null ? fgLive.score : fearGreed ? fearGreed.score : null
  const fgRating =
    fgLive !== null ? fgLive.rating : fearGreed ? fearGreed.rating : null
  const fgAsOf = fearGreed ? fearGreed.as_of : null

  // Live recompute: every ticker with a live close and a positive fair
  // value contributes (fair value − live price) / live price. If the
  // live map is missing a name (it never is — the scan is all-or-none),
  // that name keeps its baked close rather than dropping out.
  // The completeness check is against the scorable names only — the
  // published set carries positive fair values only, so a non-positive
  // fair value never contributes. (The old check compared against all
  // 227 fvs, BYND's non-positive one included, so it never passed and
  // both tiles stayed on the baked close even while live — the tile
  // said 90 while the /stocks pill said the live 92.)
  const scorableFvs = fvs.filter(({ fv }) => fv > 0)
  let liveBelowFv = belowFv
  let liveMedianUpside = medianUpside
  if (liveNow) {
    const upsides: number[] = []
    let below = 0
    for (const { symbol, fv } of scorableFvs) {
      const price = liveCloseFor(live, symbol)
      if (price === null || price <= 0 || fv <= 0) continue
      upsides.push((fv - price) / price)
      if (fv > price) below += 1
    }
    if (upsides.length === scorableFvs.length) {
      liveBelowFv = below
      liveMedianUpside = median(upsides)
    }
  }

  const tiles: {
    label: string
    value: string
    sub: string
    href?: string
    gauge?: number
  }[] = [
    {
      label: 'Names scored',
      value: String(total),
      sub: liveNow
        ? 'Prices live during market hours'
        : `Prices as of the ${priceDate} close`,
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

  // ETFs tracked (separate data product — no fair values, no verdicts):
  // an extra tile only when the count is present.
  if (etfCount !== undefined) {
    tiles.push({
      label: 'ETFs tracked',
      value: String(etfCount),
      sub: 'Technical + Momentum reads · no fair value',
      href: '/etfs',
    })
  }

  // CNN Fear & Greed Index — the homepage indicator only: value,
  // label, and a small dial gauge (FearGreedDial, CNN's own layout).
  // No analysis text here; the analysis lives on /pulse. The dial
  // needle sits at the score on CNN's 0–100 scale (Extreme Fear 0–25
  // · Fear 25–45 · Neutral 45–55 · Greed 55–75 · Extreme Greed
  // 75–100); the tile's big number is the score, so the small dial
  // carries no centre number of its own.
  if (fgScore !== null && fgRating !== null) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const asOfTxt =
      fgAsOf !== null
        ? (() => {
            const [, mm, dd] = fgAsOf.split('-').map(Number)
            return `${months[mm - 1]} ${dd}`
          })()
        : null
    tiles.push({
      label: 'Fear & Greed',
      value: String(Math.round(fgScore)),
      sub:
        fgLive !== null && fgLiveAt !== null
          ? `${fgRating} · live ${fgLiveAt} CT`
          : asOfTxt !== null
            ? `${fgRating} · as of ${asOfTxt} close`
            : fgRating,
      href: '/pulse',
      gauge: fgScore,
    })
  }

  // Trailing-earnings pull coverage (backtest calibration data, NOT card
  // coverage): an extra tile only when the field is present in the baked
  // data. The count updates with the nightly refresh and lags the pull
  // by a day — the as-of date says which pull it is.
  if (avCoverage) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const [, mm, dd] = avCoverage.as_of.split('-').map(Number)
    tiles.push({
      label: 'Trailing earnings pulled',
      value: `${avCoverage.pulled} of ${avCoverage.universe}`,
      sub: `As of ${months[mm - 1]} ${dd} · backtest data only`,
    })
  }

  return (
    <section aria-label="At a glance">
      <div className="stat-grid">
        {tiles.map((tile) => {
          const content = (
            <>
              <div className="stat-value">{tile.value}</div>
              <div className="stat-label">{tile.label}</div>
              <div className="footnote">{tile.sub}</div>
              {tile.gauge !== undefined ? (
                <FearGreedDial score={tile.gauge} variant="small" />
              ) : null}
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
        {etfCount !== undefined && (
          <>
            {' · '}
            <Link href="/etfs">Browse all {etfCount} ETFs →</Link>
          </>
        )}
      </p>
    </section>
  )
}
