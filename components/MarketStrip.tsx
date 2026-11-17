// Market snapshot strip for the site header.
// Baked values come from lib/data/market.json (nightly-refresh closes;
// 10Y Treasury from FRED DGS10, which lags a day — its own as-of date
// is shown honestly and it is never presented as the close date).
// During US market hours (09:30–16:00 ET, Mon–Fri) the four index chips
// and the 10Y yield refresh live from TradingView's public scanner
// endpoint — no key, no signup, no proxy. The endpoint returns
// Access-Control-Allow-Origin for this site (verified 17 Nov 2026 from
// curl with the site's Origin; all five symbols return 200 + JSON).
// Index quotes are 10–15 min delayed (update_mode delayed_streaming_600
// for the Dow, delayed_streaming_900 for S&P/Nasdaq/VIX); the 10Y yield
// streams live. That delay is printed on the strip whenever live values
// show. Outside market hours, or if any live fetch fails, the baked close
// values stay on screen with the "as of close" label — a live number is
// never faked and a stale number is never labelled live.
// RULE: if market.json is missing an entry, that chip is hidden —
// never render a placeholder or a stale number as live.

'use client'

import { useEffect, useState } from 'react'
import marketJson from '@/lib/data/market.json'

interface MarketIndex {
  symbol?: string
  label?: string
  close?: number
  change?: number
  change_pct?: number
}

interface MarketData {
  as_of?: string
  indices?: MarketIndex[]
  treasury_10y?: { value_pct?: number; as_of?: string }
}

interface LiveQuote {
  close: number
  changePct: number
  changeAbs: number
}

interface LiveIndices {
  spx: LiveQuote
  ixic: LiveQuote
  dji: LiveQuote
  vix: LiveQuote
}

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

// TradingView scanner symbols for the five strip chips. Plain GET, no
// custom headers, so the browser sends a simple request (no preflight).
const TV_SYMBOLS = {
  spx: 'SP:SPX',
  ixic: 'NASDAQ:IXIC',
  dji: 'DJ:DJI',
  vix: 'CBOE:VIX',
  us10y: 'TVC:US10Y',
} as const

const POLL_MS = 60_000

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

// True only during the regular US session, 09:30–16:00 ET, Mon–Fri.
// Holidays are not checked: on a holiday TradingView returns the last
// close, which the strip then shows as the live value — the numbers are
// still the latest available, and the delay note stays printed.
function isMarketHours(now: Date): boolean {
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

async function fetchQuote(tvSymbol: string): Promise<LiveQuote | null> {
  try {
    const url = `https://scanner.tradingview.com/symbol?symbol=${encodeURIComponent(
      tvSymbol,
    )}&fields=close,change,change_abs`
    const res = await fetch(url)
    if (!res.ok) return null
    const j = (await res.json()) as unknown
    if (!j || typeof j !== 'object') return null
    const { close, change, change_abs } = j as Record<string, unknown>
    if (!isFiniteNumber(close) || !isFiniteNumber(change) || !isFiniteNumber(change_abs)) {
      return null
    }
    // TradingView's `change` is already a percent (-1.92), `change_abs`
    // is points (-145.08); market.json stores change_pct as a fraction.
    return { close, changePct: change, changeAbs: change_abs }
  } catch {
    return null
  }
}

export default function MarketStrip() {
  const data = marketJson as unknown as MarketData
  const indices = Array.isArray(data.indices) ? data.indices : []
  const chips = indices.filter(
    (i) =>
      typeof i.label === 'string' &&
      isFiniteNumber(i.close) &&
      isFiniteNumber(i.change) &&
      isFiniteNumber(i.change_pct),
  )
  const treasury = data.treasury_10y
  const showTreasury = treasury && isFiniteNumber(treasury.value_pct)

  const asOf = formatDate(data.as_of)
  const treasuryAsOf = formatDate(treasury?.as_of)

  // Clock + live quotes live in state so the prerendered HTML (baked
  // closes, no clock) matches the first client render exactly — the
  // clock appears and live polling starts only after mount.
  const [clock, setClock] = useState<string | null>(null)
  const [live, setLive] = useState<LiveIndices | null>(null)
  const [liveTreasury, setLiveTreasury] = useState<LiveQuote | null>(null)
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null)

  useEffect(() => {
    const tickClock = () => setClock(ctTimeFmt.format(new Date()))
    tickClock()
    const clockId = setInterval(tickClock, 1000)

    let stopped = false
    const refresh = async () => {
      if (document.hidden) return
      if (!isMarketHours(new Date())) {
        // Session ended while the page was open: back to baked closes.
        if (!stopped) {
          setLive(null)
          setLiveTreasury(null)
          setLiveUpdatedAt(null)
        }
        return
      }
      const [spx, ixic, dji, vix, us10y] = await Promise.all([
        fetchQuote(TV_SYMBOLS.spx),
        fetchQuote(TV_SYMBOLS.ixic),
        fetchQuote(TV_SYMBOLS.dji),
        fetchQuote(TV_SYMBOLS.vix),
        fetchQuote(TV_SYMBOLS.us10y),
      ])
      if (stopped) return
      // Indices are all-or-nothing: one bad leg and the strip stays on
      // baked closes rather than showing a half-live row.
      if (spx && ixic && dji && vix) {
        setLive({ spx, ixic, dji, vix })
        setLiveUpdatedAt(ctTimeFmt.format(new Date()))
      }
      // The 10Y yield is independent — it can go live even if an index
      // leg failed, and it stays baked if its own fetch failed.
      if (us10y) setLiveTreasury(us10y)
    }
    refresh()
    const pollId = setInterval(refresh, POLL_MS)
    return () => {
      stopped = true
      clearInterval(clockId)
      clearInterval(pollId)
    }
  }, [])

  // Map each baked chip to its live quote (by Yahoo symbol in market.json).
  const liveBySymbol: Record<string, LiveQuote | undefined> = live
    ? { '^GSPC': live.spx, '^IXIC': live.ixic, '^DJI': live.dji, '^VIX': live.vix }
    : {}

  const isLive = live !== null

  return (
    <div className="market-strip">
      {asOf && (
        <p className="market-strip-date">
          {isLive ? (
            <>
              <span className="live-badge">
                <span className="live-dot" aria-hidden="true" />
                LIVE
              </span>{' '}
              · Updated {liveUpdatedAt} CT · Index quotes delayed 10–15 min
              (TradingView) · Prev. close {asOf}
              {liveTreasury
                ? ' · 10Y yield live'
                : showTreasury && treasuryAsOf
                  ? ` · 10Y as of ${treasuryAsOf}`
                  : ''}
            </>
          ) : (
            <>
              Markets as of {asOf} close
              {showTreasury && treasuryAsOf ? ` · 10Y as of ${treasuryAsOf}` : ''}
            </>
          )}
          {clock ? ` · ${clock} CT` : ''}
        </p>
      )}
      <div className="market-strip-chips">
        {chips.map((i) => {
          const liveQ = i.symbol ? liveBySymbol[i.symbol] : undefined
          const value = liveQ ? liveQ.close : i.close!
          const change = liveQ ? liveQ.changeAbs : i.change!
          // Baked change_pct is a fraction; TradingView change is a percent.
          const changePct = liveQ ? liveQ.changePct : i.change_pct! * 100
          const direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
          const sign = change > 0 ? '+' : ''
          const pctSign = changePct > 0 ? '+' : ''
          return (
            <span key={i.label} className={`market-chip ${direction}`}>
              <span className="market-chip-label">{i.label}</span>
              <strong>
                {value.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </strong>{' '}
              <span className="market-chip-change">
                {sign}
                {change.toFixed(2)} ({pctSign}
                {changePct.toFixed(2)}%)
              </span>
            </span>
          )
        })}
        {showTreasury && (
          <span className="market-chip flat">
            <span className="market-chip-label">10Y Treasury</span>
            <strong>
              {(liveTreasury ? liveTreasury.close : treasury!.value_pct!).toFixed(2)}%
            </strong>
            {liveTreasury && (
              <>
                {' '}
                <span className="market-chip-change">
                  {liveTreasury.changeAbs > 0 ? '+' : ''}
                  {liveTreasury.changeAbs.toFixed(2)} pts (
                  {liveTreasury.changePct > 0 ? '+' : ''}
                  {liveTreasury.changePct.toFixed(2)}%)
                </span>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  )
}
