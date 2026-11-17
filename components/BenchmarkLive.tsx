// Benchmark — S&P 500, its own section on the Performance page, below
// the picks and never blended into a pick table. Two returns: since the
// launch cohort's entry date (13 Nov 2026) and since the new cohort's
// entry date (16 Nov 2026). Entry closes are frozen (lib/site.ts
// BENCHMARK, from Yahoo Finance); the latest price is live during
// market hours via TradingView SP:SPX — one fetch per page, 60s polls
// in market hours only, same gating as the header strip. After hours,
// or if the fetch fails, the baked close from this build's data is
// shown with its as-of label and no LIVE badge. Hand-check at the
// 16 Nov 2026 close: −1.92% since 13 Nov, 0.00% since 16 Nov.

'use client'

import { useEffect, useState } from 'react'
import { money } from '@/lib/data'
import { Card, signedPctSpan } from '@/components/ui'
import { fetchSymbolQuote, formatCtTime, isMarketHours } from '@/lib/tradingview'
import { BENCHMARK } from '@/lib/site'

const POLL_MS = 60_000

type BenchStatus = 'loading' | 'live' | 'closed' | 'stale' | 'error'

export default function BenchmarkLive({
  bakedLatest,
  latestCloseDate,
}: {
  /** Latest close in this build's data (the S&P 500 close in market.json). */
  bakedLatest: number
  latestCloseDate: string
}) {
  const [live, setLive] = useState<{ close: number; updatedAt: string } | null>(null)
  const [status, setStatus] = useState<BenchStatus>('loading')

  useEffect(() => {
    let stopped = false
    const refresh = async () => {
      if (document.hidden) return
      if (!isMarketHours(new Date())) {
        if (!stopped) {
          setLive(null)
          setStatus('closed')
        }
        return
      }
      const q = await fetchSymbolQuote('SP:SPX')
      if (stopped) return
      if (q) {
        setLive({ close: q.close, updatedAt: formatCtTime(new Date()) })
        setStatus('live')
      } else {
        // Keep the last-good live value on screen (stale), never a
        // half-live page; if nothing ever loaded, fall back to baked.
        setStatus((prev) => (prev === 'live' || prev === 'stale' ? 'stale' : 'error'))
      }
    }
    refresh()
    const pollId = setInterval(refresh, POLL_MS)
    return () => {
      stopped = true
      clearInterval(pollId)
    }
  }, [])

  const liveNow = (status === 'live' || status === 'stale') && live !== null
  const latest = liveNow ? live!.close : bakedLatest
  const sinceLaunch = (latest - BENCHMARK.launchEntryClose) / BENCHMARK.launchEntryClose
  const sinceNew = (latest - BENCHMARK.newEntryClose) / BENCHMARK.newEntryClose

  return (
    <Card title="Benchmark — S&P 500">
      {status === 'live' && live ? (
        <p>
          <span className="live-badge">
            <span className="live-dot" aria-hidden="true" />
            LIVE
          </span>{' '}
          · Updated {live.updatedAt} CT · Quotes delayed ~15 min (TradingView) · Prev. close{' '}
          {latestCloseDate}
        </p>
      ) : status === 'stale' && live ? (
        <p>
          Couldn&apos;t refresh — showing last live update {live.updatedAt} CT · Quotes delayed
          ~15 min (TradingView)
        </p>
      ) : status === 'error' ? (
        <p>Live price could not be loaded — showing the {latestCloseDate} close.</p>
      ) : null}
      <table>
        <thead>
          <tr>
            <th>Since</th>
            <th className="num">Entry close</th>
            <th className="num">{liveNow ? 'Latest (live)' : 'Latest close'}</th>
            <th className="num">Return since entry</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>13 Nov 2026 (launch cohort)</td>
            <td className="num">{money(BENCHMARK.launchEntryClose)}</td>
            <td className="num">{money(latest)}</td>
            <td className="num">{signedPctSpan(sinceLaunch)}</td>
          </tr>
          <tr>
            <td>16 Nov 2026 (new cohort)</td>
            <td className="num">{money(BENCHMARK.newEntryClose)}</td>
            <td className="num">{money(latest)}</td>
            <td className="num">{signedPctSpan(sinceNew)}</td>
          </tr>
        </tbody>
      </table>
      <p className="footnote">
        The S&amp;P 500 is the benchmark for both pick cohorts — shown here on its own, never
        blended into a pick table. Entry closes are from {BENCHMARK.source}: 13 Nov 2026{' '}
        {money(BENCHMARK.launchEntryClose)} and 16 Nov 2026 {money(BENCHMARK.newEntryClose)}.
        No costs or dividends are included, same as the picks. At the 16 Nov 2026 close the
        benchmark was −1.9% since 13 Nov and 0.0% since 16 Nov.
      </p>
    </Card>
  )
}
