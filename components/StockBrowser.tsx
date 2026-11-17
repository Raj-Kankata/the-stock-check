'use client'

import { useEffect, useMemo, useState } from 'react'
import { TICKER_SYMBOLS, getTicker, type TickerData } from '@/lib/data'
import { PRICE_DATE } from '@/lib/site'
import { Card, StockRow, StockTableHead } from '@/components/ui'

type Verdict = TickerData['verdict']
type SortKey = 'score' | 'upside' | 'price' | 'fv' | 'ticker'

const VERDICTS: Verdict[] = ['Growth', 'Value', 'Watch', 'Avoid']
const SORTS: SortKey[] = ['score', 'upside', 'price', 'fv', 'ticker']
const SORT_LABELS: Record<SortKey, string> = {
  score: 'Score (high to low)',
  upside: 'Upside (high to low)',
  price: 'Price (high to low)',
  fv: 'Fair value (high to low)',
  ticker: 'Ticker (A to Z)',
}

interface Row extends TickerData {
  symbol: string
  upside: number
}

interface Filters {
  verdict: Verdict | 'All'
  sector: string
  sort: SortKey
  q: string
  underfv: boolean
}

const DEFAULT_FILTERS: Filters = {
  verdict: 'All',
  sector: 'All',
  sort: 'score',
  q: '',
  underfv: false,
}

/**
 * All 227 scored rows, built once from the same data the header search
 * ships to the client — no new bundle concern.
 */
const ALL_ROWS: Row[] = TICKER_SYMBOLS.map((symbol) => {
  const t = getTicker(symbol)
  if (!t) throw new Error(`Missing ticker data for ${symbol}`)
  return {
    ...t,
    symbol,
    upside: t.price > 0 ? (t.triangulated_fv - t.price) / t.price : 0,
  }
})

const VERDICT_COUNTS: Record<Verdict, number> = {
  Growth: 0,
  Value: 0,
  Watch: 0,
  Avoid: 0,
}
for (const r of ALL_ROWS) VERDICT_COUNTS[r.verdict] += 1

const UNDERFV_COUNT = ALL_ROWS.filter((r) => r.price < r.triangulated_fv).length

/** Sectors with live counts, most names first. */
const SECTOR_COUNTS: { sector: string; count: number }[] = (() => {
  const counts = new Map<string, number>()
  for (const r of ALL_ROWS) counts.set(r.sector, (counts.get(r.sector) ?? 0) + 1)
  return [...counts.entries()]
    .map(([sector, count]) => ({ sector, count }))
    .sort((a, b) => b.count - a.count || a.sector.localeCompare(b.sector))
})()
const SECTORS = new Set(SECTOR_COUNTS.map((s) => s.sector))

function sortRows(rows: Row[], sort: SortKey): Row[] {
  const bySymbol = (a: Row, b: Row) => a.symbol.localeCompare(b.symbol)
  const sorted = [...rows]
  switch (sort) {
    case 'score':
      sorted.sort((a, b) => b.overall_score - a.overall_score || bySymbol(a, b))
      break
    case 'upside':
      sorted.sort((a, b) => b.upside - a.upside || bySymbol(a, b))
      break
    case 'price':
      sorted.sort((a, b) => b.price - a.price || bySymbol(a, b))
      break
    case 'fv':
      sorted.sort((a, b) => b.triangulated_fv - a.triangulated_fv || bySymbol(a, b))
      break
    case 'ticker':
      sorted.sort(bySymbol)
      break
  }
  return sorted
}

/**
 * Query-param contract (frozen): verdict ∈ {Growth, Value, Watch, Avoid}
 * (exact case), sector = exact sector string, sort ∈ {score, upside,
 * price, fv, ticker}, q = text, underfv=1. Anything unknown is ignored.
 */
function parseParams(search: string): Filters {
  const params = new URLSearchParams(search)
  const f: Filters = { ...DEFAULT_FILTERS }
  const verdict = params.get('verdict')
  if (verdict && (VERDICTS as string[]).includes(verdict)) f.verdict = verdict as Verdict
  const sector = params.get('sector')
  if (sector && SECTORS.has(sector)) f.sector = sector
  const sort = params.get('sort')
  if (sort && (SORTS as string[]).includes(sort)) f.sort = sort as SortKey
  const q = params.get('q')
  if (q) f.q = q
  if (params.get('underfv') === '1') f.underfv = true
  return f
}

function isDefault(f: Filters): boolean {
  return (
    f.verdict === 'All' &&
    f.sector === 'All' &&
    f.sort === 'score' &&
    f.q === '' &&
    !f.underfv
  )
}

export default function StockBrowser() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [hydrated, setHydrated] = useState(false)

  // On mount only: read the query string and apply it as initial state.
  // The search-params hook is deliberately not used — the prerendered
  // HTML must show all 227 rows in default sort order, matching the
  // first-paint state exactly.
  useEffect(() => {
    setFilters(parseParams(window.location.search))
    setHydrated(true)
  }, [])

  // Keep the URL shareable: reflect every filter change, without a
  // navigation or scroll reset. Skipped until the mount parse has run,
  // so the initial query string is never wiped by the defaults.
  useEffect(() => {
    if (!hydrated) return
    const params = new URLSearchParams()
    if (filters.verdict !== 'All') params.set('verdict', filters.verdict)
    if (filters.sector !== 'All') params.set('sector', filters.sector)
    if (filters.sort !== 'score') params.set('sort', filters.sort)
    if (filters.q.trim() !== '') params.set('q', filters.q)
    if (filters.underfv) params.set('underfv', '1')
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `/stocks?${qs}` : '/stocks')
  }, [filters, hydrated])

  const filtered = useMemo(() => {
    const query = filters.q.trim().toLowerCase()
    const rows = ALL_ROWS.filter((r) => {
      if (filters.verdict !== 'All' && r.verdict !== filters.verdict) return false
      if (filters.sector !== 'All' && r.sector !== filters.sector) return false
      if (filters.underfv && !(r.price < r.triangulated_fv)) return false
      if (query) {
        const symbolMatch = r.symbol.toLowerCase().startsWith(query)
        const nameMatch = (r.name ?? '').toLowerCase().includes(query)
        if (!symbolMatch && !nameMatch) return false
      }
      return true
    })
    return sortRows(rows, filters.sort)
  }, [filters])

  const clearFilters = () => setFilters(DEFAULT_FILTERS)

  return (
    <Card title="All scored tickers">
      <div className="filter-row" role="group" aria-label="Filter by verdict">
        {(['All', ...VERDICTS] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={`filter-pill${filters.verdict === v ? ' active' : ''}`}
            aria-pressed={filters.verdict === v}
            onClick={() => setFilters({ ...filters, verdict: v })}
          >
            {v === 'All' ? `All (${ALL_ROWS.length})` : `${v} (${VERDICT_COUNTS[v]})`}
          </button>
        ))}
        <button
          type="button"
          className={`filter-pill${filters.underfv ? ' active' : ''}`}
          aria-pressed={filters.underfv}
          onClick={() => setFilters({ ...filters, underfv: !filters.underfv })}
        >
          Under fair value only ({UNDERFV_COUNT})
        </button>
      </div>

      <div className="filter-row">
        <select
          className="filter-select"
          aria-label="Filter by sector"
          value={filters.sector}
          onChange={(e) => setFilters({ ...filters, sector: e.target.value })}
        >
          <option value="All">All sectors ({ALL_ROWS.length})</option>
          {SECTOR_COUNTS.map(({ sector, count }) => (
            <option key={sector} value={sector}>
              {sector} ({count})
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          aria-label="Sort"
          value={filters.sort}
          onChange={(e) => setFilters({ ...filters, sort: e.target.value as SortKey })}
        >
          {SORTS.map((s) => (
            <option key={s} value={s}>
              {SORT_LABELS[s]}
            </option>
          ))}
        </select>
        <input
          className="filter-input"
          type="text"
          placeholder="Filter by ticker or company name"
          aria-label="Filter by ticker or company name"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          autoComplete="off"
        />
        {!isDefault(filters) && (
          <button type="button" className="filter-pill" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      <p className="filter-count">
        Showing {filtered.length} of {ALL_ROWS.length} names
      </p>

      {filtered.length === 0 ? (
        <p>
          No names match —{' '}
          <button type="button" className="btn" onClick={clearFilters}>
            Clear filters
          </button>
        </p>
      ) : (
        <table>
          <thead>
            <StockTableHead />
          </thead>
          <tbody>
            {filtered.map((t) => (
              <StockRow key={t.symbol} t={t} />
            ))}
          </tbody>
        </table>
      )}

      <p className="footnote">
        {ALL_ROWS.length} names are scored so far — use the search above to find any of them.
        Prices are the {PRICE_DATE} close. The scored universe expands as more names are run
        through the engine; no score is ever guessed for an unscored ticker.
      </p>
    </Card>
  )
}
