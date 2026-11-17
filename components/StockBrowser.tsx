'use client'

import { useEffect, useMemo, useState } from 'react'
import { RESULTS, TICKER_SYMBOLS, getTicker, type TickerData } from '@/lib/data'
import { Card, StockRow, StockTableHead } from '@/components/ui'

type Verdict = TickerData['verdict']
type SortKey = 'score' | 'upside' | 'price' | 'fv' | 'ticker'
type BetaBand = 'All' | 'lt1' | '1-1.5' | 'gt1.5'
type PeBand = 'All' | 'lt15' | '15-25' | '25-40' | 'gt40'
type DebtFcfBand = 'All' | 'lt1' | '1-3' | 'gt3'
type McapBand = 'All' | 'gt100b' | '10-100b' | 'lt10b'
type RelVolBand = 'All' | 'lt0.8' | '0.8-1.5' | '1.5-2' | 'gt2'
type IndexFilter = 'All' | 'SP500' | 'NASDAQ100'

const BETA_BANDS: BetaBand[] = ['lt1', '1-1.5', 'gt1.5']
const PE_BANDS: PeBand[] = ['lt15', '15-25', '25-40', 'gt40']
const DEBTFCF_BANDS: DebtFcfBand[] = ['lt1', '1-3', 'gt3']
const MCAP_BANDS: McapBand[] = ['gt100b', '10-100b', 'lt10b']
const RELVOL_BANDS: RelVolBand[] = ['lt0.8', '0.8-1.5', '1.5-2', 'gt2']
const INDEX_VALUES: IndexFilter[] = ['SP500', 'NASDAQ100']

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
  beta: BetaBand
  pe: PeBand
  debtfcf: DebtFcfBand
  mcap: McapBand
  relvol: RelVolBand
  index: IndexFilter
}

const DEFAULT_FILTERS: Filters = {
  verdict: 'All',
  sector: 'All',
  sort: 'score',
  q: '',
  underfv: false,
  beta: 'All',
  pe: 'All',
  debtfcf: 'All',
  mcap: 'All',
  relvol: 'All',
  index: 'All',
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

/** Six-filter band matchers. Every band is null-safe: a null source value
    never matches a band (it is excluded when a band is selected) and is
    shown normally when no band is selected. Band edges are inclusive on
    the upper end, matching the verified counts below. */
function betaOf(r: Row): number | null {
  return r.pillars.valuation.detail.dcf_capm_crosscheck?.beta_raw ?? null
}
function peOf(r: Row): number | null {
  return r.pillars.valuation.detail.legs?.pegy?.pe_used ?? null
}
function matchesBeta(r: Row, band: BetaBand): boolean {
  const v = betaOf(r)
  if (v === null) return false
  if (band === 'lt1') return v < 1
  if (band === '1-1.5') return v >= 1 && v <= 1.5
  return v > 1.5
}
function matchesPe(r: Row, band: PeBand): boolean {
  const v = peOf(r)
  if (v === null) return false
  if (band === 'lt15') return v < 15
  if (band === '15-25') return v >= 15 && v <= 25
  if (band === '25-40') return v > 25 && v <= 40
  return v > 40
}
function matchesDebtFcf(r: Row, band: DebtFcfBand): boolean {
  const v = r.debt_fcf
  if (v === null) return false
  if (band === 'lt1') return v < 1
  if (band === '1-3') return v >= 1 && v <= 3
  return v > 3
}
function matchesMcap(r: Row, band: McapBand): boolean {
  const v = r.market_cap
  if (v === null) return false
  if (band === 'gt100b') return v > 100_000_000_000
  if (band === '10-100b') return v >= 10_000_000_000 && v <= 100_000_000_000
  return v < 10_000_000_000
}
function matchesRelVol(r: Row, band: RelVolBand): boolean {
  const v = r.rel_vol
  if (v === null) return false
  if (band === 'lt0.8') return v < 0.8
  if (band === '0.8-1.5') return v >= 0.8 && v <= 1.5
  if (band === '1.5-2') return v > 1.5 && v <= 2
  return v > 2
}

/** Live band counts, computed from the same rows the table renders. */
const BETA_COUNTS: Record<BetaBand, number> = { All: ALL_ROWS.length, lt1: 0, '1-1.5': 0, 'gt1.5': 0 }
const PE_COUNTS: Record<PeBand, number> = { All: ALL_ROWS.length, lt15: 0, '15-25': 0, '25-40': 0, gt40: 0 }
const DEBTFCF_COUNTS: Record<DebtFcfBand, number> = { All: ALL_ROWS.length, lt1: 0, '1-3': 0, gt3: 0 }
const MCAP_COUNTS: Record<McapBand, number> = { All: ALL_ROWS.length, gt100b: 0, '10-100b': 0, lt10b: 0 }
const RELVOL_COUNTS: Record<RelVolBand, number> = { All: ALL_ROWS.length, 'lt0.8': 0, '0.8-1.5': 0, '1.5-2': 0, gt2: 0 }
const INDEX_COUNTS: Record<IndexFilter, number> = { All: ALL_ROWS.length, SP500: 0, NASDAQ100: 0 }
for (const r of ALL_ROWS) {
  for (const b of BETA_BANDS) if (matchesBeta(r, b)) BETA_COUNTS[b] += 1
  for (const b of PE_BANDS) if (matchesPe(r, b)) PE_COUNTS[b] += 1
  for (const b of DEBTFCF_BANDS) if (matchesDebtFcf(r, b)) DEBTFCF_COUNTS[b] += 1
  for (const b of MCAP_BANDS) if (matchesMcap(r, b)) MCAP_COUNTS[b] += 1
  for (const b of RELVOL_BANDS) if (matchesRelVol(r, b)) RELVOL_COUNTS[b] += 1
  for (const idx of INDEX_VALUES) if ((r.indexes ?? []).includes(idx)) INDEX_COUNTS[idx] += 1
}

const BETA_LABELS: Record<BetaBand, string> = {
  All: 'All betas',
  lt1: '<1.0',
  '1-1.5': '1.0–1.5',
  'gt1.5': '>1.5',
}
const PE_LABELS: Record<PeBand, string> = {
  All: 'All P/E',
  lt15: '<15',
  '15-25': '15–25',
  '25-40': '25–40',
  gt40: '>40',
}
const DEBTFCF_LABELS: Record<DebtFcfBand, string> = {
  All: 'All debt/FCF',
  lt1: '<1×',
  '1-3': '1–3×',
  gt3: '>3×',
}
const MCAP_LABELS: Record<McapBand, string> = {
  All: 'All market caps',
  gt100b: '>$100B',
  '10-100b': '$10–100B',
  lt10b: '<$10B',
}
const RELVOL_LABELS: Record<RelVolBand, string> = {
  All: 'All rel. volume',
  'lt0.8': '<0.8',
  '0.8-1.5': '0.8–1.5',
  '1.5-2': '1.5–2',
  gt2: '>2',
}
const INDEX_LABELS: Record<IndexFilter, string> = {
  All: 'All indexes',
  SP500: 'S&P 500',
  NASDAQ100: 'Nasdaq-100',
}

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
 * Six-filter params: beta ∈ {lt1, 1-1.5, gt1.5}, pe ∈ {lt15, 15-25,
 * 25-40, gt40}, debtfcf ∈ {lt1, 1-3, gt3}, mcap ∈ {gt100b, 10-100b,
 * lt10b}, relvol ∈ {lt0.8, 0.8-1.5, 1.5-2, gt2}, index ∈ {SP500,
 * NASDAQ100}. Anything unknown is ignored.
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
  const beta = params.get('beta')
  if (beta && (BETA_BANDS as string[]).includes(beta)) f.beta = beta as BetaBand
  const pe = params.get('pe')
  if (pe && (PE_BANDS as string[]).includes(pe)) f.pe = pe as PeBand
  const debtfcf = params.get('debtfcf')
  if (debtfcf && (DEBTFCF_BANDS as string[]).includes(debtfcf)) f.debtfcf = debtfcf as DebtFcfBand
  const mcap = params.get('mcap')
  if (mcap && (MCAP_BANDS as string[]).includes(mcap)) f.mcap = mcap as McapBand
  const relvol = params.get('relvol')
  if (relvol && (RELVOL_BANDS as string[]).includes(relvol)) f.relvol = relvol as RelVolBand
  const index = params.get('index')
  if (index && (INDEX_VALUES as string[]).includes(index)) f.index = index as IndexFilter
  return f
}

function isDefault(f: Filters): boolean {
  return (
    f.verdict === 'All' &&
    f.sector === 'All' &&
    f.sort === 'score' &&
    f.q === '' &&
    !f.underfv &&
    f.beta === 'All' &&
    f.pe === 'All' &&
    f.debtfcf === 'All' &&
    f.mcap === 'All' &&
    f.relvol === 'All' &&
    f.index === 'All'
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
    if (filters.beta !== 'All') params.set('beta', filters.beta)
    if (filters.pe !== 'All') params.set('pe', filters.pe)
    if (filters.debtfcf !== 'All') params.set('debtfcf', filters.debtfcf)
    if (filters.mcap !== 'All') params.set('mcap', filters.mcap)
    if (filters.relvol !== 'All') params.set('relvol', filters.relvol)
    if (filters.index !== 'All') params.set('index', filters.index)
    const qs = params.toString()
    window.history.replaceState(null, '', qs ? `/stocks?${qs}` : '/stocks')
  }, [filters, hydrated])

  const filtered = useMemo(() => {
    const query = filters.q.trim().toLowerCase()
    const rows = ALL_ROWS.filter((r) => {
      if (filters.verdict !== 'All' && r.verdict !== filters.verdict) return false
      if (filters.sector !== 'All' && r.sector !== filters.sector) return false
      if (filters.underfv && !(r.price < r.triangulated_fv)) return false
      if (filters.beta !== 'All' && !matchesBeta(r, filters.beta)) return false
      if (filters.pe !== 'All' && !matchesPe(r, filters.pe)) return false
      if (filters.debtfcf !== 'All' && !matchesDebtFcf(r, filters.debtfcf)) return false
      if (filters.mcap !== 'All' && !matchesMcap(r, filters.mcap)) return false
      if (filters.relvol !== 'All' && !matchesRelVol(r, filters.relvol)) return false
      if (filters.index !== 'All' && !(r.indexes ?? []).includes(filters.index)) return false
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

      {/* More filters — a second row, kept clear of the verdict pills. */}
      <div className="filter-row" role="group" aria-label="More filters">
        <select
          className="filter-select"
          aria-label="Filter by beta"
          value={filters.beta}
          onChange={(e) => setFilters({ ...filters, beta: e.target.value as BetaBand })}
        >
          {(['All', ...BETA_BANDS] as const).map((b) => (
            <option key={b} value={b}>
              Beta: {BETA_LABELS[b]} ({BETA_COUNTS[b]})
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          aria-label="Filter by trailing P/E"
          value={filters.pe}
          onChange={(e) => setFilters({ ...filters, pe: e.target.value as PeBand })}
        >
          {(['All', ...PE_BANDS] as const).map((b) => (
            <option key={b} value={b}>
              P/E: {PE_LABELS[b]} ({PE_COUNTS[b]})
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          aria-label="Filter by debt to free cash flow"
          value={filters.debtfcf}
          onChange={(e) => setFilters({ ...filters, debtfcf: e.target.value as DebtFcfBand })}
        >
          {(['All', ...DEBTFCF_BANDS] as const).map((b) => (
            <option key={b} value={b}>
              Debt/FCF: {DEBTFCF_LABELS[b]} ({DEBTFCF_COUNTS[b]})
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          aria-label="Filter by market cap"
          value={filters.mcap}
          onChange={(e) => setFilters({ ...filters, mcap: e.target.value as McapBand })}
        >
          {(['All', ...MCAP_BANDS] as const).map((b) => (
            <option key={b} value={b}>
              Market cap: {MCAP_LABELS[b]} ({MCAP_COUNTS[b]})
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          aria-label="Filter by relative volume"
          value={filters.relvol}
          onChange={(e) => setFilters({ ...filters, relvol: e.target.value as RelVolBand })}
        >
          {(['All', ...RELVOL_BANDS] as const).map((b) => (
            <option key={b} value={b}>
              Rel. volume: {RELVOL_LABELS[b]} ({RELVOL_COUNTS[b]})
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          aria-label="Filter by index membership"
          value={filters.index}
          onChange={(e) => setFilters({ ...filters, index: e.target.value as IndexFilter })}
        >
          {(['All', ...INDEX_VALUES] as const).map((b) => (
            <option key={b} value={b}>
              Index: {INDEX_LABELS[b]} ({INDEX_COUNTS[b]})
            </option>
          ))}
        </select>
      </div>

      <p className="footnote">
        Beta as of Nov 15–16, 2026 (Yahoo) · Debt/FCF from latest annual filings · Relative
        volume as of the 2026-11-16 close · Index lists as of 2026-11-16, refreshed
        quarterly. Names with no debt/FCF figure (24) are excluded when a debt/FCF
        band is selected.
      </p>

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
        Prices are the {RESULTS.price_date} close. The scored universe expands as more names are run
        through the engine; no score is ever guessed for an unscored ticker.
      </p>
    </Card>
  )
}
