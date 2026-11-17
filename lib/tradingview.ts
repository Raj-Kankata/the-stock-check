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
