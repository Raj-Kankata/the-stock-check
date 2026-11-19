// Live ETF prices — the same honesty rule as components/LivePrice.tsx:
// the prerendered HTML shows baked closes; live values appear only
// after a successful scan in market hours, with a LIVE badge and an
// Updated time. Outside hours or on a failed first fetch, baked closes
// stay up with their as-of label and no LIVE badge.

'use client'

import Link from 'next/link'
import { money } from '@/lib/format'
import type { PublicEtfRow } from '@/lib/public-types'
import {
  hasLiveEtfQuotes,
  liveEtfCloseFor,
  useLiveEtfQuotes,
} from '@/lib/tradingview'
import {
  EtfTypeBadge,
  MomentumReadBadge,
  TechnicalReadBadge,
  scoreSpan,
  signedPctSpan,
} from '@/components/ui'

export function EtfLiveStatusLine({ priceDateLabel }: { priceDateLabel: string }) {
  const live = useLiveEtfQuotes()
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

/** Live price line for an ETF card header: price + day change, following
    the shared ETF store when it holds a live close. */
export function EtfLivePrice({
  symbol,
  price,
  changePct,
}: {
  symbol: string
  price: number
  changePct: number
}) {
  const live = useLiveEtfQuotes()
  const liveNow = hasLiveEtfQuotes(live)
  const livePrice = liveNow ? liveEtfCloseFor(live, symbol) : null
  return (
    <span>
      <strong>{livePrice !== null ? money(livePrice) : money(price)}</strong>{' '}
      {signedPctSpan(changePct, 1, 0.001)} today
    </span>
  )
}

/** Table rows for ETF board rows, with the Price cell following the live
    price when the shared ETF store holds one. Renders the full row:
    ETF, Price, Day, Technical, Momentum, Type, Category, Reads. */
export function LiveEtfRows({ rows }: { rows: PublicEtfRow[] }) {
  const live = useLiveEtfQuotes()
  const liveNow = hasLiveEtfQuotes(live)
  return (
    <>
      {rows.map((t) => {
        const livePrice = liveNow ? liveEtfCloseFor(live, t.symbol) : null
        return (
          <tr key={t.symbol}>
            <td>
              <Link href={`/etf/${t.symbol}`}>
                <strong>{t.symbol}</strong>
              </Link>
              <br />
              <span className="footnote">{t.name}</span>
            </td>
            <td className="num">{livePrice !== null ? money(livePrice) : money(t.price)}</td>
            <td className="num">{signedPctSpan(t.change_pct, 1, 0.001)}</td>
            <td className="num">
              {scoreSpan(t.technical_score)} · {t.technical_read}
            </td>
            <td className="num">{signedPctSpan(t.momentum_score, 1, 0.001)}</td>
            <td>
              <EtfTypeBadge type={t.type} />
            </td>
            <td>{t.category}</td>
            <td>
              <TechnicalReadBadge read={t.technical_read} />{' '}
              <MomentumReadBadge read={t.momentum_read} />
            </td>
          </tr>
        )
      })}
    </>
  )
}
