// Performance page — live "Latest close" column. Entry prices stay
// frozen (they are the audit trail); the latest price and the return
// recompute from the live close during market hours, via the shared
// live-price store in lib/tradingview.ts. After hours, or if the scan
// fails, the baked close from this build's data is shown with its
// as-of label and no LIVE badge. The equal-weight portfolio return is
// the mean of that cohort's live returns while live. One instance of
// this component renders one cohort — cohorts are never blended.

'use client'

import Link from 'next/link'
import { money } from '@/lib/format'
import { Card, signedPctSpan } from '@/components/ui'
import { hasLiveQuotes, liveCloseFor, useLiveQuotes } from '@/lib/tradingview'

export interface PerformanceRow {
  symbol: string
  name: string
  entryPrice: number
  bakedLatest: number
}

export default function PerformanceLive({
  rows,
  entryDate,
  latestCloseDate,
  title,
  nvoNote,
}: {
  rows: PerformanceRow[]
  entryDate: string
  latestCloseDate: string
  /** Card title — one cohort per instance, e.g. 'Launch picks (entered 13 Nov 2026)'. */
  title: string
  /** Only the launch cohort carries the NVO audit note. */
  nvoNote?: boolean
}) {
  const live = useLiveQuotes()
  const liveNow = hasLiveQuotes(live)

  const measured = rows.map((r) => {
    const latest = liveNow ? (liveCloseFor(live, r.symbol) ?? r.bakedLatest) : r.bakedLatest
    return { ...r, latest, ret: (latest - r.entryPrice) / r.entryPrice }
  })
  const portfolioReturn =
    measured.length > 0
      ? measured.reduce((sum, r) => sum + r.ret, 0) / measured.length
      : null

  return (
    <Card title={title}>
      {live.status === 'live' ? (
        <p>
          <span className="live-badge">
            <span className="live-dot" aria-hidden="true" />
            LIVE
          </span>{' '}
          · Updated {live.updatedAt} CT · Quotes delayed ~15 min (TradingView) · Prev. close{' '}
          {latestCloseDate}
        </p>
      ) : live.status === 'stale' ? (
        <p>
          Couldn&apos;t refresh — showing last live update {live.updatedAt ?? '—'} CT · Quotes
          delayed ~15 min (TradingView)
        </p>
      ) : live.status === 'error' ? (
        <p>Live prices could not be loaded — showing the {latestCloseDate} close.</p>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>Stock</th>
            <th>Entry date</th>
            <th className="num">Entry price</th>
            <th className="num">{liveNow ? 'Latest (live)' : 'Latest close'}</th>
            <th className="num">Return since entry</th>
          </tr>
        </thead>
        <tbody>
          {measured.map(({ symbol, name, entryPrice, latest, ret }) => (
            <tr key={symbol}>
              <td>
                <Link href={`/stock/${symbol}`}>
                  <strong>{symbol}</strong>
                </Link>
                <br />
                <span className="footnote">{name}</span>
              </td>
              <td>{entryDate}</td>
              <td className="num">{money(entryPrice)}</td>
              <td className="num">{money(latest)}</td>
              <td className="num">{signedPctSpan(ret)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="footnote">
        {liveNow ? (
          <>
            Return = (live price − entry price) ÷ entry price, measured from the {entryDate}{' '}
            close to the live price (Updated {live.updatedAt} CT; quotes delayed ~15 min).
            After hours the return is entry → {latestCloseDate} close. The print lengthens
            with every nightly refresh; it is a return since entry, not a track record.
          </>
        ) : (
          <>
            Return = (latest close − entry price) ÷ entry price, measured from the {entryDate}{' '}
            close to the {latestCloseDate} close — the closes since entry. During market
            hours this table shows live prices instead, and the return is then entry → live
            price. The print lengthens with every nightly refresh; it is a return since
            entry, not a track record.
          </>
        )}
        {nvoNote ? (
          <>
            {' '}
            NVO was published as a pick on 13 Nov 2026 (entry $41.63) and removed from
            tracking when its card was unpublished under the three-leg-only policy.
          </>
        ) : null}
      </p>
      {portfolioReturn !== null ? (
        <p>
          <strong>
            Equal-weight portfolio return since entry: {signedPctSpan(portfolioReturn)}
          </strong>{' '}
          <span className="footnote">
            (mean of the {measured.length} picks above, {entryDate} entry to{' '}
            {liveNow ? 'live price' : `${latestCloseDate} close`})
          </span>
        </p>
      ) : null}
      <p className="footnote">
        <strong>How to read these prices.</strong> The entry price is the closing price on{' '}
        {entryDate} — frozen forever; no refresh ever changes it. It is the audit anchor:
        every return here can be recomputed from the entry price, the latest price, and the
        equal-weight, no-cost, no-dividend method. During market hours (09:30–16:00 ET)
        this table shows live prices, polled about once a minute from TradingView, and the
        return shown is entry price → live price, so the numbers move while the market is
        open. At the close, and outside market hours, the table shows the baked close from
        the most recent nightly refresh (05:20 UTC) — the latest close shown is the{' '}
        {latestCloseDate} close — and the return is entry price → that close; each nightly
        refresh adds one more close and the record lengthens by a day. Past performance
        does not guarantee future results — the full note is at the bottom of the page.
      </p>
    </Card>
  )
}
