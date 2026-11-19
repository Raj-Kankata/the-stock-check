// Market Pulse panels — eight readings, each with its rule printed on
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
//     of the close. Baked fallback: the 382-name counts in macro.json.
//   * Volatility — VIX live via fetchSymbolQuote (CBOE:VIX), baked
//     FRED VIXCLS otherwise; expected daily SPX move = VIX / sqrt(252).
//   * Credit — nightly only (FRED BAML spreads); no intraday feed
//     exists, so this panel never pretends to be live.
//   * Internals — % of the 382 above their 50-day EMA + new 52-week
//     closing highs, baked from macro.json and recomputed live from
//     the shared useLiveQuotes() store.
//   * Put/Call — CBOE total / equity / index ratios from the nightly
//     refresh (lib/data/put_call.json, seeded from CBOE's daily
//     statistics page). Daily only, published the following morning,
//     so this panel is always one session behind by construction and
//     never pretends to be live. Bands and averages are printed on
//     the panel; the method is recorded in PULSE_PUT_CALL.md.
//   * Fear & Greed — CNN's index from the nightly refresh
//     (lib/data/fear_greed.json) plus a live fetch during market
//     hours on 10-minute polls (fetchFearGreed — the endpoint is
//     CORS-open, ~178 KB, so the slow cadence). The nightly value is
//     the close; the live value is labelled with CNN's update time.
//     The method is recorded in PULSE_FEAR_GREED.md.
//   * Macro Regime — the 4-component FRED composite in macro.json
//     (GDP / industrial production / unemployment / retail sales; each
//     favorable when it moved the right way vs its previous release).
//
// Cadence (printed on the page, and the old "every 6 hours" claim is
// gone): market panels refresh live during market hours (09:30–16:00
// ET, 60s polls); credit and macro refresh nightly (~05:20 UTC) from
// FRED, and put/call refreshes nightly from CBOE (daily, one session
// behind by construction). Fear & Greed refreshes nightly from CNN
// (close value) and live during market hours on 10-minute polls. The
// brief at the top is recomputed from the same panel data, never
// hand-written — baked values prerender it, live values update it.
//
// Hydration: the prerendered HTML shows baked closes only; the first
// client render is identical, and live values fill in after mount —
// the same pattern as components/MarketStrip.tsx and TrendingBoards.

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui'
import macroJson from '@/lib/data/macro.json'
import marketJson from '@/lib/data/market.json'
import putCallJson from '@/lib/data/put_call.json'
import fearGreedJson from '@/lib/data/fear_greed.json'
import FearGreedDial, { fgBandFor } from '@/components/FearGreedDial'
import {
  fetchFearGreed,
  fetchMarketBreadth,
  fetchSymbolQuote,
  formatCtTime,
  hasLiveQuotes,
  isMarketHours,
  useLiveQuotes,
  type FearGreedLive,
  type MarketBreadth,
  type TvSymbolQuote,
} from '@/lib/tradingview'

const POLL_MS = 60_000
// CNN Fear & Greed live polls: the endpoint updates through the
// session and the payload is ~178 KB, so the panel polls every 10
// minutes during market hours only — never after hours, when the
// baked close value is the reading.
const FG_POLL_MS = 600_000

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

interface PutCallBand {
  max?: number | null
  label?: string
  note?: string
}

interface PutCallSession {
  date?: string
  total?: number
  equity?: number
  index?: number
}

interface PutCallData {
  session_date?: string
  source?: string
  source_url?: string
  total?: number
  equity?: number
  index?: number
  total_prev?: number
  equity_prev?: number
  index_prev?: number
  total_change?: number
  equity_change?: number
  index_change?: number
  total_5d_avg?: number
  total_10d_avg?: number
  equity_5d_avg?: number
  equity_10d_avg?: number
  index_5d_avg?: number
  index_10d_avg?: number
  total_read?: string
  bands?: PutCallBand[]
  history?: PutCallSession[]
}

interface FearGreedBand {
  max?: number | null
  label?: string
  note?: string
}

interface FearGreedComponent {
  key?: string
  label?: string
  what?: string
  raw?: string
  score?: number
  rating?: string
}

interface FearGreedHistoryRow {
  date?: string
  score?: number
  rating?: string
}

interface FearGreedData {
  value_date?: string
  updated_at?: string
  source?: string
  source_url?: string
  score?: number
  rating?: string
  prev_close?: number
  prev_1_week?: number
  prev_1_month?: number
  prev_1_year?: number
  components?: FearGreedComponent[]
  bands?: FearGreedBand[]
  history?: FearGreedHistoryRow[]
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

// What the current total put/call read implies for direction —
// conditional copy, not a prediction. The ratio is a contrarian
// sentiment gauge: fear extremes have historically marked bottoms,
// complacency has historically preceded pullbacks, and the middle
// says nothing. Every branch states what would invalidate it.
function pcDirection(read: string): string {
  if (read === 'Complacent') {
    return 'Direction: contrarian caution. The crowd is all-in on calls — low ratios have historically preceded pullbacks, not rallies. The read flips if the total rises back into the neutral zone (0.80–1.00), or if price breaks down while the ratio stays low (complacency confirmed, not cured).'
  }
  if (read === 'Elevated') {
    return 'Direction: caution, not a sell signal. Options traders are defensive, but fear is well short of the extreme that has historically marked bottoms — this argues against chasing highs, not for shorting. The read flips if the total falls back under 1.00 (fear fading) or spikes above 1.16 (capitulation zone).'
  }
  if (read === 'Extreme') {
    return 'Direction: contrarian bullish — with a condition. Readings above 1.16 have historically marked zones where the S&P 500 finds near-term bottoms, not tops. That is not a buy signal on its own: it is confirmed only when price stabilises and the ratio starts falling. It is invalidated if the ratio stays extreme while price keeps falling — fear can stay extreme through a real decline.'
  }
  return 'Direction: nothing to say. Inside the neutral zone the ratio carries no directional implication — it becomes interesting only at the edges: below 0.80 (complacency) or above 1.16 (fear extreme).'
}

// What the current Fear & Greed read implies for trader psychology —
// conditional copy, not a prediction. The index is a contrarian
// sentiment composite: fear extremes have historically marked bottoms,
// greed extremes have historically preceded pullbacks, and the middle
// says nothing. Every branch states what would invalidate it.
function fgDirection(read: string): string {
  if (read === 'Extreme Fear') {
    return 'Direction: contrarian bullish — with a condition. Readings under 25 have historically marked zones where stocks find near-term bottoms, not tops. That is not a buy signal on its own: it is confirmed only when price stabilises and the index starts rising. It is invalidated if the index stays in extreme fear while price keeps falling — fear can stay extreme through a real decline.'
  }
  if (read === 'Fear') {
    return 'Direction: caution, not a sell signal. Traders are defensive, but fear is short of the extreme that has historically marked bottoms — this argues against chasing highs, not for shorting. The read flips if the index rises into Neutral (fear fading) or falls under 25 (capitulation zone).'
  }
  if (read === 'Greed') {
    return 'Direction: contrarian caution. The crowd is leaning into risk — greed has historically preceded pullbacks, not rallies. The read flips if the index falls back into Neutral (greed fading) or rises above 75 (euphoria zone).'
  }
  if (read === 'Extreme Greed') {
    return 'Direction: contrarian bearish — with a condition. Readings above 75 have historically preceded pullbacks, not rallies. That is not a sell signal on its own: it is confirmed only when price weakens and the index starts falling. It is invalidated if the index stays in extreme greed while price keeps rising — greed can stay extreme through a real rally.'
  }
  return 'Direction: nothing to say. In the neutral zone the index carries no directional implication — it becomes interesting only at the edges: under 25 (fear extreme) or above 75 (greed extreme).'
}

const MACRO_ORDER = ['gdp', 'indpro', 'unrate', 'rsafs'] as const

export default function PulsePanels() {
  const macro = macroJson as unknown as MacroData
  const market = marketJson as unknown as MarketData
  const pc = putCallJson as unknown as PutCallData

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

  // ---- put/call (baked from the nightly refresh; daily, one session
  // behind by construction — never live) ----
  const pcTotal = isFiniteNumber(pc.total) ? pc.total! : null
  const pcEquity = isFiniteNumber(pc.equity) ? pc.equity! : null
  const pcIndex = isFiniteNumber(pc.index) ? pc.index! : null
  const pcRead =
    typeof pc.total_read === 'string' && pcTotal !== null
      ? pc.total_read!
      : null
  const pcSession = formatDate(pc.session_date)
  const pcBands = Array.isArray(pc.bands) ? pc.bands : []
  const pcHistory = Array.isArray(pc.history) ? pc.history : []
  const pcRecent = pcHistory
    .filter(
      (h) =>
        typeof h.date === 'string' &&
        isFiniteNumber(h.total) &&
        isFiniteNumber(h.equity) &&
        isFiniteNumber(h.index),
    )
    .slice(-5)
    .reverse()
  const pcAccent =
    pcRead === 'Neutral'
      ? 'green'
      : pcRead === 'Complacent' || pcRead === 'Extreme'
        ? 'red'
        : undefined

  // ---- fear & greed (baked close from the nightly refresh; live
  // during market hours on 10-minute polls — never presented as live
  // after hours) ----
  const fg = fearGreedJson as unknown as FearGreedData
  const fgBakedScore = isFiniteNumber(fg.score) ? fg.score! : null
  const fgBakedRating =
    typeof fg.rating === 'string' && fgBakedScore !== null ? fg.rating! : null
  const fgValueDate = formatDate(fg.value_date)
  const fgBands = Array.isArray(fg.bands) ? fg.bands : []
  const fgComponents = Array.isArray(fg.components)
    ? fg.components.filter(
        (c) =>
          typeof c.label === 'string' &&
          typeof c.what === 'string' &&
          typeof c.raw === 'string' &&
          isFiniteNumber(c.score) &&
          typeof c.rating === 'string',
      )
    : []
  const fgHistory = Array.isArray(fg.history)
    ? fg.history.filter(
        (h) =>
          typeof h.date === 'string' &&
          isFiniteNumber(h.score) &&
          typeof h.rating === 'string',
      )
    : []
  const fgRecent = fgHistory.slice(-10).reverse()

  // Reference readings beside the dial (CNN's own displayed values —
  // the endpoint's named fields; see PULSE_FEAR_GREED.md for the
  // previous-close note). They are fixed for the day, so they always
  // come from the baked close, never from the live poll.
  const fgRefs = [
    { label: 'Previous close', value: fg.prev_close },
    { label: '1 week ago', value: fg.prev_1_week },
    { label: '1 month ago', value: fg.prev_1_month },
    { label: '1 year ago', value: fg.prev_1_year },
  ].filter((r) => isFiniteNumber(r.value))

  // ---- live state (fills in after mount; never in the prerender) ----
  const liveStore = useLiveQuotes()
  const [quotes, setQuotes] = useState<LiveQuotes | null>(null)
  const [quotesStatus, setQuotesStatus] = useState<Status>('loading')
  const [quotesUpdatedAt, setQuotesUpdatedAt] = useState<string | null>(null)
  const [breadth, setBreadth] = useState<MarketBreadth | null>(null)
  const [breadthStatus, setBreadthStatus] = useState<Status>('loading')
  const [breadthUpdatedAt, setBreadthUpdatedAt] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  // Fear & Greed live state — separate from the quote/breadth polls:
  // the CNN payload is ~178 KB, so it polls every 10 minutes, not
  // every 60 seconds, and only during market hours.
  const [fgLive, setFgLive] = useState<FearGreedLive | null>(null)
  const [fgLiveAt, setFgLiveAt] = useState<string | null>(null)
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

  // Fear & Greed live polls (10-minute cadence, market hours only).
  // A failed fetch leaves the baked close value on screen — the panel
  // never goes blank and never labels a stale value live.
  useEffect(() => {
    let stopped = false
    const refreshFg = async () => {
      if (document.hidden || !isMarketHours(new Date())) return
      const next = await fetchFearGreed()
      if (stopped || !next) return
      setFgLive(next)
      setFgLiveAt(formatCtTime(new Date(next.updatedAt)))
    }
    refreshFg()
    const pollId = setInterval(refreshFg, FG_POLL_MS)
    return () => {
      stopped = true
      clearInterval(pollId)
    }
  }, [])

  // ---- live 382-name internals from the shared store ----
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

  // Fear & Greed: live during market hours, baked close otherwise.
  // The accent follows the displayed rating — both extremes are the
  // warning zones, the middle is unaccented.
  const fgScore = fgLive !== null ? fgLive.score : fgBakedScore
  const fgRating = fgLive !== null ? fgLive.rating : fgBakedRating
  const fgIsLive = fgLive !== null
  const fgAccent =
    fgRating === 'Extreme Fear' || fgRating === 'Extreme Greed'
      ? 'red'
      : undefined

  // Live 382 internals when the store has them, else the baked counts.
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
  // Display forms of the universe size, derived from the baked counts —
  // never a literal. When the total is not known, the copy falls back to
  // "the scored names" with no number rather than a stale one.
  const universeAdj =
    universeTotal !== null ? `${num(universeTotal)}-name` : 'scored-name'
  const universeNoun =
    universeTotal !== null ? `the ${num(universeTotal)}` : 'the scored names'
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
      `breadth negative among ${universeNoun} (${num(universe.advancers!)} advancers vs ${num(universe.decliners!)} decliners at the ${closeLabel} close)`,
    )
  }
  if (vixRegime && vixValue !== null) {
    briefParts.push(`VIX ${vixRegime.toLowerCase()} at ${vixValue.toFixed(2)}`)
  }
  if (pcRead && pcTotal !== null) {
    briefParts.push(
      `put/call ${pcRead.toLowerCase()} at ${pcTotal.toFixed(2)}`,
    )
  }
  if (fgRating && fgScore !== null) {
    briefParts.push(
      `fear & greed ${fgRating.toLowerCase()} at ${Math.round(fgScore)}`,
    )
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
            ? `Market-wide scan could not be reached — showing the ${universeAdj} counts below.`
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
          60-second polls) and show the last close after hours. Credit,
          macro and put/call refresh nightly (~05:20 UTC) from FRED and
          CBOE. Fear &amp; Greed refreshes nightly from CNN (close value)
          and live during market hours on 10-minute polls.
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
                  : `The live scan could not be reached, so no market-wide count is shown — the ${universeAdj} counts below are the reading instead.`}
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
              Among {universeTotal !== null ? `the ${num(universeTotal)} ` : ''}scored names at the {closeLabel} close:{' '}
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
            stock the scanner returns, including OTC names — it is not{' '}
            {universeTotal !== null ? `our ${num(universeTotal)}` : 'ours'}. Names with no reported day change are counted in
            the total but in neither group.
          </p>
          <p className="footnote">
            Source: TradingView scanner (no key). Baked {universeAdj} counts
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
                  the {num(universeTotal)} above their 50-day average
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
                  the {num(universeTotal)}.
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
                Put/call positioning is in its own panel below, sourced
                from CBOE.
              </p>
            </>
          ) : (
            <p>
              <strong>Data unavailable.</strong> No internals inputs in
              this build, so no internals reading is published.
            </p>
          )}
        </Card>

        <Card title={`Put/Call Ratio — ${pcRead ?? 'Unavailable'}`} accent={pcAccent}>
          {pcTotal !== null && pcRead !== null ? (
            <>
              <p>
                <strong>
                  Total put/call {pcTotal.toFixed(2)} — {pcRead}.
                </strong>{' '}
                For every 100 calls traded, {Math.round(pcTotal * 100)}{' '}
                puts traded
                {isFiniteNumber(pc.total_change) ? (
                  <>
                    {' '}({pc.total_change! > 0 ? '+' : ''}
                    {pc.total_change!.toFixed(2)} vs the previous session)
                  </>
                ) : null}
                .{' '}
                {isFiniteNumber(pc.total_5d_avg) &&
                isFiniteNumber(pc.total_10d_avg) ? (
                  <>
                    5-day average {pc.total_5d_avg!.toFixed(2)} · 10-day
                    average {pc.total_10d_avg!.toFixed(2)} — the averages
                    are the readable line; the single-day print is noisy.
                  </>
                ) : null}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Series</th>
                    <th className="num">Today</th>
                    <th className="num">5-day avg</th>
                    <th className="num">10-day avg</th>
                    <th>Normal range</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Total (all products)</td>
                    <td className="num">{pcTotal.toFixed(2)}</td>
                    <td className="num">
                      {isFiniteNumber(pc.total_5d_avg)
                        ? pc.total_5d_avg!.toFixed(2)
                        : '—'}
                    </td>
                    <td className="num">
                      {isFiniteNumber(pc.total_10d_avg)
                        ? pc.total_10d_avg!.toFixed(2)
                        : '—'}
                    </td>
                    <td>0.80–1.00 neutral zone (avg 0.95)</td>
                  </tr>
                  <tr>
                    <td>Equity (single stocks)</td>
                    <td className="num">
                      {pcEquity !== null ? pcEquity.toFixed(2) : '—'}
                    </td>
                    <td className="num">
                      {isFiniteNumber(pc.equity_5d_avg)
                        ? pc.equity_5d_avg!.toFixed(2)
                        : '—'}
                    </td>
                    <td className="num">
                      {isFiniteNumber(pc.equity_10d_avg)
                        ? pc.equity_10d_avg!.toFixed(2)
                        : '—'}
                    </td>
                    <td>0.50–0.90 (avg 0.65)</td>
                  </tr>
                  <tr>
                    <td>Index (SPX, NDX…)</td>
                    <td className="num">
                      {pcIndex !== null ? pcIndex.toFixed(2) : '—'}
                    </td>
                    <td className="num">
                      {isFiniteNumber(pc.index_5d_avg)
                        ? pc.index_5d_avg!.toFixed(2)
                        : '—'}
                    </td>
                    <td className="num">
                      {isFiniteNumber(pc.index_10d_avg)
                        ? pc.index_10d_avg!.toFixed(2)
                        : '—'}
                    </td>
                    <td>0.86–1.58 (avg 1.20)</td>
                  </tr>
                </tbody>
              </table>
              <p>
                <strong>Ranges — total ratio.</strong>
              </p>
              <ul>
                {pcBands.map((b) => (
                  <li key={b.label ?? 'band'}>
                    <strong>{b.label}.</strong> {b.note}
                  </li>
                ))}
              </ul>
              <p>
                <strong>Scope.</strong> CBOE exchange volume only — not
                all US exchanges. Volume-based (puts traded ÷ calls
                traded), not open interest. Total covers every CBOE
                product; equity is single-stock options, the
                retail-sentiment gauge; index is index options (SPX,
                NDX…), dominated by institutional hedging — which is why
                the index ratio normally sits above 1.0 while the equity
                ratio normally sits below it. Each series has its own
                normal level; compare a reading with its own history,
                not with 1.0.
              </p>
              <p>
                <strong>{pcDirection(pcRead)}</strong>
              </p>
              {pcRecent.length > 0 ? (
                <>
                  <p>
                    <strong>Recent sessions.</strong>
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Session</th>
                        <th className="num">Total</th>
                        <th className="num">Equity</th>
                        <th className="num">Index</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pcRecent.map((h) => (
                        <tr key={h.date}>
                          <td>{formatDate(h.date) ?? h.date}</td>
                          <td className="num">{h.total!.toFixed(2)}</td>
                          <td className="num">{h.equity!.toFixed(2)}</td>
                          <td className="num">{h.index!.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
              <p className="footnote">
                Rule: total ratio = put volume ÷ call volume across all
                CBOE products. Bands: Complacent below 0.80 · Neutral
                0.80–1.00 · Elevated 1.00–1.16 · Extreme above 1.16 —
                anchored to the CBOE total-ratio distribution, Nov
                2006–Oct 2019 (average 0.95, 10th percentile 0.77, 90th
                percentile 1.16, highest day 1.82). The ratio is a
                contrarian sentiment gauge, not a timing signal: fear
                extremes have historically marked bottoms, complacency
                has historically preceded pullbacks, and the middle says
                nothing.
              </p>
              <p className="footnote">
                Source: CBOE U.S. Options Daily Market Statistics,
                session {pcSession ?? '—'}. Nightly only (~05:20 UTC) —
                CBOE publishes each session the following morning, so
                this panel is always one session behind by construction,
                never live. The 5-day and 10-day averages come from the
                sessions the refresh has collected (last 20 kept).
              </p>
            </>
          ) : (
            <p>
              <strong>Data unavailable.</strong> No put/call data in this
              build, so no sentiment reading is published.
            </p>
          )}
        </Card>

        <Card title={`Fear & Greed — ${fgRating ?? 'Unavailable'}`} accent={fgAccent}>
          {fgScore !== null && fgRating !== null ? (
            <>
              <p>
                <strong>
                  {Math.round(fgScore)} — {fgRating}.
                </strong>{' '}
                {fgIsLive ? (
                  <>Live from CNN, updated {fgLiveAt ?? '—'} CT.</>
                ) : (
                  <>As of the {fgValueDate ?? '—'} close (CNN).</>
                )}
              </p>
              <div className="fg-dial-wrap">
                <FearGreedDial score={fgScore} variant="medium" />
                {fgRefs.length > 0 ? (
                  <div className="fg-refs" aria-label="Previous readings">
                    {fgRefs.map((r) => {
                      const band = fgBandFor(r.value!)
                      return (
                        <div className="fg-ref" key={r.label}>
                          <span className="fg-ref-text">
                            <span className="fg-ref-label">{r.label}</span>
                            <span className="fg-ref-band">{band.label}</span>
                          </span>
                          <span className="fg-ref-dots" aria-hidden="true" />
                          <span
                            className="fg-ref-dot"
                            style={{
                              background: band.color,
                              color:
                                band.label === 'Neutral' ? '#1a2332' : '#fff',
                            }}
                          >
                            {/* Truncated, not rounded — CNN displays the
                                reference values floored (24.61 → 24,
                                19.51 → 19, 7.86 → 7); rounding would
                                show 25 / 20 / 8 and contradict CNN. */}
                            {Math.floor(r.value!)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
              {fgComponents.length > 0 ? (
                <>
                  <p>
                    <strong>What is driving it — the seven components.</strong>
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Component</th>
                        <th>Reading</th>
                        <th className="num">Score</th>
                        <th>Band</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fgComponents.map((c) => (
                        <tr key={c.key}>
                          <td>
                            <strong>{c.label}</strong>
                            <br />
                            <span className="footnote">{c.what}</span>
                          </td>
                          <td>{c.raw}</td>
                          <td className="num">{c.score!.toFixed(0)}</td>
                          <td>{c.rating}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
              <p>
                <strong>Ranges.</strong>
              </p>
              <ul>
                {fgBands.map((b) => (
                  <li key={b.label ?? 'band'}>
                    <strong>{b.label}.</strong> {b.note}
                  </li>
                ))}
              </ul>
              <p>
                <strong>{fgDirection(fgRating)}</strong>
              </p>
              <p>
                <strong>Scope &amp; limits.</strong> The index is the
                equal-weighted average of the seven indicators above —
                a sentiment composite, not a timing signal and not a
                measure of value: it says how traders feel, not whether
                prices are right. One overlap to read honestly: the Put
                and Call Options component is CNN&apos;s own 5-day
                average put/call ratio — the same family as the
                Put/Call panel on this page, but not the same number.
                The Put/Call panel shows the CBOE total ratio for the
                latest session (currently {pcTotal !== null ? pcTotal.toFixed(2) : '—'}); the
                component above is CNN&apos;s 5-day equity average
                (currently{' '}
                {fgComponents.find((c) => c.key === 'put_call')?.raw ?? '—'}
                ). The two agree in direction far more often than in
                level — read each against its own history.
              </p>
              {fgRecent.length > 0 ? (
                <>
                  <p>
                    <strong>Recent days.</strong>
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Day</th>
                        <th className="num">Score</th>
                        <th>Band</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fgRecent.map((h) => (
                        <tr key={h.date}>
                          <td>{formatDate(h.date) ?? h.date}</td>
                          <td className="num">{h.score!.toFixed(0)}</td>
                          <td>{h.rating}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : null}
              <p className="footnote">
                Rule: the composite is CNN&apos;s Fear &amp; Greed Index
                (0–100), the equal-weighted average of the seven
                indicators. Bands: Extreme Fear 0–25 · Fear 25–45 ·
                Neutral 45–55 · Greed 55–75 · Extreme Greed 75–100 —
                CNN&apos;s published scale, verified against a year of
                CNN&apos;s own daily ratings (Extreme Fear never above
                24.77, Fear 25.26–44.86, Neutral 45.23–54.97, Greed
                56.20–71.17). The index is a contrarian sentiment gauge,
                not a timing signal: fear extremes have historically
                marked bottoms, greed extremes have historically
                preceded pullbacks, and the middle says nothing.
              </p>
              <p className="footnote">
                Source: CNN Fear &amp; Greed Index,{' '}
                {fgIsLive ? (
                  <>live, updated {fgLiveAt ?? '—'} CT (10-minute polls during market hours)</>
                ) : (
                  <>as of the {fgValueDate ?? '—'} close</>
                )}
                . Nightly refresh (~05:20 UTC) captures the close value;
                after hours the panel shows that close, labelled with
                its date. Component scores and ratings are CNN&apos;s
                published figures, not recomputed here.
              </p>
            </>
          ) : (
            <p>
              <strong>Data unavailable.</strong> No Fear &amp; Greed data
              in this build, so no sentiment reading is published.
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
          dated, never live. Put/Call refreshes nightly too, from CBOE —
          the ratio is a daily number published the following morning,
          so it is always one session behind, never live. Fear &amp;
          Greed refreshes nightly from CNN (close value) and live
          during market hours on 10-minute polls.
        </p>
        <p>
          What is deliberately not here: new 52-week lows (the nightly
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
