// Shared live-price UI: the status line and live table rows every live
// surface reuses. All of them subscribe to the single shared store in
// lib/tradingview.ts — one scan per poll per page, no matter how many
// of these components are on screen.
//
// Honesty rule, same as the header strip and the Trending boards: the
// prerendered HTML (and the first client render, status 'loading')
// shows baked closes; live values appear only after a successful scan
// in market hours, with a LIVE badge and an Updated time. Outside hours
// or on a failed first fetch, baked closes stay up with their as-of
// label and no LIVE badge.

'use client'

import { StockRow } from '@/components/ui'
import type { PublicStockRow } from '@/lib/public-types'
import { hasLiveQuotes, liveCloseFor, useLiveQuotes } from '@/lib/tradingview'

/**
 * One-line live status for a table or card. Renders nothing while
 * loading or after hours — the surrounding baked as-of copy already
 * covers those states — and only speaks up when there is something to
 * say: live, stale (last-good values), or error (baked closes shown).
 */
export function LiveStatusLine({ priceDateLabel }: { priceDateLabel: string }) {
  const live = useLiveQuotes()
  if (live.status === 'live') {
    return (
      <p>
        <span className="live-badge">
          <span className="live-dot" aria-hidden="true" />
          LIVE
        </span>{' '}
        · Updated {live.updatedAt} CT · Quotes delayed ~15 min (TradingView) · Prev. close{' '}
        {priceDateLabel}
      </p>
    )
  }
  if (live.status === 'stale') {
    return (
      <p>
        Couldn&apos;t refresh — showing last live update {live.updatedAt ?? '—'} CT · Quotes
        delayed ~15 min (TradingView)
      </p>
    )
  }
  if (live.status === 'error') {
    return <p>Live prices could not be loaded — showing the {priceDateLabel} close.</p>
  }
  return null
}

/**
 * Table rows for a list of tickers, with the Price and Upside cells
 * following the live price when the shared store holds one. The rows
 * themselves (verdict, score, fair value) are baked model outputs and
 * never change. Renders as a fragment of <tr>s for use inside <tbody>.
 */
export function LiveStockRows({
  rows,
}: {
  rows: PublicStockRow[]
}) {
  const live = useLiveQuotes()
  const liveNow = hasLiveQuotes(live)
  return (
    <>
      {rows.map((t) => (
        <StockRow
          key={t.symbol}
          t={t}
          livePrice={liveNow ? liveCloseFor(live, t.symbol) : null}
        />
      ))}
    </>
  )
}
