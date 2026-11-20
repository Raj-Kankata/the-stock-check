// Live theme prices — the same honesty rule as components/IpoLive.tsx:
// the prerendered HTML shows baked closes; live values appear only
// after a successful scan in market hours, with a LIVE badge and an
// Updated time. Outside hours or on a failed first fetch, baked closes
// stay up with their as-of label and no LIVE badge.
//
// The price goes live; YTD and Since first trade recompute from the
// live price (the baselines are frozen, so it is the same arithmetic
// as the baked columns). Scores and verdicts never move intraday —
// they are the scored card's, as of the close.

'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { dateLabel, money } from '@/lib/format'
import type { PublicThemeRow } from '@/lib/public-types'
import {
  hasLiveThemeQuotes,
  liveThemeCloseFor,
  useLiveThemeQuotes,
} from '@/lib/tradingview'
import { VerdictBadge, scoreSpan, signedPctSpan, signedSpan } from '@/components/ui'

export function ThemeLiveStatusLine({ priceDateLabel }: { priceDateLabel: string }) {
  const live = useLiveThemeQuotes()
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

/** Percentage span for theme columns: the usual one-decimal read,
    except a four-figure-plus percentage (Oracle's 40-year
    split-adjusted run) renders with no decimals and thousands
    separators, so +179,821% reads as a number instead of a blur. */
function themePctSpan(frac: number): ReactNode {
  if (Math.abs(frac) >= 10) {
    const v = frac * 100
    const text = `${v > 0 ? '+' : ''}${Math.round(v).toLocaleString('en-US')}%`
    return signedSpan(frac, text, 0.001)
  }
  return signedPctSpan(frac, 1, 0.001)
}

/** Table rows for the /themes/neo-cloud board, with the Price cell
    (and the two returns computed from it) following the live price
    when the shared theme store holds one. */
export function LiveThemeRows({ rows }: { rows: PublicThemeRow[] }) {
  const live = useLiveThemeQuotes()
  const liveNow = hasLiveThemeQuotes(live)
  return (
    <>
      {rows.map((t) => {
        const livePrice = liveNow ? liveThemeCloseFor(live, t.symbol) : null
        const price = livePrice !== null ? livePrice : t.price
        const ytd = price / t.ytd_base_close - 1
        const sinceFirst = price / t.first_close - 1
        const ticker = (
          <>
            <strong>{t.symbol}</strong>
            <br />
            <span className="footnote">
              {t.name}
              {t.kind === 'hyperscaler' ? ' · Hyperscaler — for comparison' : ''}
            </span>
            {!t.has_card && !t.has_dossier ? (
              <>
                <br />
                <span className="footnote">No scored card yet</span>
              </>
            ) : null}
          </>
        )
        return (
          <tr key={t.symbol}>
            <td>
              {t.has_card ? (
                <Link href={`/stock/${t.symbol}`}>{ticker}</Link>
              ) : t.has_dossier ? (
                <Link href={`/ipo/${t.symbol}`}>{ticker}</Link>
              ) : (
                ticker
              )}
            </td>
            <td className="num">{money(price)}</td>
            <td className="num">{themePctSpan(ytd)}</td>
            <td className="num">{themePctSpan(sinceFirst)}</td>
            <td>
              {dateLabel(t.first_trade_date)} · {money(t.first_close)}
              {t.first_close_split_adjusted ? ' split-adj.' : ''}
            </td>
            <td className="num">
              {t.overall_score !== null ? scoreSpan(t.overall_score) : '—'}
            </td>
            <td>{t.verdict !== null ? <VerdictBadge verdict={t.verdict} /> : '—'}</td>
          </tr>
        )
      })}
    </>
  )
}
