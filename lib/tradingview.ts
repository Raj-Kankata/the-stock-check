// Live quotes for the Trending boards, via TradingView's free scanner
// API — no key, no signup, no proxy (same source as the header strip's
// live chips in components/MarketStrip.tsx).
//
// VERIFIED 17 Nov 2026 from curl, and re-verified 19 Nov 2026 for the
// 382-name expansion (totalCount 382, all 382 distinct symbols, no null
// closes):
//   POST https://scanner.tradingview.com/america/scan
//   body: {"symbols":{"tickers":[<382 exchange-prefixed tickers>]},
//          "columns":["name","close","change","volume"],
//          "sort":{"sortBy":"change"|"volume","sortOrder":"asc"|"desc"},
//          "options":{"lang":"en"},"range":[0,10]}
//   response: {"totalCount":382,"data":[{"s":"NASDAQ:AAPL",
//          "d":["AAPL",354.12,0.38,7166875]},...]}
//   where d = [bare symbol, close, day change in %, share volume].
//   Three scans per poll: change desc (Gainers), change asc (Losers),
//   volume desc (Most Active).
//
// CORS RULE (critical): the POST must carry
// `Content-Type: text/plain`, NOT application/json. The scan endpoint's
// OPTIONS preflight only allows Referer and Accept, so a JSON
// content-type triggers a preflight the server rejects and the browser
// blocks the request. text/plain is a simple request (no preflight)
// and the server still parses the JSON body.
//
// TWO DEVIATIONS from the first draft of this request, both found by
// testing against the live endpoint — do not "fix" them back:
//   1. The request does NOT include "query":{"types":["stock"]}. With
//      that filter the scanner returns totalCount 0 for NYSE:INFY (the
//      Infosys ADR) — the filter excludes it. Without the filter all
//      382 tickers resolve. The explicit tickers list makes the filter
//      redundant anyway.
//   2. Rows are matched back to our tickers by d[0], the bare symbol —
//      NOT by the `s` field's exchange prefix. TradingView currently
//      echoes GM back as "NASDAQ:GM" (it is NYSE-listed; the file in
//      lib/data/exchanges.json correctly says NYSE:GM) and serves it
//      with a null day change. Matching on d[0] survives that; matching
//      on `s` would drop GM from the boards. Rows whose change is null
//      are excluded from the Gainers/Losers boards (they can still rank
//      on Most Active if volume is present).
//
// Exchange map: lib/data/exchanges.json, regenerated 19 Nov 2026 from
// the free NASDAQ Trader symdir files (nasdaqlisted.txt + otherlisted.txt,
// file creation 20261118 21:31) — 382/382 covered: NYSE 205, NASDAQ 176,
// CBOE 1. One hand-correction, verified against the live scanner:
// CBOE (Cboe Global Markets, Cboe BZX listing) is "CBOE:CBOE" —
// "BATS:CBOE" returns symbol_not_exists. BRK-B is "NYSE:BRK.B".
// If a ticker ever goes missing from both symdir files, STOP and report
// it — never guess an exchange, never silently drop a name.

import { useEffect, useState } from 'react'
import exchangesJson from './data/exchanges.json'
import etfExchangesJson from './data/etf_exchanges.json'

export const TV_TICKERS: string[] = Object.values(
  exchangesJson as Record<string, string>,
)

export interface TvQuote {
  /** Our ticker symbol (BRK.B from TradingView maps back to BRK-B). */
  symbol: string
  close: number
  /** Day change in percent (e.g. 0.38 = +0.38%), or null if TradingView
      did not return one for this name in this scan. */
  changePct: number | null
  volume: number | null
}

const SCAN_URL = 'https://scanner.tradingview.com/america/scan'

const ctTimeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const etPartsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function formatCtTime(d: Date): string {
  return ctTimeFmt.format(d)
}

// True only during the regular US session, 09:30–16:00 ET, Mon–Fri.
// Same clock logic as components/MarketStrip.tsx (holidays are not
// checked: on a holiday TradingView returns the last close, which the
// Trending page then labels as the close boards — never as live).
export function isMarketHours(now: Date): boolean {
  const parts = etPartsFmt.formatToParts(now)
  let weekday = ''
  let hour = -1
  let minute = -1
  for (const p of parts) {
    if (p.type === 'weekday') weekday = p.value
    if (p.type === 'hour') hour = Number(p.value)
    if (p.type === 'minute') minute = Number(p.value)
  }
  if (weekday === 'Sat' || weekday === 'Sun') return false
  if (hour < 0 || minute < 0) return false
  const minutes = hour * 60 + minute
  return minutes >= 9 * 60 + 30 && minutes < 16 * 60
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

/**
 * One TradingView scan for the top 10 by the given sort. Returns null on
 * any failure (network, non-200, unparseable body) — the caller decides
 * whether to keep showing the last good boards or an error card.
 * Rows with a missing close are dropped; a null change/volume is kept
 * as null so the caller can exclude the row from the board it cannot
 * rank on instead of crashing or inventing a number.
 */
export async function scanTradingView(
  sortBy: 'change' | 'volume',
  sortOrder: 'asc' | 'desc',
): Promise<TvQuote[] | null> {
  try {
    const res = await fetch(SCAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        symbols: { tickers: TV_TICKERS },
        columns: ['name', 'close', 'change', 'volume'],
        sort: { sortBy, sortOrder },
        options: { lang: 'en' },
        range: [0, 10],
      }),
    })
    if (!res.ok) return null
    const j = (await res.json()) as unknown
    if (!j || typeof j !== 'object') return null
    const data = (j as Record<string, unknown>).data
    if (!Array.isArray(data)) return null
    const quotes: TvQuote[] = []
    for (const row of data) {
      if (!row || typeof row !== 'object') continue
      const d = (row as Record<string, unknown>).d
      if (!Array.isArray(d) || d.length < 4) continue
      const [name, close, change, volume] = d
      if (typeof name !== 'string' || !isFiniteNumber(close)) continue
      quotes.push({
        symbol: name === 'BRK.B' ? 'BRK-B' : name,
        close,
        changePct: isFiniteNumber(change) ? change : null,
        volume: isFiniteNumber(volume) ? volume : null,
      })
    }
    return quotes
  } catch {
    return null
  }
}

/**
 * One scan for ALL 382 quotes — the single live-price fetch every live
 * surface on a page shares. Same endpoint, same Content-Type: text/plain
 * rule, same row-matching (d[0], never the `s` prefix) as scanTradingView
 * above. Verified 19 Nov 2026 from curl: range [0,382] returns
 * totalCount 382 and all 382 distinct symbols in one response.
 *
 * All-or-none: returns null unless every one of the 382 tickers came
 * back with a finite close. A partial map would leave some rows live
 * and others baked under one timestamp, so a short map is a failure
 * and the caller falls back to baked closes.
 */
export async function fetchAllQuotes(): Promise<Map<string, TvQuote> | null> {
  try {
    const res = await fetch(SCAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        symbols: { tickers: TV_TICKERS },
        columns: ['name', 'close', 'change', 'volume'],
        sort: { sortBy: 'change', sortOrder: 'desc' },
        options: { lang: 'en' },
        range: [0, TV_TICKERS.length],
      }),
    })
    if (!res.ok) return null
    const j = (await res.json()) as unknown
    if (!j || typeof j !== 'object') return null
    const data = (j as Record<string, unknown>).data
    if (!Array.isArray(data)) return null
    const quotes = new Map<string, TvQuote>()
    for (const row of data) {
      if (!row || typeof row !== 'object') continue
      const d = (row as Record<string, unknown>).d
      if (!Array.isArray(d) || d.length < 4) continue
      const [name, close, change, volume] = d
      if (typeof name !== 'string' || !isFiniteNumber(close)) continue
      const symbol = name === 'BRK.B' ? 'BRK-B' : name
      quotes.set(symbol, {
        symbol,
        close,
        changePct: isFiniteNumber(change) ? change : null,
        volume: isFiniteNumber(volume) ? volume : null,
      })
    }
    if (quotes.size !== TV_TICKERS.length) return null
    return quotes
  } catch {
    return null
  }
}

/**
 * One quote for a single TradingView symbol (e.g. 'SP:SPX') via the
 * /symbol endpoint — the same no-key pattern as the header strip in
 * components/MarketStrip.tsx. Plain GET, no custom headers, so the
 * browser sends a simple request (no preflight). `change` is already
 * a percent, `change_abs` is points. Null on any failure — the
 * caller falls back to the baked close.
 */
export interface TvSymbolQuote {
  close: number
  changePct: number
  changeAbs: number
}

export async function fetchSymbolQuote(tvSymbol: string): Promise<TvSymbolQuote | null> {
  try {
    const res = await fetch(
      `https://scanner.tradingview.com/symbol?symbol=${encodeURIComponent(
        tvSymbol,
      )}&fields=close,change,change_abs`,
    )
    if (!res.ok) return null
    const j = (await res.json()) as unknown
    if (!j || typeof j !== 'object') return null
    const { close, change, change_abs } = j as Record<string, unknown>
    if (!isFiniteNumber(close) || !isFiniteNumber(change) || !isFiniteNumber(change_abs)) {
      return null
    }
    return { close, changePct: change, changeAbs: change_abs }
  } catch {
    return null
  }
}

/**
 * CNN Fear & Greed Index, live — the same endpoint the nightly
 * refresh reads (scripts/fear_greed_refresh.py), fetched from the
 * browser. The endpoint sends Access-Control-Allow-Origin: * (verified
 * 19 Nov 2026 from curl with the site's Origin), so no proxy is
 * needed. The CDN returns HTTP 418 to non-browser User-Agents, but a
 * real browser sends its own UA and Referer, so the fetch works from
 * the page. The payload is ~178 KB (a full year of history rides
 * along), so callers poll at most every 10 minutes and only during
 * market hours. Null on any failure — the caller falls back to the
 * baked close value in lib/data/fear_greed.json. The timestamp is
 * CNN's last-update time, returned as-is so the caller can label the
 * value honestly.
 */
export interface FearGreedLive {
  score: number
  rating: string
  updatedAt: string
}

const FG_RATINGS = [
  'Extreme Fear',
  'Fear',
  'Neutral',
  'Greed',
  'Extreme Greed',
]

export async function fetchFearGreed(): Promise<FearGreedLive | null> {
  try {
    const res = await fetch(
      'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
    )
    if (!res.ok) return null
    const j = (await res.json()) as unknown
    if (!j || typeof j !== 'object') return null
    const fg = (j as Record<string, unknown>)['fear_and_greed']
    if (!fg || typeof fg !== 'object') return null
    const { score, rating, timestamp } = fg as Record<string, unknown>
    if (!isFiniteNumber(score) || score < 0 || score > 100) return null
    if (typeof rating !== 'string') return null
    const normRating = rating
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')
    if (!FG_RATINGS.includes(normRating)) return null
    if (typeof timestamp !== 'string' || !timestamp) return null
    return { score, rating: normRating, updatedAt: timestamp }
  } catch {
    return null
  }
}

/**
 * Market-wide advance/decline counts from the same TradingView scanner
 * — one filtered scan per sign of the day change, plus one unfiltered
 * scan for the total. Only totalCount is read (range [0,1] keeps each
 * payload to one row). The filter is on the `change` column (day change
 * in %), same column the boards rank on.
 *
 * VERIFIED 17 Nov 2026 from curl, mid-session on a down day
 * (S&P 500 -1.9%): advancers 3,493 / decliners 6,924 / unchanged 1,380
 * / total 11,836. The three sign counts need not sum to the total: a
 * few dozen names report no day change at all and are counted in the
 * total but in neither group. The universe is every US-listed stock the
 * scanner covers, including OTC names — it is NOT our 382.
 *
 * Same CORS rule as the other scans: Content-Type: text/plain, never
 * application/json. Null on any failure — the caller falls back to the
 * baked 382-name counts in macro.json. After hours the scanner returns
 * the frozen close values, which the caller labels as of the close,
 * never as live.
 */
export interface MarketBreadth {
  advancers: number
  decliners: number
  unchanged: number
  total: number
}

async function scanBreadthCount(
  filter: { left: string; operation: string; right: number } | null,
): Promise<number | null> {
  try {
    const body: Record<string, unknown> = {
      symbols: { query: { types: ['stock'] }, ticker: '' },
      columns: ['name', 'close', 'change'],
      range: [0, 1],
    }
    if (filter) body.filter = [filter]
    const res = await fetch(SCAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return null
    const j = (await res.json()) as unknown
    if (!j || typeof j !== 'object') return null
    const totalCount = (j as Record<string, unknown>).totalCount
    return isFiniteNumber(totalCount) ? totalCount : null
  } catch {
    return null
  }
}

export async function fetchMarketBreadth(): Promise<MarketBreadth | null> {
  const [advancers, decliners, unchanged, total] = await Promise.all([
    scanBreadthCount({ left: 'change', operation: 'greater', right: 0 }),
    scanBreadthCount({ left: 'change', operation: 'less', right: 0 }),
    scanBreadthCount({ left: 'change', operation: 'equal', right: 0 }),
    scanBreadthCount(null),
  ])
  if (
    advancers === null ||
    decliners === null ||
    unchanged === null ||
    total === null
  ) {
    return null
  }
  return { advancers, decliners, unchanged, total }
}

// ---------------------------------------------------------------------------
// Shared live-price store — one fetch per page, one 60s timer per page,
// every live surface subscribes to the same state.
//
// Any number of components on a page may call useLiveQuotes(); the fetch
// and the poll timer exist exactly once per page (module state), so the
// stock card's five live spots, the homepage's tables and tiles, and the
// 382-row /stocks table all share one scan per poll. The header strip
// and the Trending boards keep their own existing fetches (different
// symbols / different sorts) and are untouched by this store.
//
// States, honestly labelled — a stale or missing number is never shown
// as live:
//   loading — first fetch still in flight; callers show baked closes.
//   live    — market hours and the last fetch succeeded; LIVE badge +
//             "Updated HH:MM:SS CT" + the ~15-min delay note.
//   closed  — outside market hours; no fetch, no polling, baked closes
//             with their as-of label. A page left open past the close
//             flips live -> closed and drops back to baked closes.
//   stale   — a poll failed but a full good map is already on screen;
//             the last-good live values stay up (all rows from the same
//             timestamp — never a half-live page) with a "Couldn't
//             refresh" notice. The next successful poll clears it.
//   error   — market hours, nothing ever loaded; baked closes with an
//             honest "could not be loaded" notice.
// Polling is every 60s and only while the market is open; a tick outside
// market hours only flips the label and does not fetch. Paused while
// the tab is hidden (document.hidden), like the strip and the boards.
// ---------------------------------------------------------------------------

export type LiveStatus = 'loading' | 'live' | 'closed' | 'stale' | 'error'

export interface LiveQuotesState {
  quotes: Map<string, TvQuote> | null
  status: LiveStatus
  updatedAt: string | null
}

const LIVE_POLL_MS = 60_000

let liveState: LiveQuotesState = { quotes: null, status: 'loading', updatedAt: null }
const liveListeners = new Set<() => void>()
let liveTimer: ReturnType<typeof setInterval> | null = null
let liveInflight: Promise<Map<string, TvQuote> | null> | null = null

function emitLive() {
  for (const l of liveListeners) l()
}

async function refreshLive() {
  if (typeof document !== 'undefined' && document.hidden) return
  const now = new Date()
  if (!isMarketHours(now)) {
    if (liveState.status !== 'closed') {
      liveState = { quotes: null, status: 'closed', updatedAt: liveState.updatedAt }
      emitLive()
    }
    return
  }
  if (!liveInflight) {
    liveInflight = fetchAllQuotes()
    void liveInflight.then(() => {
      liveInflight = null
    })
  }
  const quotes = await liveInflight
  if (quotes) {
    liveState = { quotes, status: 'live', updatedAt: formatCtTime(new Date()) }
  } else if (liveState.quotes) {
    liveState = { ...liveState, status: 'stale' }
  } else {
    liveState = { quotes: null, status: 'error', updatedAt: null }
  }
  emitLive()
}

function ensureLivePolling() {
  if (liveTimer !== null) return
  void refreshLive()
  liveTimer = setInterval(() => {
    void refreshLive()
  }, LIVE_POLL_MS)
}

/**
 * Subscribe to the shared live-price store. The first client render
 * returns the initial state (no quotes, status 'loading') — identical
 * to the prerendered HTML's baked closes — so there is no hydration
 * mismatch; the fetch runs only in the effect, after mount.
 */
export function useLiveQuotes(): LiveQuotesState {
  const [, setTick] = useState(0)
  useEffect(() => {
    const listener = () => setTick((t) => t + 1)
    liveListeners.add(listener)
    ensureLivePolling()
    return () => {
      liveListeners.delete(listener)
    }
  }, [])
  return liveState
}

/** True when the store holds live values (fresh or last-good stale). */
export function hasLiveQuotes(state: LiveQuotesState): boolean {
  return (state.status === 'live' || state.status === 'stale') && state.quotes !== null
}

/** Live close for one ticker, or null when the store holds no live map. */
export function liveCloseFor(state: LiveQuotesState, symbol: string): number | null {
  if (!hasLiveQuotes(state)) return null
  const q = state.quotes!.get(symbol)
  return q ? q.close : null
}

// ---------------------------------------------------------------------------
// ETF live-price store — the same all-or-none scan, polling and states as
// the stock store above, but over the ETF tickers in
// lib/data/etf_exchanges.json. Separate module state so the stock store
// (382 names, frozen behaviour) is never touched by ETF polling.
// ---------------------------------------------------------------------------

export const ETF_TV_TICKERS: string[] = Object.values(
  etfExchangesJson as Record<string, string>,
)

export async function fetchAllEtfQuotes(): Promise<Map<string, TvQuote> | null> {
  try {
    const res = await fetch(SCAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        symbols: { tickers: ETF_TV_TICKERS },
        columns: ['name', 'close', 'change', 'volume'],
        sort: { sortBy: 'change', sortOrder: 'desc' },
        options: { lang: 'en' },
        range: [0, ETF_TV_TICKERS.length],
      }),
    })
    if (!res.ok) return null
    const j = (await res.json()) as unknown
    if (!j || typeof j !== 'object') return null
    const data = (j as Record<string, unknown>).data
    if (!Array.isArray(data)) return null
    const quotes = new Map<string, TvQuote>()
    for (const row of data) {
      if (!row || typeof row !== 'object') continue
      const d = (row as Record<string, unknown>).d
      if (!Array.isArray(d) || d.length < 4) continue
      const [name, close, change, volume] = d
      if (typeof name !== 'string' || !isFiniteNumber(close)) continue
      quotes.set(name, {
        symbol: name,
        close,
        changePct: isFiniteNumber(change) ? change : null,
        volume: isFiniteNumber(volume) ? volume : null,
      })
    }
    if (quotes.size !== ETF_TV_TICKERS.length) return null
    return quotes
  } catch {
    return null
  }
}

let etfLiveState: LiveQuotesState = { quotes: null, status: 'loading', updatedAt: null }
const etfLiveListeners = new Set<() => void>()
let etfLiveTimer: ReturnType<typeof setInterval> | null = null
let etfLiveInflight: Promise<Map<string, TvQuote> | null> | null = null

function emitEtfLive() {
  for (const l of etfLiveListeners) l()
}

async function refreshEtfLive() {
  if (typeof document !== 'undefined' && document.hidden) return
  const now = new Date()
  if (!isMarketHours(now)) {
    if (etfLiveState.status !== 'closed') {
      etfLiveState = { quotes: null, status: 'closed', updatedAt: etfLiveState.updatedAt }
      emitEtfLive()
    }
    return
  }
  if (!etfLiveInflight) {
    etfLiveInflight = fetchAllEtfQuotes()
    void etfLiveInflight.then(() => {
      etfLiveInflight = null
    })
  }
  const quotes = await etfLiveInflight
  if (quotes) {
    etfLiveState = { quotes, status: 'live', updatedAt: formatCtTime(new Date()) }
  } else if (etfLiveState.quotes) {
    etfLiveState = { ...etfLiveState, status: 'stale' }
  } else {
    etfLiveState = { quotes: null, status: 'error', updatedAt: null }
  }
  emitEtfLive()
}

function ensureEtfPolling() {
  if (etfLiveTimer !== null) return
  void refreshEtfLive()
  etfLiveTimer = setInterval(() => {
    void refreshEtfLive()
  }, LIVE_POLL_MS)
}

export function useLiveEtfQuotes(): LiveQuotesState {
  const [, setTick] = useState(0)
  useEffect(() => {
    const listener = () => setTick((t) => t + 1)
    etfLiveListeners.add(listener)
    ensureEtfPolling()
    return () => {
      etfLiveListeners.delete(listener)
    }
  }, [])
  return etfLiveState
}

/** True when the ETF store holds live values (fresh or last-good stale). */
export function hasLiveEtfQuotes(state: LiveQuotesState): boolean {
  return (state.status === 'live' || state.status === 'stale') && state.quotes !== null
}

/** Live close for one ETF ticker, or null when the store holds no live map. */
export function liveEtfCloseFor(state: LiveQuotesState, symbol: string): number | null {
  if (!hasLiveEtfQuotes(state)) return null
  const q = state.quotes!.get(symbol)
  return q ? q.close : null
}

// ---------------------------------------------------------------------------
// Index live-level store — the same all-or-none scan, polling and states
// as the ETF store above, but over the 6 index tickers. Separate module
// state so the stock and ETF stores are never touched by index polling.
// The scanner returns the short index name (SPX, NDX, DJI, RUT, SOX,
// VIX) as d[0], so the map is keyed by ticker, like the ETF store.
// ---------------------------------------------------------------------------

/** TradingView scanner symbols for the 6 index levels (same symbols as
    lib/data/index_universe.json; FTSE:RUT is the only symbol that
    resolves for the Russell 2000). */
export const INDEX_TV_TICKERS: string[] = [
  'SP:SPX',
  'NASDAQ:NDX',
  'DJ:DJI',
  'FTSE:RUT',
  'NASDAQ:SOX',
  'CBOE:VIX',
]

export async function fetchAllIndexQuotes(): Promise<Map<string, TvQuote> | null> {
  try {
    const res = await fetch(SCAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        symbols: { tickers: INDEX_TV_TICKERS },
        columns: ['name', 'close', 'change'],
        sort: { sortBy: 'change', sortOrder: 'desc' },
        options: { lang: 'en' },
        range: [0, INDEX_TV_TICKERS.length],
      }),
    })
    if (!res.ok) return null
    const j = (await res.json()) as unknown
    if (!j || typeof j !== 'object') return null
    const data = (j as Record<string, unknown>).data
    if (!Array.isArray(data)) return null
    const quotes = new Map<string, TvQuote>()
    for (const row of data) {
      if (!row || typeof row !== 'object') continue
      const d = (row as Record<string, unknown>).d
      if (!Array.isArray(d) || d.length < 3) continue
      const [name, close, change] = d
      if (typeof name !== 'string' || !isFiniteNumber(close)) continue
      quotes.set(name, {
        symbol: name,
        close,
        changePct: isFiniteNumber(change) ? change : null,
        volume: null,
      })
    }
    if (quotes.size !== INDEX_TV_TICKERS.length) return null
    return quotes
  } catch {
    return null
  }
}

let indexLiveState: LiveQuotesState = { quotes: null, status: 'loading', updatedAt: null }
const indexLiveListeners = new Set<() => void>()
let indexLiveTimer: ReturnType<typeof setInterval> | null = null
let indexLiveInflight: Promise<Map<string, TvQuote> | null> | null = null

function emitIndexLive() {
  for (const l of indexLiveListeners) l()
}

async function refreshIndexLive() {
  if (typeof document !== 'undefined' && document.hidden) return
  const now = new Date()
  if (!isMarketHours(now)) {
    if (indexLiveState.status !== 'closed') {
      indexLiveState = { quotes: null, status: 'closed', updatedAt: indexLiveState.updatedAt }
      emitIndexLive()
    }
    return
  }
  if (!indexLiveInflight) {
    indexLiveInflight = fetchAllIndexQuotes()
    void indexLiveInflight.then(() => {
      indexLiveInflight = null
    })
  }
  const quotes = await indexLiveInflight
  if (quotes) {
    indexLiveState = { quotes, status: 'live', updatedAt: formatCtTime(new Date()) }
  } else if (indexLiveState.quotes) {
    indexLiveState = { ...indexLiveState, status: 'stale' }
  } else {
    indexLiveState = { quotes: null, status: 'error', updatedAt: null }
  }
  emitIndexLive()
}

function ensureIndexPolling() {
  if (indexLiveTimer !== null) return
  void refreshIndexLive()
  indexLiveTimer = setInterval(() => {
    void refreshIndexLive()
  }, LIVE_POLL_MS)
}

export function useLiveIndexQuotes(): LiveQuotesState {
  const [, setTick] = useState(0)
  useEffect(() => {
    const listener = () => setTick((t) => t + 1)
    indexLiveListeners.add(listener)
    ensureIndexPolling()
    return () => {
      indexLiveListeners.delete(listener)
    }
  }, [])
  return indexLiveState
}

/** True when the index store holds live values (fresh or last-good stale). */
export function hasLiveIndexQuotes(state: LiveQuotesState): boolean {
  return (state.status === 'live' || state.status === 'stale') && state.quotes !== null
}

/** Live level for one index ticker, or null when the store holds no live map. */
export function liveIndexCloseFor(state: LiveQuotesState, symbol: string): number | null {
  if (!hasLiveIndexQuotes(state)) return null
  const q = state.quotes!.get(symbol)
  return q ? q.close : null
}

// ---------------------------------------------------------------------------
// IPO live-price store — the same all-or-none scan, polling and states
// as the ETF/index stores above, but over the IPO dossier tickers.
// Separate module state so the stock, ETF and index stores are never
// touched by IPO polling. A new IPO's day change is null on the
// scanner (no previous close) — the fetch tolerates a null change
// (close and volume must be present), and the dossier page shows the
// change vs the offer price instead on day one.
// ---------------------------------------------------------------------------

/** TradingView scanner symbols for the IPO dossiers (same symbols as
    lib/data/ipo_universe.json; all four list on Nasdaq). */
export const IPO_TV_TICKERS: string[] = ['NASDAQ:ANT', 'NASDAQ:SPCX', 'NASDAQ:CRWV', 'NASDAQ:NBIS']

export async function fetchAllIpoQuotes(): Promise<Map<string, TvQuote> | null> {
  try {
    const res = await fetch(SCAN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        symbols: { tickers: IPO_TV_TICKERS },
        columns: ['name', 'close', 'change', 'volume'],
        sort: { sortBy: 'change', sortOrder: 'desc' },
        options: { lang: 'en' },
        range: [0, IPO_TV_TICKERS.length],
      }),
    })
    if (!res.ok) return null
    const j = (await res.json()) as unknown
    if (!j || typeof j !== 'object') return null
    const data = (j as Record<string, unknown>).data
    if (!Array.isArray(data)) return null
    const quotes = new Map<string, TvQuote>()
    for (const row of data) {
      if (!row || typeof row !== 'object') continue
      const d = (row as Record<string, unknown>).d
      if (!Array.isArray(d) || d.length < 4) continue
      const [name, close, change, volume] = d
      if (typeof name !== 'string' || !isFiniteNumber(close)) continue
      quotes.set(name, {
        symbol: name,
        close,
        changePct: isFiniteNumber(change) ? change : null,
        volume: isFiniteNumber(volume) ? volume : null,
      })
    }
    if (quotes.size !== IPO_TV_TICKERS.length) return null
    return quotes
  } catch {
    return null
  }
}

let ipoLiveState: LiveQuotesState = { quotes: null, status: 'loading', updatedAt: null }
const ipoLiveListeners = new Set<() => void>()
let ipoLiveTimer: ReturnType<typeof setInterval> | null = null
let ipoLiveInflight: Promise<Map<string, TvQuote> | null> | null = null

function emitIpoLive() {
  for (const l of ipoLiveListeners) l()
}

async function refreshIpoLive() {
  if (typeof document !== 'undefined' && document.hidden) return
  const now = new Date()
  if (!isMarketHours(now)) {
    if (ipoLiveState.status !== 'closed') {
      ipoLiveState = { quotes: null, status: 'closed', updatedAt: ipoLiveState.updatedAt }
      emitIpoLive()
    }
    return
  }
  if (!ipoLiveInflight) {
    ipoLiveInflight = fetchAllIpoQuotes()
    void ipoLiveInflight.then(() => {
      ipoLiveInflight = null
    })
  }
  const quotes = await ipoLiveInflight
  if (quotes) {
    ipoLiveState = { quotes, status: 'live', updatedAt: formatCtTime(new Date()) }
  } else if (ipoLiveState.quotes) {
    ipoLiveState = { ...ipoLiveState, status: 'stale' }
  } else {
    ipoLiveState = { quotes: null, status: 'error', updatedAt: null }
  }
  emitIpoLive()
}

function ensureIpoPolling() {
  if (ipoLiveTimer !== null) return
  void refreshIpoLive()
  ipoLiveTimer = setInterval(() => {
    void refreshIpoLive()
  }, LIVE_POLL_MS)
}

export function useLiveIpoQuotes(): LiveQuotesState {
  const [, setTick] = useState(0)
  useEffect(() => {
    const listener = () => setTick((t) => t + 1)
    ipoLiveListeners.add(listener)
    ensureIpoPolling()
    return () => {
      ipoLiveListeners.delete(listener)
    }
  }, [])
  return ipoLiveState
}

/** True when the IPO store holds live values (fresh or last-good stale). */
export function hasLiveIpoQuotes(state: LiveQuotesState): boolean {
  return (state.status === 'live' || state.status === 'stale') && state.quotes !== null
}

/** Live close for one IPO ticker, or null when the store holds no live map. */
export function liveIpoCloseFor(state: LiveQuotesState, symbol: string): number | null {
  if (!hasLiveIpoQuotes(state)) return null
  const q = state.quotes!.get(symbol)
  return q ? q.close : null
}
