// Live quotes for the Trending boards, via TradingView's free scanner
// API — no key, no signup, no proxy (same source as the header strip's
// live chips in components/MarketStrip.tsx).
//
// VERIFIED 17 Nov 2026 from curl, and re-verified while building the
// Trending page:
//   POST https://scanner.tradingview.com/america/scan
//   body: {"symbols":{"tickers":[<227 exchange-prefixed tickers>]},
//          "columns":["name","close","change","volume"],
//          "sort":{"sortBy":"change"|"volume","sortOrder":"asc"|"desc"},
//          "options":{"lang":"en"},"range":[0,10]}
//   response: {"totalCount":227,"data":[{"s":"NASDAQ:AAPL",
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
//      227 tickers resolve. The explicit tickers list makes the filter
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
// Exchange map: lib/data/exchanges.json, generated 17 Nov 2026 from the
// free NASDAQ Trader symdir files (nasdaqlisted.txt + otherlisted.txt,
// file creation 20261117 10:01) — 227/227 covered: NYSE 118, NASDAQ 108,
// CBOE 1. One hand-correction, verified against the live scanner:
// CBOE (Cboe Global Markets, Cboe BZX listing) is "CBOE:CBOE" —
// "BATS:CBOE" returns symbol_not_exists. BRK-B is "NYSE:BRK.B".
// If a ticker ever goes missing from both symdir files, STOP and report
// it — never guess an exchange, never silently drop a name.

import { useEffect, useState } from 'react'
import exchangesJson from './data/exchanges.json'

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
 * One scan for ALL 227 quotes — the single live-price fetch every live
 * surface on a page shares. Same endpoint, same Content-Type: text/plain
 * rule, same row-matching (d[0], never the `s` prefix) as scanTradingView
 * above. Verified 17 Nov 2026 from curl: range [0,227] returns
 * totalCount 227 and all 227 distinct symbols in one response.
 *
 * All-or-none: returns null unless every one of the 227 tickers came
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
 * scanner covers, including OTC names — it is NOT our 227.
 *
 * Same CORS rule as the other scans: Content-Type: text/plain, never
 * application/json. Null on any failure — the caller falls back to the
 * baked 227-name counts in macro.json. After hours the scanner returns
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
// 227-row /stocks table all share one scan per poll. The header strip
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
