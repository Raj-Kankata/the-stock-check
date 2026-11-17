// Live-price spots on a stock card. The card itself stays a static
// server component (all scores, fair values, legs, grids and verdicts
// are baked nightly model outputs); each spot below is a small client
// island that subscribes to the shared live-price store in
// lib/tradingview.ts and swaps its baked value for the live close after
// mount — so the prerendered HTML keeps the baked close as the initial
// value and there is no hydration mismatch.
//
// Spots that follow the live price:
//   intro line — headline price + LIVE badge / Updated time
//   "Price vs fair value" (verdict card) and "Upside vs price"
//     (valuation card) — upside recomputed from the live price and the
//     baked fair value
//   "Price" (valuation card) — the price itself
//   ladder — footnote price, nearest-rung marker and band, all live
//   "Implied upside vs price" (vs Wall Street) — both columns
//     recomputed from the live price
// Everything else on the card stays baked, including the fair value,
// the leg values, the sensitivity grid and the analyst targets.

'use client'

import { LadderTable, signedPctSpan } from '@/components/ui'
import { money, pct } from '@/lib/format'
import { liveCloseFor, useLiveQuotes } from '@/lib/tradingview'

/** Headline price in the page intro. Baked text until the store is live. */
export function StockLiveIntro({
  symbol,
  bakedPrice,
  priceDate,
}: {
  symbol: string
  bakedPrice: number
  priceDate: string
}) {
  const live = useLiveQuotes()
  const price = liveCloseFor(live, symbol)
  if (price === null) {
    return (
      <>
        Price {money(bakedPrice)} (close, {priceDate})
      </>
    )
  }
  return (
    <>
      Price {money(price)}{' '}
      <span className="live-badge">
        <span className="live-dot" aria-hidden="true" />
        LIVE
      </span>{' '}
      · Updated {live.updatedAt} CT · Prev. close {priceDate}
    </>
  )
}

/** Price value on its own (valuation card "Price" row). */
export function StockLivePrice({
  symbol,
  bakedPrice,
}: {
  symbol: string
  bakedPrice: number
}) {
  const live = useLiveQuotes()
  const price = liveCloseFor(live, symbol)
  return <>{money(price ?? bakedPrice)}</>
}

/**
 * Upside vs fair value, recomputed from the live price when there is
 * one: (fair value − price) / price. Same signed-colour rendering as
 * the baked value.
 */
export function StockLiveUpside({
  symbol,
  fairValue,
  bakedPrice,
}: {
  symbol: string
  fairValue: number
  bakedPrice: number
}) {
  const live = useLiveQuotes()
  const price = liveCloseFor(live, symbol) ?? bakedPrice
  const upside = price > 0 ? (fairValue - price) / price : 0
  return <>{pct(upside)}</>
}

/**
 * A pros/cons line, recomputed live. The fair-value line is baked text
 * in results.json ("Fair value $X is +N% above the $Y price — ..."),
 * so while the headline price is live it would otherwise quote
 * yesterday's close. When the store holds a live price, the percentage
 * and the price are recomputed from the live price and the baked fair
 * value; every other line passes through untouched, and after hours
 * the baked line is shown verbatim. results.json is never edited.
 *
 * The line is always the first item of Pros (price below fair value)
 * or of Cons (price above it). Its tail is kept verbatim except for
 * one case: the Cons tail claims the most generous leg sits below the
 * price. If the live price has fallen to or below that leg — including
 * a flip to below fair value — that claim is no longer true, so the
 * tail falls back to the neutral legs-span wording.
 */
const FV_LINE_RE =
  /^Fair value \$([\d,]+\.\d{2}) is ([+-]\d+)% (above|below) the \$([\d,]+\.\d{2}) price( — .*)?$/

export function StockLiveProConLine({
  line,
  symbol,
  fairValue,
  legMin,
  legMax,
}: {
  line: string
  symbol: string
  fairValue: number
  legMin: number | null
  legMax: number | null
}) {
  const live = useLiveQuotes()
  const price = liveCloseFor(live, symbol)
  if (price === null || fairValue <= 0) return <>{line}</>
  const m = FV_LINE_RE.exec(line)
  if (!m) return <>{line}</>
  const pctWhole = Math.round(((fairValue - price) / price) * 100)
  const direction = pctWhole >= 0 ? 'above' : 'below'
  const signed = pctWhole >= 0 ? `+${pctWhole}` : `${pctWhole}`
  let tail = m[5] ?? ''
  if (/even the most generous leg/.test(tail) && legMax !== null && price <= legMax) {
    tail =
      legMin !== null
        ? ` — the DCF/PEGY/Forward-sector legs span ${money(legMin)}–${money(legMax)}, so treat the fair value, not any single leg, as the anchor.`
        : ''
  }
  return (
    <>
      Fair value {money(fairValue)} is {signed}% {direction} the {money(price)} price{tail}
    </>
  )
}

/** Valuation ladder with the live price driving the marker and band. */
export function StockLiveLadder({
  symbol,
  fairValue,
  bakedPrice,
}: {
  symbol: string
  fairValue: number
  bakedPrice: number
}) {
  const live = useLiveQuotes()
  const price = liveCloseFor(live, symbol)
  return <LadderTable fv={fairValue} price={bakedPrice} livePrice={price} />
}

/**
 * The two "Implied upside vs price" cells in the vs Wall Street table
 * — ours and the analyst consensus mean — both recomputed from the
 * live price. Returns a fragment of two <td>s for use inside the row.
 */
export function StockLiveWallStreetUpsides({
  symbol,
  fairValue,
  targetMean,
  bakedPrice,
}: {
  symbol: string
  fairValue: number
  targetMean: number
  bakedPrice: number
}) {
  const live = useLiveQuotes()
  const price = liveCloseFor(live, symbol) ?? bakedPrice
  const ourUpside = (fairValue - price) / price
  const consensusUpside = (targetMean - price) / price
  return (
    <>
      <td>{signedPctSpan(ourUpside)}</td>
      <td>{signedPctSpan(consensusUpside)}</td>
    </>
  )
}
