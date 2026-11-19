// Live index levels — the same honesty rule as components/EtfLive.tsx:
// the prerendered HTML shows baked closes; live values appear only
// after a successful scan in market hours, with a LIVE badge and an
// Updated time. Outside hours or on a failed first fetch, baked closes
// stay up with their as-of label and no LIVE badge.

'use client'

import Link from 'next/link'
import { money } from '@/lib/format'
import type { PublicIndexRow } from '@/lib/public-types'
import {
  hasLiveIndexQuotes,
  liveIndexCloseFor,
  useLiveIndexQuotes,
} from '@/lib/tradingview'
import {
  IndexTypeBadge,
  MomentumReadBadge,
  TechnicalReadBadge,
  scoreSpan,
  signedPctSpan,
} from '@/components/ui'

export function IndexLiveStatusLine({ priceDateLabel }: { priceDateLabel: string }) {
  const live = useLiveIndexQuotes()
  if (live.status === 'live') {
    return (
      <p>
        <span className="live-badge">
          <span className="live-dot" aria-hidden="true" />
          LIVE
        </span>{' '}
        · Updated {live.updatedAt} CT · Levels delayed ~15 min (TradingView) · Prev. close{' '}
        {priceDateLabel}
      </p>
    )
  }
  if (live.status === 'stale') {
    return (
      <p>
        Couldn&apos;t refresh — showing last live update {live.updatedAt ?? '—'} CT · Levels
        delayed ~15 min (TradingView)
      </p>
    )
  }
  if (live.status === 'error') {
    return <p>Live levels could not be loaded — showing the {priceDateLabel} close.</p>
  }
  return null
}

/** Live level line for an index card header: level + day change,
    following the shared index store when it holds a live level. */
export function IndexLivePrice({
  symbol,
  price,
  changePct,
}: {
  symbol: string
  price: number
  changePct: number
}) {
  const live = useLiveIndexQuotes()
  const liveNow = hasLiveIndexQuotes(live)
  const livePrice = liveNow ? liveIndexCloseFor(live, symbol) : null
  return (
    <span>
      <strong>{livePrice !== null ? money(livePrice) : money(price)}</strong>{' '}
      {signedPctSpan(changePct, 1, 0.001)} today
    </span>
  )
}

function regimePill(regime: string | null) {
  if (regime === null) return '—'
  const cls =
    regime === 'Calm' || regime === 'Normal'
      ? 'growth'
      : regime === 'Elevated'
        ? 'watch'
        : 'avoid'
  return <span className={`pill ${cls}`}>{regime}</span>
}

/** Table rows for index board rows, with the Level cell following the
    live level when the shared index store holds one. The `variant`
    picks the column set: price rows show Technical / Momentum / Reads;
    volatility rows show Regime / VIX3M / Ratio instead — VIX has no
    Technical or Momentum score. */
export function LiveIndexRows({
  rows,
  variant,
}: {
  rows: PublicIndexRow[]
  variant: 'price' | 'volatility'
}) {
  const live = useLiveIndexQuotes()
  const liveNow = hasLiveIndexQuotes(live)
  return (
    <>
      {rows.map((t) => {
        const livePrice = liveNow ? liveIndexCloseFor(live, t.symbol) : null
        const level = livePrice !== null ? money(livePrice) : money(t.price)
        return (
          <tr key={t.symbol}>
            <td>
              <Link href={`/index/${t.symbol}`}>
                <strong>{t.symbol}</strong>
              </Link>
              <br />
              <span className="footnote">{t.name}</span>
            </td>
            <td className="num">{level}</td>
            <td className="num">{signedPctSpan(t.change_pct, 1, 0.001)}</td>
            {variant === 'price' ? (
              <>
                <td className="num">
                  {t.technical_score === null ? '—' : `${scoreSpan(t.technical_score)} · ${t.technical_read}`}
                </td>
                <td className="num">
                  {t.momentum_score === null ? '—' : signedPctSpan(t.momentum_score, 1, 0.001)}
                </td>
                <td>
                  <IndexTypeBadge type={t.type} />
                </td>
                <td>
                  {t.technical_read !== null && (
                    <TechnicalReadBadge read={t.technical_read} />
                  )}{' '}
                  {t.momentum_read !== null && (
                    <MomentumReadBadge read={t.momentum_read} />
                  )}
                </td>
              </>
            ) : (
              <>
                <td className="num">{regimePill(t.regime)}</td>
                <td className="num">
                  {t.vix3m === null ? '—' : t.vix3m.toFixed(2)}
                </td>
                <td className="num">
                  {t.vix_vix3m_ratio === null
                    ? '—'
                    : `${t.vix_vix3m_ratio.toFixed(3)} ${t.curve_state ?? ''}`}
                </td>
                <td>
                  <IndexTypeBadge type={t.type} />
                </td>
              </>
            )}
          </tr>
        )
      })}
    </>
  )
}
