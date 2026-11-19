'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { PublicGrid } from '@/lib/public-types'
import SensitivityGrid from '@/components/SensitivityGrid'

/**
 * Homepage fair-value grid preview. A native <select> picks one of the
 * 382 scored tickers (default NVDA) and renders that ticker's DCF
 * sensitivity grid with the same click-to-compare behaviour as the stock
 * page. The grids arrive as props from the homepage at build time —
 * grid VALUES only, never the grid notes or any other part of the
 * full results data. Every published name has a computed DCF leg, so the
 * grid always renders; SensitivityGrid still renders its own skipped
 * note if a leg were ever skipped.
 */
export default function GridPreview({ grids }: { grids: PublicGrid[] }) {
  const [symbol, setSymbol] = useState('NVDA')
  const t = grids.find((g) => g.symbol === symbol) ?? null
  if (!t) return null

  return (
    <div>
      <p>
        Tap any cell to see its value under those assumptions — the highlighted cell is
        this stock&apos;s own published DCF value.
      </p>
      <p>
        <label htmlFor="grid-ticker">
          <strong>Stock: </strong>
        </label>{' '}
        <select
          id="grid-ticker"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          style={{ fontSize: 16, fontFamily: 'Arial, Helvetica, sans-serif', padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, maxWidth: '100%', background: 'var(--input-bg)', color: 'var(--ink)' }}
        >
          {grids.map((g) => (
            <option key={g.symbol} value={g.symbol}>
              {g.symbol} — {g.name}
            </option>
          ))}
        </select>
      </p>
      <div style={{ overflowX: 'auto' }}>
        <SensitivityGrid
          key={symbol}
          values={t.gridValues}
          decisionLeg={t.dcfLeg}
          decisionGrowth={t.dcfGrowth}
          price={t.price}
        />
      </div>
      <p>
        <Link href={`/stock/${symbol}`}>See the full card →</Link>
      </p>
    </div>
  )
}
