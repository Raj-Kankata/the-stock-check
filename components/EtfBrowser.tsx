// /etfs board — client filters over the baked ETF rows.
// Filters: type (equity / bond / commodity / leveraged), category,
// momentum read. Sort: momentum score, technical score, or name.
// Leveraged funds NEVER sit in the shared sort: with no type filter
// they render in a separate flagged section below the main table,
// compare-only-with-leveraged. Only the Leveraged filter itself puts
// them in the main table.

'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import type { PublicEtfRow } from '@/lib/public-types'
import type { EtfType } from '@/components/ui'
import { EtfLiveStatusLine, LiveEtfRows } from '@/components/EtfLive'

type MomentumRead = 'Building' | 'Flat' | 'Fading'
type SortKey = 'momentum' | 'technical' | 'name'

const TYPE_FILTERS: { key: EtfType | 'all'; label: string }[] = [
  { key: 'all', label: 'All types' },
  { key: 'equity', label: 'Equity' },
  { key: 'bond', label: 'Bond' },
  { key: 'commodity', label: 'Commodity' },
  { key: 'leveraged', label: 'Leveraged' },
]

export default function EtfBrowser({
  rows,
  priceDate,
}: {
  rows: PublicEtfRow[]
  priceDate: string
}) {
  const [typeFilter, setTypeFilter] = useState<EtfType | 'all'>('all')
  const [category, setCategory] = useState<string>('all')
  const [momentum, setMomentum] = useState<MomentumRead | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('momentum')

  const categories = useMemo(
    () => [...new Set(rows.map((r) => r.category))].sort(),
    [rows],
  )

  const filtered = useMemo(() => {
    let out = rows
    if (typeFilter !== 'all') out = out.filter((r) => r.type === typeFilter)
    if (category !== 'all') out = out.filter((r) => r.category === category)
    if (momentum !== 'all') out = out.filter((r) => r.momentum_read === momentum)
    const sorted = [...out]
    if (sort === 'momentum') sorted.sort((a, b) => b.momentum_score - a.momentum_score)
    else if (sort === 'technical') sorted.sort((a, b) => b.technical_score - a.technical_score)
    else sorted.sort((a, b) => a.symbol.localeCompare(b.symbol))
    return sorted
  }, [rows, typeFilter, category, momentum, sort])

  // Leveraged funds leave the shared sort: with no type filter they
  // are pulled out of the main table into the flagged section below.
  const showLeveragedSeparate = typeFilter === 'all'
  const leveragedRows = useMemo(
    () =>
      showLeveragedSeparate
        ? filtered.filter((r) => r.type === 'leveraged')
        : [],
    [filtered, showLeveragedSeparate],
  )
  const mainRows = useMemo(
    () =>
      showLeveragedSeparate
        ? filtered.filter((r) => r.type !== 'leveraged')
        : filtered,
    [filtered, showLeveragedSeparate],
  )

  return (
    <div>
      <EtfLiveStatusLine priceDateLabel={priceDate} />
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
          Category{' '}
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>{' '}
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
        Showing {mainRows.length + leveragedRows.length} of {rows.length} ETFs
        {typeFilter !== 'all' ? ` · type: ${typeFilter}` : ''}
        {category !== 'all' ? ` · ${category}` : ''}
        {momentum !== 'all' ? ` · momentum: ${momentum}` : ''} · prices as of the{' '}
        {priceDate} close unless marked LIVE.
      </p>

      <table>
        <thead>
          <tr>
            <th>ETF</th>
            <th className="num">Price</th>
            <th className="num">Day</th>
            <th className="num">Technical</th>
            <th className="num">Momentum</th>
            <th>Type</th>
            <th>Category</th>
            <th>Reads</th>
          </tr>
        </thead>
        <tbody>
          <LiveEtfRows rows={mainRows} />
        </tbody>
      </table>

      {leveragedRows.length > 0 && (
        <section className="card amber" aria-label="Leveraged funds">
          <h2>Leveraged funds — compare only with leveraged</h2>
          <p>
            These funds reset their leverage daily, so a −50% momentum read means something
            very different here than for an unleveraged fund. They never lead the shared
            sort above; compare them only with each other.
          </p>
          <table>
            <thead>
              <tr>
                <th>ETF</th>
                <th className="num">Price</th>
                <th className="num">Day</th>
                <th className="num">Technical</th>
                <th className="num">Momentum</th>
                <th>Type</th>
                <th>Category</th>
                <th>Reads</th>
              </tr>
            </thead>
            <tbody>
              <LiveEtfRows rows={leveragedRows} />
            </tbody>
          </table>
        </section>
      )}
    </div>
  )
}
