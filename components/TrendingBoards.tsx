// Trending boards — Top Gainers / Top Losers / Most Active, ranked by
// LIVE day move among the 227 stocks we score, from TradingView's free
// scanner (see lib/tradingview.ts). Live data fills in after mount: the
// page is statically prerendered and the prerendered HTML (loading
// placeholders, no numbers) must match the first client render exactly,
// so no fetch runs before useEffect — same pattern as
// components/MarketStrip.tsx.
//
// States, honestly labelled — a stale or missing number is never shown
// as live:
//   loading — first fetch still in flight; placeholders, no numbers.
//   live    — market hours (09:30–16:00 ET Mon–Fri) and the last fetch
//             succeeded; LIVE badge + "Updated HH:MM:SS CT" + the
//             ~15-min delay note.
//   closed  — outside market hours; the same scan returns the frozen
//             close values, so the boards ARE the close boards, labelled
//             "as of the {priceDate} close" with no LIVE badge and no
//             polling (frozen values do not need re-polling).
//   stale   — a poll failed but the page already has boards; the last
//             good boards stay up with a "Couldn't refresh" notice.
//   error   — nothing ever loaded; an honest error card with a retry
//             button and no numbers.
// Polling is every 60s and only while the market is open; a tick outside
// market hours only flips the label (live -> close) and does not fetch.

'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Card, VerdictBadge, scoreSpan, signedSpan } from '@/components/ui'
import { money } from '@/lib/format'
import type { Verdict } from '@/lib/public-types'
import {
  formatCtTime,
  isMarketHours,
  scanTradingView,
  type TvQuote,
} from '@/lib/tradingview'

export interface TrendingStockMeta {
  symbol: string
  name: string
  verdict: Verdict
  score: number
}

interface Boards {
  gainers: TvQuote[]
  losers: TvQuote[]
  active: TvQuote[]
}

type Status = 'loading' | 'live' | 'closed' | 'stale' | 'error'

const POLL_MS = 60_000
const BOARD_SIZE = 10

function BoardTable({
  rows,
  meta,
  showVolume,
}: {
  rows: TvQuote[]
  meta: Map<string, TrendingStockMeta>
  showVolume: boolean
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Stock</th>
          <th>Verdict</th>
          <th className="num">Score</th>
          <th className="num">Price</th>
          <th className="num">Day change</th>
          {showVolume ? <th className="num">Volume</th> : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((q, i) => {
          const m = meta.get(q.symbol)
          return (
            <tr key={q.symbol}>
              <td className="num">{i + 1}</td>
              <td>
                <Link href={`/stock/${q.symbol}`}>
                  <strong>{q.symbol}</strong>
                </Link>
                <br />
                <span className="footnote">{m ? m.name : q.symbol}</span>
              </td>
              <td>{m ? <VerdictBadge verdict={m.verdict} /> : '—'}</td>
              <td className="num">{m ? scoreSpan(m.score) : '—'}</td>
              <td className="num">{money(q.close)}</td>
              <td className="num">
                {q.changePct === null
                  ? '—'
                  : signedSpan(
                      q.changePct,
                      `${q.changePct > 0 ? '+' : ''}${q.changePct.toFixed(2)}%`,
                    )}
              </td>
              {showVolume ? (
                <td className="num">
                  {q.volume === null ? '—' : q.volume.toLocaleString('en-US')}
                </td>
              ) : null}
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function TrendingBoards({
  priceDateLabel,
  stocks,
}: {
  priceDateLabel: string
  stocks: TrendingStockMeta[]
}) {
  const meta = new Map(stocks.map((s) => [s.symbol, s]))
  const [boards, setBoards] = useState<Boards | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  const boardsRef = useRef<Boards | null>(null)

  useEffect(() => {
    let stopped = false

    const fetchBoards = async (): Promise<boolean> => {
      const [gainers, losers, active] = await Promise.all([
        scanTradingView('change', 'desc'),
        scanTradingView('change', 'asc'),
        scanTradingView('volume', 'desc'),
      ])
      if (stopped) return false
      // All three boards or none: a half-live page would mix fresh
      // numbers with stale ones under one timestamp.
      if (!gainers || !losers || !active) return false
      // A row with no day change cannot rank on a movers board (it can
      // still rank on Most Active); a row with no volume cannot rank on
      // Most Active. Unknown names (not in our 227) never reach a board.
      const known = (rows: TvQuote[]) => rows.filter((q) => meta.has(q.symbol))
      const next: Boards = {
        gainers: known(gainers).filter((q) => q.changePct !== null).slice(0, BOARD_SIZE),
        losers: known(losers).filter((q) => q.changePct !== null).slice(0, BOARD_SIZE),
        active: known(active).filter((q) => q.volume !== null).slice(0, BOARD_SIZE),
      }
      boardsRef.current = next
      setBoards(next)
      setUpdatedAt(formatCtTime(new Date()))
      return true
    }

    const refresh = async () => {
      if (document.hidden) return
      const liveNow = isMarketHours(new Date())
      if (!liveNow && boardsRef.current) {
        // Market closed while the page was open: the boards on screen
        // are the close values already — just drop the LIVE badge. A
        // stale (failed-refresh) board keeps its warning instead.
        setStatus((s) => (s === 'live' ? 'closed' : s))
        return
      }
      const ok = await fetchBoards()
      if (stopped) return
      if (ok) {
        setStatus(liveNow ? 'live' : 'closed')
      } else if (boardsRef.current) {
        setStatus('stale')
      } else {
        setStatus('error')
      }
    }

    refresh()
    const pollId = setInterval(refresh, POLL_MS)
    return () => {
      stopped = true
      clearInterval(pollId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryTick])

  const isLive = status === 'live'

  return (
    <>
      <div className="callout blue">
        <p>
          <strong>How trending is ranked.</strong> Three boards, all drawn
          from the same 227 stocks we score — no social mentions, no options
          flow, no search volume, nothing off-page:
        </p>
        <ul>
          <li>
            <strong>Top Gainers</strong> — the biggest live day gain, in %.
          </li>
          <li>
            <strong>Top Losers</strong> — the biggest live day loss, in %.
          </li>
          <li>
            <strong>Most Active</strong> — the highest live share volume.
          </li>
        </ul>
        <p>
          {isLive ? (
            <>
              <span className="live-badge">
                <span className="live-dot" aria-hidden="true" />
                LIVE
              </span>{' '}
              · Updated {updatedAt ?? '—'} CT · Quotes delayed ~15 min
              (TradingView) · Prev. close {priceDateLabel}
            </>
          ) : status === 'closed' ? (
            <>
              As of the {priceDateLabel} close
              {updatedAt ? ` · Updated ${updatedAt} CT` : ''}
            </>
          ) : status === 'stale' ? (
            <>
              Couldn&apos;t refresh — showing last update {updatedAt ?? '—'} CT
            </>
          ) : status === 'error' ? (
            <>Live boards could not be loaded.</>
          ) : (
            <>Loading live boards…</>
          )}
        </p>
      </div>

      {status === 'error' ? (
        <Card title="Trending boards unavailable" accent="red">
          <p>
            The live scan could not be reached, so there are no boards to show
            right now — no numbers are being presented as live or as of close.
            Please try again.
          </p>
          <button type="button" className="btn" onClick={() => setRetryTick((n) => n + 1)}>
            Retry
          </button>
        </Card>
      ) : status === 'loading' ? (
        <>
          <Card title="Top Gainers">
            <p>Loading live boards…</p>
          </Card>
          <Card title="Top Losers">
            <p>Loading live boards…</p>
          </Card>
          <Card title="Most Active">
            <p>Loading live boards…</p>
          </Card>
        </>
      ) : boards ? (
        <>
          <Card title="Top Gainers" accent="green">
            <p>
              Biggest live day gain among the 227 scored names, with our
              verdict and overall score next to the move.
            </p>
            <BoardTable rows={boards.gainers} meta={meta} showVolume={false} />
          </Card>
          <Card title="Top Losers" accent="red">
            <p>
              Biggest live day loss among the 227 scored names, with our
              verdict and overall score next to the move.
            </p>
            <BoardTable rows={boards.losers} meta={meta} showVolume={false} />
          </Card>
          <Card title="Most Active">
            <p>
              Highest live share volume among the 227 scored names, with our
              verdict and overall score next to the move.
            </p>
            <BoardTable rows={boards.active} meta={meta} showVolume />
          </Card>
          <p className="footnote">
            Each row links to the stock&apos;s card, where the pillar scores,
            the three fair-value angles and the spread between them are all
            published.
          </p>
        </>
      ) : null}
    </>
  )
}
