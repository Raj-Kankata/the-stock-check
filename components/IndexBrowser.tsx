// /indexes board — client filters over the baked index rows.
// Filters: type (broad market / sector / volatility), momentum read.
// Sort: momentum score, technical score, or name.
// VIX NEVER sits in the shared sort: it carries no Technical or
// Momentum score, so with no type filter it renders in a separate
// amber Volatility section below the main table. Only the Volatility
// filter itself puts it in the main table (with the regime columns).

'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { PublicIndexRow } from '@/lib/public-types'
import type { IndexType } from '@/components/ui'
import { IndexLiveStatusLine, LiveIndexRows } from '@/components/IndexLive'

type MomentumRead = 'Building' | 'Flat' | 'Fading'
type SortKey = 'momentum' | 'technical' | 'name'

const TYPE_FILTERS: { key: IndexType | 'all'; label: string }[] = [
  { key: 'all', label: 'All types' },
  { key: 'broad', label: 'Broad market' },
  { key: 'sector', label: 'Sector' },
  { key: 'volatility', label: 'Volatility' },
]

export default function IndexBrowser({
  rows,
  priceDate,
}: {
  rows: PublicIndexRow[]
  priceDate: string
}) {
  const [typeFilter, setTypeFilter] = useState<IndexType | 'all'>('all')
  const [momentum, setMomentum] = useState<MomentumRead | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('momentum')

  const filtered = useMemo(() => {
    let out = rows
    if (typeFilter !== 'all') out = out.filter((r) => r.type === typeFilter)
    if (momentum !== 'all') out = out.filter((r) => r.momentum_read === momentum)
    const sorted = [...out]
    if (sort === 'momentum')
      sorted.sort((a, b) => (b.momentum_score ?? -Infinity) - (a.momentum_score ?? -Infinity))
    else if (sort === 'technical')
      sorted.sort((a, b) => (b.technical_score ?? -Infinity) - (a.technical_score ?? -Infinity))
    else sorted.sort((a, b) => a.symbol.localeCompare(b.symbol))
    return sorted
  }, [rows, typeFilter, momentum, sort])

  // VIX leaves the shared sort: with no type filter it is pulled out
  // of the main table into the flagged Volatility section below.
  const showVixSeparate = typeFilter === 'all'
  const vixRows = useMemo(
    () => (showVixSeparate ? filtered.filter((r) => r.type === 'volatility') : []),
    [filtered, showVixSeparate],
  )
  const mainRows = useMemo(
    () => (showVixSeparate ? filtered.filter((r) => r.type !== 'volatility') : filtered),
    [filtered, showVixSeparate],
  )
  // The main table uses the regime columns only when it holds nothing
  // but volatility rows (the Volatility filter on).
  const mainVariant =
    mainRows.length > 0 && mainRows.every((r) => r.type === 'volatility')
      ? 'volatility'
      : 'price'

  return (
    <div>
      <IndexLiveStatusLine priceDateLabel={priceDate} />
      <div className="filter-row">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`filter-pill${typeFilter === f.key ? ' active' : ''}`}
            onClick={() => setTypeFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="filter-row">
        <label>
          Momentum{' '}
          <select
            value={momentum}
            onChange={(e) => setMomentum(e.target.value as MomentumRead | 'all')}
          >
            <option value="all">All reads</option>
            <option value="Building">Building</option>
            <option value="Flat">Flat</option>
            <option value="Fading">Fading</option>
          </select>
        </label>{' '}
        <label>
          Sort{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="momentum">Momentum score</option>
            <option value="technical">Technical score</option>
            <option value="name">Ticker A–Z</option>
          </select>
        </label>
      </div>

      <p>
        Showing {mainRows.length + vixRows.length} of {rows.length} indexes
        {typeFilter !== 'all' ? ` · type: ${typeFilter}` : ''}
        {momentum !== 'all' ? ` · momentum: ${momentum}` : ''} · levels as of the{' '}
        {priceDate} close unless marked LIVE.
      </p>

      <table>
        <thead>
          {mainVariant === 'price' ? (
            <tr>
              <th>Index</th>
              <th className="num">Level</th>
              <th className="num">Day</th>
              <th className="num">Technical</th>
              <th className="num">Momentum</th>
              <th>Type</th>
              <th>Reads</th>
            </tr>
          ) : (
            <tr>
              <th>Index</th>
              <th className="num">Level</th>
              <th className="num">Day</th>
              <th className="num">Regime</th>
              <th className="num">VIX3M</th>
              <th className="num">Ratio</th>
              <th>Type</th>
            </tr>
          )}
        </thead>
        <tbody>
          <LiveIndexRows rows={mainRows} variant={mainVariant} />
        </tbody>
      </table>

      {vixRows.length > 0 && (
        <section className="card amber" aria-label="Volatility">
          <h2>Volatility — VIX is a regime, not a trend</h2>
          <p>
            The VIX measures expected volatility, not a price going up. A high VIX is fear,
            not strength — so it carries no Technical or Momentum score and never leads the
            shared sort above. Read it as a regime: Calm, Normal, Elevated, High, Extreme.
          </p>
          <table>
            <thead>
              <tr>
                <th>Index</th>
                <th className="num">Level</th>
                <th className="num">Day</th>
                <th className="num">Regime</th>
                <th className="num">VIX3M</th>
                <th className="num">Ratio</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              <LiveIndexRows rows={vixRows} variant="volatility" />
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
