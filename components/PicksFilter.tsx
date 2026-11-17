'use client'

import { useState } from 'react'
import Link from 'next/link'

export type PickRow = {
  symbol: string
  name: string
  verdict: 'Growth' | 'Value' | 'Avoid' | 'Watch'
  score: number
  entryPrice: string
  fairValue: string
  upside: string
  upsideClass: 'pos' | 'neg' | 'zero'
}

function scoreClass(n: number): 'good' | 'mid' | 'bad' {
  if (n >= 70) return 'good'
  if (n >= 40) return 'mid'
  return 'bad'
}

function verdictClass(v: PickRow['verdict']): string {
  return v === 'Growth' || v === 'Value' ? 'growth' : v === 'Avoid' ? 'avoid' : 'watch'
}

/**
 * Verdict filter for the Top Picks table. State-only: tapping a pill
 * filters the rows in place, no URL params. Pills (and their counts)
 * are computed live from the rows passed in, so they always match the
 * verdicts actually present in PICKS.
 */
export default function PicksFilter({ rows }: { rows: PickRow[] }) {
  const [filter, setFilter] = useState<'All' | PickRow['verdict']>('All')

  const verdicts = (['Growth', 'Value', 'Watch', 'Avoid'] as const).filter((v) =>
    rows.some((r) => r.verdict === v),
  )
  const visible = filter === 'All' ? rows : rows.filter((r) => r.verdict === filter)
  const count = (v: 'All' | PickRow['verdict']) =>
    v === 'All' ? rows.length : rows.filter((r) => r.verdict === v).length

  return (
    <>
      <div className="filter-row" role="group" aria-label="Filter picks by verdict">
        {(['All', ...verdicts] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={`filter-pill${filter === v ? ' active' : ''}`}
            aria-pressed={filter === v}
            onClick={() => setFilter(v)}
          >
            {v} ({count(v)})
          </button>
        ))}
      </div>
      <table>
        <thead>
          <tr>
            <th>Stock</th>
            <th>Verdict</th>
            <th className="num">Score</th>
            <th className="num">Entry price</th>
            <th className="num">Fair value</th>
            <th className="num">Upside vs entry</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.symbol}>
              <td>
                <Link href={`/stock/${r.symbol}`}>
                  <strong>{r.symbol}</strong>
                </Link>
                <br />
                <span className="footnote">{r.name}</span>
              </td>
              <td>
                <span className={`pill ${verdictClass(r.verdict)}`}>{r.verdict}</span>
              </td>
              <td className="num">
                <span className={`score-${scoreClass(r.score)}`}>{r.score.toFixed(1)}</span>
              </td>
              <td className="num">{r.entryPrice}</td>
              <td className="num">{r.fairValue}</td>
              <td className="num">
                <span className={`num-${r.upsideClass}`}>{r.upside}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
