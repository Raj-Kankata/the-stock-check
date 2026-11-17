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
import { money, pct } from '@/lib/data'
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
