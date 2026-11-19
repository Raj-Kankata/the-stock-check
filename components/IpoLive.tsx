// Live IPO prices — the same honesty rule as components/IndexLive.tsx:
// the prerendered HTML shows baked closes; live values appear only
// after a successful scan in market hours, with a LIVE badge and an
// Updated time. Outside hours or on a failed first fetch, baked closes
// stay up with their as-of label and no LIVE badge.

'use client'

import Link from 'next/link'
import { bigUsd, money, pct } from '@/lib/format'
import type { PublicIpoRow } from '@/lib/public-types'
import {
  hasLiveIpoQuotes,
  liveIpoCloseFor,
  useLiveIpoQuotes,
} from '@/lib/tradingview'
import { signedPctSpan } from '@/components/ui'

export function IpoLiveStatusLine({ priceDateLabel }: { priceDateLabel: string }) {
  const live = useLiveIpoQuotes()
  if (live.status === 'live') {
    return (
      <p>
        <span className="live-badge">
          <span className="live-dot" aria-hidden="true" />
          LIVE
        </span>{' '}
        · Updated {live.updatedAt} CT · Prices delayed ~15 min (TradingView) · Prev. close{' '}
        {priceDateLabel}
      </p>
    )
  }
  if (live.status === 'stale') {
    return (
      <p>
        Couldn&apos;t refresh — showing last live update {live.updatedAt ?? '—'} CT · Prices
        delayed ~15 min (TradingView)
      </p>
    )
  }
  if (live.status === 'error') {
    return <p>Live prices could not be loaded — showing the {priceDateLabel} close.</p>
  }
  return null
}

/** Live price line for a dossier header: price + day change, following
    the shared IPO store when it holds a live price. `changePct` may be
    null on a name's first trading day — the caller shows the change vs
    the offer price instead. */
export function IpoLivePrice({
  symbol,
  price,
  changePct,
}: {
  symbol: string
  price: number
  changePct: number | null
}) {
  const live = useLiveIpoQuotes()
  const liveNow = hasLiveIpoQuotes(live)
  const livePrice = liveNow ? liveIpoCloseFor(live, symbol) : null
  return (
    <span>
      <strong>{livePrice !== null ? money(livePrice) : money(price)}</strong>{' '}
      {changePct !== null ? signedPctSpan(changePct, 1, 0.001) : null} today
    </span>
  )
}

/** Table rows for the /ipos board, with the Price cell following the
    live price when the shared IPO store holds one. */
export function LiveIpoRows({ rows }: { rows: PublicIpoRow[] }) {
  const live = useLiveIpoQuotes()
  const liveNow = hasLiveIpoQuotes(live)
  return (
    <>
      {rows.map((t) => {
        const livePrice = liveNow ? liveIpoCloseFor(live, t.symbol) : null
        const price = livePrice !== null ? livePrice : t.price
        // A resumed entry (NBIS) has no offer price — 'vs offer' is
        // never computed for it; the row shows an em dash instead.
        const vsOffer = t.offer_price !== null ? price / t.offer_price - 1 : null
        return (
          <tr key={t.symbol}>
            <td>
              <Link href={`/ipo/${t.symbol}`}>
                <strong>{t.symbol}</strong>
              </Link>
              <br />
              <span className="footnote">{t.company}</span>
            </td>
            <td className="num">{money(price)}</td>
            <td className="num">
              {vsOffer !== null ? signedPctSpan(vsOffer, 1, 0.001) : '—'}
            </td>
            <td className="num">{bigUsd(t.market_cap_outstanding_usd)}</td>
            <td className="num">
              {t.bars} / 200
            </td>
            <td className="num">
              {t.quarters_filed} / {t.quarters_needed}
            </td>
            <td>{t.unlock_eta}</td>
          </tr>
        )
      })}
    </>
  )
}
