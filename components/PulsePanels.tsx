// Market Pulse panels — six readings, each with its rule printed on
// the page. A regime label with no rule is worse than "unavailable".
//
// Data sources, and what is live vs baked:
//   * Trend — SPY price (live in market hours via fetchSymbolQuote,
//     baked Nov-16 close otherwise) vs the nightly 50/200-day EMAs in
//     lib/data/macro.json (same EMA formulas as the stock technicals).
//   * Breadth — market-wide advance/decline counts from the
//     TradingView scanner (fetchMarketBreadth: one filtered scan per
//     sign of the day change; verified 17 Nov 2026 from curl). After
//     hours the scanner returns the frozen close values, labelled as
//     of the close. Baked fallback: the 227-name counts in macro.json.
//   * Volatility — VIX live via fetchSymbolQuote (CBOE:VIX), baked
//     FRED VIXCLS otherwise; expected daily SPX move = VIX / sqrt(252).
//   * Credit — nightly only (FRED BAML spreads); no intraday feed
//     exists, so this panel never pretends to be live.
//   * Internals — % of the 227 above their 50-day EMA + new 52-week
//     closing highs, baked from macro.json and recomputed live from
//     the shared useLiveQuotes() store. Put/call has NO free CORS-clean
//     source — it is not published here, and the panel says so.
//   * Macro Regime — the 4-component FRED composite in macro.json
//     (GDP / industrial production / unemployment / retail sales; each
//     favorable when it moved the right way vs its previous release).
//
// Cadence (printed on the page, and the old "every 6 hours" claim is
// gone): market panels refresh live during market hours (09:30–16:00
// ET, 60s polls); credit and macro refresh nightly (~05:20 UTC) from
// FRED. The brief at the top is recomputed from the same panel data,
// never hand-written — baked values prerender it, live values update it.
//
// Hydration: the prerendered HTML shows baked closes only; the first
// client render is identical, and live values fill in after mount —
// the same pattern as components/MarketStrip.tsx and TrendingBoards.

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui'
import macroJson from '@/lib/data/macro.json'
import marketJson from '@/lib/data/market.json'
import {
  fetchMarketBreadth,
  fetchSymbolQuote,
  formatCtTime,
  hasLiveQuotes,
  isMarketHours,
  useLiveQuotes,
  type MarketBreadth,
  type TvSymbolQuote,
} from '@/lib/tradingview'

const POLL_MS = 60_000

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null
  const parts = iso.split('-').map(Number)
  const [y, m, d] = parts
  if (!y || !m || !d || m < 1 || m > 12) return null
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

function num(n: number): string {
  return n.toLocaleString('en-US')
}

// ------------------------------------------------------------------ types
// Defensive shapes: a missing or malformed field degrades its panel to
// an honest "unavailable" instead of crashing the page.

interface MacroComponent {
  label?: string
  value?: number
  as_of?: string
  prev_value?: number
  prev_as_of?: string
  change?: number
  change_unit?: string
  favorable?: boolean
}

interface MacroData {
  as_of?: string
  source?: string
  spy?: { close?: number; as_of?: string; ema50?: number; ema200?: number }
  vix?: { value?: number; as_of?: string }
  credit?: {
    hy_spread?: { value?: number; as_of?: string }
    hy_spread_1m_ago?: { value?: number; as_of?: string }
    hy_spread_change_bp?: number
    ig_spread?: { value?: number; as_of?: string }
    ig_spread_1m_ago?: { value?: number; as_of?: string }
    ig_spread_change_bp?: number
  }
  macro?: {
    components?: Record<string, MacroComponent>
    favorable_count?: number
    total?: number
  }
  universe?: {
    as_of?: string
    total?: number
    above_50dma?: number
    new_52w_highs?: number
    advancers?: number
    decliners?: number
    unchanged?: number
    tickers?: Record<string, { ema50?: number; high_52w?: number }>
  }
}

interface MarketData {
  as_of?: string
  indices?: { symbol?: string; label?: string; close?: number }[]
}

type Status = 'loading' | 'live' | 'closed' | 'stale' | 'error'

interface LiveQuotes {
  spy: TvSymbolQuote
  spx: TvSymbolQuote
  vix: TvSymbolQuote
}

// ------------------------------------------------------------------ rules
// Each rule is a pure function of the numbers, used for both the baked
// prerender and the live update — the label can never disagree with the
// numbers on screen.

function trendLabel(
  price: number,
  ema50: number,
  ema200: number,
): 'Uptrend' | 'Mixed' | 'Downtrend' {
  // Uptrend: above the 50-day with the 50-day above the 200-day.
  // Downtrend: below the 200-day (or below the 50-day while the
  // 50-day is itself below the 200-day). Between the two averages is
  // Mixed — a pullback below the 50-day is not a downtrend while the
  // price still holds above the 200-day.
  if (price > ema50 && ema50 > ema200) return 'Uptrend'
  if (price < ema200 || (price < ema50 && ema50 < ema200)) return 'Downtrend'
  return 'Mixed'
}

function vixBand(vix: number): string {
  if (vix < 15) return 'Calm'
  if (vix < 20) return 'Normal'
  if (vix < 30) return 'Elevated'
  if (vix < 40) return 'High'
  return 'Extreme'
}

function creditLabel(hy: number): string {
  if (hy < 4) return 'Calm'
  if (hy < 6) return 'Normal'
  if (hy < 8) return 'Elevated'
  return 'Stressed'
}

function macroLabel(favorable: number, total: number): string {
  if (total <= 0) return 'Unknown'
  if (favorable === total) return 'Expansion'
  if (favorable === total - 1) return 'Growth'
  if (favorable * 2 === total) return 'Mixed'
  if (favorable === 1) return 'Slowing'
  if (favorable === 0) return 'Contraction'
  return 'Mixed'
}

function internalsGuide(pctAbove: number): string {
  if (pctAbove > 70) return 'broad strength'
  if (pctAbove < 30) return 'broad weakness'
  return 'mixed breadth under the surface'
}

const MACRO_ORDER = ['gdp', 'indpro', 'unrate', 'rsafs'] as const

export default function PulsePanels() {
  const macro = macroJson as unknown as MacroData
  const market = marketJson as unknown as MarketData

  // ---- baked values (prerendered; also the after-hours reading) ----
  const spyBaked = macro.spy && isFiniteNumber(macro.spy.close)
    ? macro.spy.close!
    : null
  const ema50 = macro.spy && isFiniteNumber(macro.spy.ema50)
    ? macro.spy.ema50!
    : null
  const ema200 = macro.spy && isFiniteNumber(macro.spy.ema200)
    ? macro.spy.ema200!
    : null
  const vixBaked = macro.vix && isFiniteNumber(macro.vix.value)
    ? macro.vix.value!
    : null
  const spxBaked =
    Array.isArray(market.indices)
      ? market.indices.find((i) => i.symbol === '^GSPC')
      : undefined
  const spxBakedClose =
    spxBaked && isFiniteNumber(spxBaked.close) ? spxBaked.close! : null
  const closeLabel = formatDate(macro.as_of) ?? formatDate(market.as_of) ?? '—'

  const hy = macro.credit?.hy_spread
  const hyBaked = hy && isFiniteNumber(hy.value) ? hy.value! : null
  const ig = macro.credit?.ig_spread
  const igBaked = ig && isFiniteNumber(ig.value) ? ig.value! : null
  const favCount = macro.macro && isFiniteNumber(macro.macro.favorable_count)
    ? macro.macro.favorable_count!
    : null
  const favTotal = macro.macro && isFiniteNumber(macro.macro.total)
    ? macro.macro.total!
    : null
  const universe = macro.universe

  // ---- live state (fills in after mount; never in the prerender) ----
  const liveStore = useLiveQuotes()
  const [quotes, setQuotes] = useState<LiveQuotes | null>(null)
  const [quotesStatus, setQuotesStatus] = useState<Status>('loading')
  const [quotesUpdatedAt, setQuotesUpdatedAt] = useState<string | null>(null)
  const [breadth, setBreadth] = useState<MarketBreadth | null>(null)
  const [breadthStatus, setBreadthStatus] = useState<Status>('loading')
  const [breadthUpdatedAt, setBreadthUpdatedAt] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  // Refs mirror the last-good values so the interval callbacks (bound
  // once per retryTick) can tell stale (something on screen) from error
  // (nothing ever loaded) without a stale state closure.
  const quotesRef = useRef<LiveQuotes | null>(null)
  const breadthRef = useRef<MarketBreadth | null>(null)

  useEffect(() => {
    let stopped = false

    const refreshQuotes = async () => {
      if (document.hidden) return
      const liveNow = isMarketHours(new Date())
      if (!liveNow) {
        // Session ended while the page was open: back to baked closes.
        if (!stopped) {
          quotesRef.current = null
          setQuotes(null)
          setQuotesStatus('closed')
          setQuotesUpdatedAt(null)
        }
        return
      }
      const [spy, spx, vix] = await Promise.all([
        fetchSymbolQuote('AMEX:SPY'),
        fetchSymbolQuote('SP:SPX'),
        fetchSymbolQuote('CBOE:VIX'),
      ])
      if (stopped) return
      // All three quotes or none: a half-live panel would mix fresh
      // numbers with stale ones under one timestamp.
      if (spy && spx && vix) {
        const next = { spy, spx, vix }
        quotesRef.current = next
        setQuotes(next)
        setQuotesStatus('live')
        setQuotesUpdatedAt(formatCtTime(new Date()))
      } else if (quotesRef.current) {
        setQuotesStatus('stale')
      } else {
        setQuotesStatus('error')
      }
    }

    const refreshBreadth = async () => {
      if (document.hidden) return
      const liveNow = isMarketHours(new Date())
      const next = await fetchMarketBreadth()
      if (stopped) return
      if (next) {
        breadthRef.current = next
        setBreadth(next)
        setBreadthStatus(liveNow ? 'live' : 'closed')
        setBreadthUpdatedAt(formatCtTime(new Date()))
      } else if (breadthRef.current) {
        setBreadthStatus('stale')
      } else {
        setBreadthStatus('error')
      }
    }

    const refresh = () => {
      void refreshQuotes()
      void refreshBreadth()
    }
    refresh()
    const pollId = setInterval(() => {
      if (!isMarketHours(new Date())) {
        // Outside market hours the polls stop; the breadth values on
        // screen are the close values, so only the label flips.
        setQuotesStatus('closed')
        quotesRef.current = null
        setQuotes(null)
        setQuotesUpdatedAt(null)
        setBreadthStatus((s) => (s === 'live' ? 'closed' : s))
        return
      }
      refresh()
    }, POLL_MS)
    return () => {
      stopped = true
      clearInterval(pollId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTick])

  // ---- live 227-name internals from the shared store ----
  const liveInternals = useMemo(() => {
    if (!hasLiveQuotes(liveStore) || !universe?.tickers) return null
    let n = 0
    let above = 0
    let highs = 0
    let adv = 0
    let dec = 0
    let upVol = 0
    let downVol = 0
    for (const [sym, t] of Object.entries(universe.tickers)) {
      const q = liveStore.quotes!.get(sym)
      if (!q) continue
      if (!isFiniteNumber(t.ema50) || !isFiniteNumber(t.high_52w)) continue
      n++
      if (q.close > t.ema50!) above++
      if (q.close >= t.high_52w!) highs++
      if (q.changePct !== null) {
        if (q.changePct > 0) {
          adv++
          upVol += q.volume ?? 0
        } else if (q.changePct < 0) {
          dec++
          downVol += q.volume ?? 0
        }
      }
    }
    if (n === 0) return null
    return { n, above, highs, adv, dec, upVol, downVol }
  }, [liveStore, universe])

  // ---- current readings: live where available, baked otherwise ----
  const spyPrice = quotes ? quotes.spy.close : spyBaked
  const spxPrice = quotes ? quotes.spx.close : spxBakedClose
  const vixValue = quotes ? quotes.vix.close : vixBaked
  const isLive = quotesStatus === 'live'
  const trend =
    spyPrice !== null && ema50 !== null && ema200 !== null
      ? trendLabel(spyPrice, ema50, ema200)
      : null
  const vixRegime = vixValue !== null ? vixBand(vixValue) : null
  const expectedMovePct =
    vixValue !== null ? vixValue / Math.sqrt(252) / 100 : null
  const expectedMovePts =
    expectedMovePct !== null && spxPrice !== null
      ? expectedMovePct * spxPrice
      : null
  const credit =
    hyBaked !== null ? creditLabel(hyBaked) : null
  const macroRegime =
    favCount !== null && favTotal !== null
      ? macroLabel(favCount, favTotal)
      : null
  const adRatio =
    breadth && breadth.decliners > 0
      ? breadth.advancers / breadth.decliners
      : null

  // Live 227 internals when the store has them, else the baked counts.
  const above50 = liveInternals
    ? liveInternals.above
    : universe && isFiniteNumber(universe.above_50dma)
      ? universe.above_50dma!
      : null
  const newHighs = liveInternals
    ? liveInternals.highs
    : universe && isFiniteNumber(universe.new_52w_highs)
      ? universe.new_52w_highs!
      : null
  const universeTotal = universe && isFiniteNumber(universe.total)
    ? universe.total!
    : null
  const above50Pct =
    above50 !== null && universeTotal ? (above50 / universeTotal) * 100 : null

  // ---- the brief: recomputed from the same panel data ----
  const briefParts: string[] = []
  if (trend && spyPrice !== null && ema50 !== null) {
    briefParts.push(
      `Trend ${trend.toLowerCase()} (SPY $${spyPrice.toFixed(2)} vs 50-day $${ema50.toFixed(2)})`,
    )
  }
  if (adRatio !== null && breadth) {
    briefParts.push(
      `breadth ${adRatio >= 1 ? 'positive' : 'negative'} (A/D ${adRatio.toFixed(2)}, ${num(breadth.advancers)} advancers vs ${num(breadth.decliners)} decliners)`,
    )
  } else if (
    universe &&
    isFiniteNumber(universe.advancers) &&
    isFiniteNumber(universe.decliners)
  ) {
    briefParts.push(
      `breadth negative among the 227 (${num(universe.advancers!)} advancers vs ${num(universe.decliners!)} decliners at the ${closeLabel} close)`,
    )
  }
  if (vixRegime && vixValue !== null) {
    briefParts.push(`VIX ${vixRegime.toLowerCase()} at ${vixValue.toFixed(2)}`)
  }
  if (credit && hyBaked !== null) {
    briefParts.push(`credit ${credit.toLowerCase()} (HY spread ${hyBaked.toFixed(2)}%)`)
  }
  if (macroRegime && favCount !== null && favTotal !== null) {
    briefParts.push(
      `macro ${macroRegime.toLowerCase()} (${favCount} of ${favTotal} components improving)`,
    )
  }
  const brief =
    briefParts.length > 0
      ? `${briefParts.join('; ')}.`
      : 'Pulse readings could not be computed from the baked data.'

  const liveLine = isLive
    ? `LIVE · Updated ${quotesUpdatedAt ?? '—'} CT · Quotes delayed ~15 min (TradingView)`
    : quotesStatus === 'closed'
      ? `As of the ${closeLabel} close`
      : quotesStatus === 'stale'
        ? `Couldn't refresh — showing last update ${quotesUpdatedAt ?? '—'} CT`
        : quotesStatus === 'error'
          ? 'Live quotes could not be loaded — showing the last close.'
          : 'Loading live quotes…'
  const breadthLine =
    breadthStatus === 'live'
      ? `LIVE · Updated ${breadthUpdatedAt ?? '—'} CT`
      : breadthStatus === 'closed'
        ? `As of the ${closeLabel} close`
        : breadthStatus === 'stale'
          ? `Couldn't refresh — showing last update ${breadthUpdatedAt ?? '—'} CT`
          : breadthStatus === 'error'
            ? 'Market-wide scan could not be reached — showing the 227-name counts below.'
            : 'Loading market-wide breadth…'

  return (
    <>
      <div className="callout blue">
        <p>
          <strong>Brief — {isLive ? 'live.' : `as of the ${closeLabel} close.`} </strong>
          {brief}
        </p>
        <p>
          {isLive ? (
            <>
              <span className="live-badge">
                <span className="live-dot" aria-hidden="true" />
                LIVE
              </span>{' '}
              · {liveLine}
            </>
          ) : (
            liveLine
          )}
        </p>
        <p className="footnote">
          Market panels refresh live during market hours (09:30–16:00 ET,
          60-second polls) and show the last close after hours. Credit and
          macro refresh nightly (~05:20 UTC) from FRED.
        </p>
      </div>

      <div className="two-col">
        <Card title={`Trend — ${trend ?? 'Unavailable'}`} accent={trend === 'Uptrend' ? 'green' : trend === 'Downtrend' ? 'red' : undefined}>
          {spyPrice !== null && ema50 !== null && ema200 !== null ? (
            <>
              <p>
                <strong>{trend}.</strong> SPY ${spyPrice.toFixed(2)} is{' '}
                {spyPrice > ema50 ? 'above' : 'below'} its 50-day average
                (${ema50.toFixed(2)}) and{' '}
                {spyPrice > ema200 ? 'above' : 'below'} its 200-day average
                (${ema200.toFixed(2)}).
                {ema50 > ema200
                  ? ' The 50-day is above the 200-day.'
                  : ' The 50-day is below the 200-day.'}
              </p>
              <p className="footnote">
                Rule: Uptrend = price above the 50-day average with the
                50-day above the 200-day; Downtrend = price below the
                200-day average (or below the 50-day while the 50-day is
                itself below the 200-day); Mixed = price between the two
                averages. Averages are EMAs, the same formula as the
                stock technicals.
              </p>
              <p className="footnote">
                Source: SPY price {isLive ? 'live (TradingView, ~15 min delayed)' : `at the ${closeLabel} close`};
                averages from the nightly refresh (Yahoo Finance), as of {formatDate(macro.spy?.as_of) ?? '—'}.
              </p>
            </>
          ) : (
            <p>
              <strong>Data unavailable.</strong> No SPY price or moving
              average in this build, so no trend reading is published.
            </p>
          )}
        </Card>

        <Card title="Breadth">
          {breadth ? (
            <>
              <p>
                <strong>
                  {adRatio !== null
                    ? `${adRatio >= 1 ? 'More advancers' : 'More decliners'} — A/D ${adRatio.toFixed(2)}.`
                    : 'Advance/decline counts loaded.'}
                </strong>{' '}
                {num(breadth.advancers)} advancers, {num(breadth.decliners)}{' '}
                decliners, {num(breadth.unchanged)} unchanged, of{' '}
                {num(breadth.total)} US-listed stocks scanned.
              </p>
              <p className="footnote">{breadthLine}</p>
            </>
          ) : (
            <>
              <p>
                <strong>Market-wide breadth unavailable.</strong>{' '}
                {breadthStatus === 'loading'
                  ? 'The scan is still loading.'
                  : 'The live scan could not be reached, so no market-wide count is shown — the 227-name counts below are the reading instead.'}
              </p>
              {breadthStatus === 'error' ? (
                <p>
                  <button type="button" className="btn" onClick={() => setRetryTick((n) => n + 1)}>
                    Retry
                  </button>
                </p>
              ) : null}
            </>
          )}
          {universe &&
          isFiniteNumber(universe.advancers) &&
          isFiniteNumber(universe.decliners) &&
          isFiniteNumber(universe.unchanged) ? (
            <p>
              Among the 227 scored names at the {closeLabel} close:{' '}
              {liveInternals ? (
                <>
                  {num(liveInternals.adv)} advancers / {num(liveInternals.dec)}{' '}
                  decliners live
                </>
              ) : (
                <>
                  {num(universe.advancers!)} advancers /{' '}
                  {num(universe.decliners!)} decliners /{' '}
                  {num(universe.unchanged!)} unchanged
                </>
              )}
              .
            </p>
          ) : null}
          <p className="footnote">
            Rule: A/D above 1 = more advancers than decliners; below 1 =
            more decliners. The market-wide count covers every US-listed
            stock the scanner returns, including OTC names — it is not
            our 227. Names with no reported day change are counted in
            the total but in neither group.
          </p>
          <p className="footnote">
            Source: TradingView scanner (no key). Baked 227-name counts
            from the nightly refresh, as of {formatDate(universe?.as_of) ?? '—'}.
          </p>
        </Card>

        <Card title={`Volatility (VIX) — ${vixRegime ?? 'Unavailable'}`} accent={vixRegime === 'Calm' || vixRegime === 'Normal' ? 'green' : vixRegime === 'Elevated' ? undefined : 'red'}>
          {vixValue !== null ? (
            <>
              <p>
                <strong>
                  VIX {vixValue.toFixed(2)} — {vixRegime}.
                </strong>{' '}
                {expectedMovePct !== null && expectedMovePts !== null && spxPrice !== null ? (
                  <>
                    Expected daily S&amp;P 500 move ±
                    {(expectedMovePct * 100).toFixed(2)}% (about ±
                    {expectedMovePts.toFixed(0)} points at {spxPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).
                  </>
                ) : null}
              </p>
              <p className="footnote">
                Rule: expected daily move = VIX / √252. Bands: Calm below
                15 · Normal 15–20 · Elevated 20–30 · High 30–40 ·
                Extreme above 40.
              </p>
              <p className="footnote">
                Source: VIX {isLive ? 'live (TradingView, ~15 min delayed)' : `at the ${closeLabel} close (FRED VIXCLS)`};
                S&amp;P 500 {isLive ? 'live' : `at the ${closeLabel} close`}.
              </p>
            </>
          ) : (
            <p>
              <strong>Data unavailable.</strong> No VIX value in this
              build, so no volatility reading is published here.
            </p>
          )}
        </Card>

        <Card title={`Credit — ${credit ?? 'Unavailable'}`} accent={credit === 'Calm' ? 'green' : credit === 'Stressed' ? 'red' : undefined}>
          {hyBaked !== null ? (
            <>
              <p>
                <strong>
                  High-yield spread {hyBaked.toFixed(2)}% — {credit}.
                </strong>{' '}
                {isFiniteNumber(macro.credit?.hy_spread_change_bp)
                  ? `${macro.credit!.hy_spread_change_bp! > 0 ? '+' : ''}${macro.credit!.hy_spread_change_bp} bp vs 1 month ago (${macro.credit!.hy_spread_1m_ago?.value?.toFixed(2) ?? '—'}% on ${formatDate(macro.credit!.hy_spread_1m_ago?.as_of) ?? '—'}). `
                  : ''}
                {igBaked !== null ? (
                  <>
                    Investment-grade spread {igBaked.toFixed(2)}%
                    {isFiniteNumber(macro.credit?.ig_spread_change_bp)
                      ? ` (${macro.credit!.ig_spread_change_bp! > 0 ? '+' : ''}${macro.credit!.ig_spread_change_bp} bp vs 1 month ago)`
                      : ''}
                    .
                  </>
                ) : null}
              </p>
              <p className="footnote">
                Rule (high-yield OAS): Calm below 4% · Normal 4–6% ·
                Elevated 6–8% · Stressed above 8%. A widening spread
                means corporate borrowing stress is rising.
              </p>
              <p className="footnote">
                Source: FRED BAMLH0A0HYM2 (high-yield) and BAMLC0A0CM
                (investment-grade), as of {formatDate(hy?.as_of) ?? '—'}.
                Nightly only — no intraday credit feed exists, so this
                panel never pretends to be live.
              </p>
            </>
          ) : (
            <p>
              <strong>Data unavailable.</strong> No credit-spread value in
              this build, so no credit reading is published.
            </p>
          )}
        </Card>

        <Card title="Internals">
          {above50 !== null && universeTotal !== null ? (
            <>
              <p>
                <strong>
                  {above50Pct !== null ? `${above50Pct.toFixed(0)}%` : '—'} of
                  the 227 above their 50-day average
                  ({num(above50)} of {num(universeTotal)}) —{' '}
                  {above50Pct !== null ? internalsGuide(above50Pct) : '—'}.
                </strong>{' '}
                {newHighs !== null ? (
                  <>
                    New 52-week closing highs:{' '}
                    {num(newHighs)}.
                  </>
                ) : null}
              </p>
              {liveInternals ? (
                <p>
                  Up volume {num(liveInternals.upVol)} shares vs down
                  volume {num(liveInternals.downVol)} shares, live among
                  the 227.
                </p>
              ) : (
                <p className="footnote">
                  Up/down volume is a live-only reading — it appears here
                  during market hours.
                </p>
              )}
              <p className="footnote">
                Rule: above 70% of names above their 50-day average =
                broad strength; below 30% = broad weakness; between is
                mixed. A new 52-week closing high means the live (or
                closing) price is at or above the highest daily close of
                the past year.
              </p>
              <p className="footnote">
                Source: nightly 50-day EMAs and 52-week highs from the
                refresh, as of {formatDate(universe?.as_of) ?? '—'}; prices{' '}
                {liveInternals ? 'live (TradingView)' : `at the ${closeLabel} close`}.
                Put/call positioning has no free data source, so it is
                not published here rather than estimated.
              </p>
            </>
          ) : (
            <p>
              <strong>Data unavailable.</strong> No internals inputs in
              this build, so no internals reading is published.
            </p>
          )}
        </Card>

        <Card title={`Macro Regime — ${macroRegime ?? 'Unavailable'}`} accent={macroRegime === 'Expansion' || macroRegime === 'Growth' ? 'green' : macroRegime === 'Contraction' || macroRegime === 'Slowing' ? 'red' : undefined}>
          {favCount !== null && favTotal !== null && macro.macro?.components ? (
            <>
              <p>
                <strong>
                  {macroRegime} — {favCount} of {favTotal} components
                  improving.
                </strong>
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th className="num">Latest</th>
                    <th>As of</th>
                    <th className="num">Change</th>
                    <th>Read</th>
                  </tr>
                </thead>
                <tbody>
                  {MACRO_ORDER.map((key) => {
                    const c = macro.macro!.components![key]
                    if (!c) return null
                    const changeTxt =
                      c.change === undefined || c.change === null
                        ? '—'
                        : c.change_unit === 'pp'
                          ? `${c.change > 0 ? '+' : ''}${c.change.toFixed(2)} pp`
                          : `${c.change > 0 ? '+' : ''}${(c.change * 100).toFixed(2)}%`
                    return (
                      <tr key={key}>
                        <td>{c.label ?? key}</td>
                        <td className="num">
                          {isFiniteNumber(c.value)
                            ? num(c.value!)
                            : '—'}
                        </td>
                        <td>{formatDate(c.as_of) ?? '—'}</td>
                        <td className="num">{changeTxt}</td>
                        <td>{c.favorable ? 'Improving' : 'Worsening'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="footnote">
                Rule: each component scores favorable when it moved the
                right way vs its previous release — GDP up, industrial
                production up, unemployment down, retail sales up. 4/4
                Expansion · 3/4 Growth · 2/4 Mixed · 1/4 Slowing · 0/4
                Contraction.
              </p>
              <p className="footnote">
                Source: FRED (GDP, INDPRO, UNRATE, RSAFS). GDP is
                quarterly and the rest monthly, so the as-of dates lag
                the market close — each is shown honestly above. There
                is no FRED series called MEI; this composite is built
                from the four real series instead.
              </p>
            </>
          ) : (
            <p>
              <strong>Data unavailable.</strong> The FRED macro feed did
              not return a composite in this build, so no regime is
              asserted.
            </p>
          )}
        </Card>
      </div>

      <Card title="Cadence &amp; sources">
        <p>
          Market panels (Trend, Breadth, Volatility, Internals) refresh
          live during market hours, 09:30–16:00 ET, on 60-second polls;
          after hours they show the last close, labelled as the close.
          Index quotes are delayed ~15 minutes (TradingView). Credit and
          Macro Regime refresh nightly (~05:20 UTC) from FRED — there is
          no intraday feed for either, so those two panels are always
          dated, never live.
        </p>
        <p>
          What is deliberately not here: put/call positioning (no free
          data source — not estimated), and new 52-week lows (the nightly
          technicals carry the 52-week high only). A number that is not
          measured is not shown.
        </p>
        <p>
          For the rotation model, which is published — formulas and a
          live calculator — see{' '}
          <a href="/sectors">Sector Rotation</a>. For how the stock
          scores are built, see <a href="/methodology">Methodology</a>.
        </p>
      </Card>
    </>
  )
}
