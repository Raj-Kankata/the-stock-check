'use client'

import Link from 'next/link'
import { useState } from 'react'
import { TICKER_SYMBOLS, getTicker } from '@/lib/data'
import SensitivityGrid from '@/components/SensitivityGrid'

/**
 * Homepage fair-value grid preview. A native <select> picks one of the
 * 227 scored tickers (default NVDA) and renders that ticker's DCF
 * sensitivity grid with the same click-to-compare behaviour as the stock
 * page. All grid values come from lib/data (results.json) — nothing is
 * hardcoded here. Every published name has a computed DCF leg, so the grid
 * always renders; SensitivityGrid still renders its own skipped note if a
 * leg were ever skipped.
 */
export default function GridPreview() {
  const [symbol, setSymbol] = useState('NVDA')
  const t = getTicker(symbol)
  if (!t) return null

  const detail = t.pillars.valuation.detail
  const legs = detail.legs
  const grid = detail.dcf_sensitivity_grid

  return (
    <div>
      <p>
        Tap any cell to see its value under those assumptions — the highlighted cell is
        this stock&apos;s own decision DCF leg.
      </p>
      <p>
        <label htmlFor="grid-ticker">
          <strong>Stock: </strong>
        </label>{' '}
        <select
          id="grid-ticker"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          style={{ fontSize: 16, fontFamily: 'Arial, Helvetica, sans-serif', padding: '8px 10px', border: '1px solid #d7dce3', borderRadius: 8, maxWidth: '100%' }}
        >
          {TICKER_SYMBOLS.map((s) => {
            const opt = getTicker(s)
            return (
              <option key={s} value={s}>
                {s}
                {opt ? ` — ${opt.name}` : ''}
              </option>
            )
          })}
        </select>
      </p>
      <div style={{ overflowX: 'auto' }}>
        <SensitivityGrid
          key={symbol}
          values={grid?.values ?? null}
          decisionLeg={legs?.dcf.value ?? null}
          decisionGrowth={legs?.dcf.growth_scenario ?? null}
          note={grid?.note ?? ''}
          price={t.price}
        />
      </div>
      <p>
        <Link href={`/stock/${symbol}`}>See the full card →</Link>
      </p>
    </div>
  )
}
