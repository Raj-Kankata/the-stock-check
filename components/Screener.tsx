'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { PublicRow, Verdict } from '@/lib/public-types'
import { Card, VerdictBadge, scoreSpan, signedPctSpan } from '@/components/ui'
import { LiveStatusLine } from '@/components/LivePrice'
import { bigUsd, money, pct } from '@/lib/format'
import { hasLiveQuotes, liveCloseFor, useLiveQuotes } from '@/lib/tradingview'

type SortKey = 'score' | 'upside' | 'price' | 'fv' | 'ticker'
type McapBand = 'All' | 'gt100b' | '10-100b' | 'lt10b'

const VERDICTS: Verdict[] = ['Growth', 'Value', 'Watch', 'Avoid']
const SCORE_MINS: (number | 'All')[] = ['All', 50, 60, 70, 80]
const UPSIDE_MINS: (number | 'All')[] = ['All', 0, 0.25, 0.5]
const QUALITY_MINS: (number | 'All')[] = ['All', 40, 55, 60, 70]
const MCAP_BANDS: McapBand[] = ['gt100b', '10-100b', 'lt10b']
const SORTS: SortKey[] = ['score', 'upside', 'price', 'fv', 'ticker']
const SORT_LABELS: Record<SortKey, string> = {
  score: 'Score (high to low)',
  upside: 'Upside (high to low)',
  price: 'Price (high to low)',
  fv: 'Fair value (high to low)',
  ticker: 'Ticker (A to Z)',
}
const MCAP_LABELS: Record<McapBand, string> = {
  All: 'All market caps',
  gt100b: '>$100B',
  '10-100b': '$10–100B',
  lt10b: '<$10B',
}

/** Rows arrive as props from the /screener page at build time — display
    values only (symbol, name, sector, price, fair value, verdict,
    overall score, Quality pillar score, market cap). This component
    never imports the full results data. */
type Row = PublicRow & { upside: number }

interface Filters {
  verdicts: Verdict[]
  sector: string
  scoreMin: number | 'All'
  upsideMin: number | 'All'
  qualityMin: number | 'All'
  mcap: McapBand
  sort: SortKey
  q: string
}

const DEFAULT_FILTERS: Filters = {
  verdicts: [...VERDICTS],
  sector: 'All',
  scoreMin: 'All',
  upsideMin: 'All',
  qualityMin: 'All',
  mcap: 'All',
  sort: 'score',
  q: '',
}

function matchesMcap(r: Row, band: McapBand): boolean {
  const v = r.market_cap
  if (v === null) return false
  if (band === 'gt100b') return v > 100_000_000_000
  if (band === '10-100b') return v >= 10_000_000_000 && v <= 100_000_000_000
  return v < 10_000_000_000
}

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
      sorted.sort((a, b) => b.fv - a.fv || bySymbol(a, b))
      break
    case 'ticker':
      sorted.sort(bySymbol)
      break
  }
  return sorted
}

function isDefault(f: Filters): boolean {
  return (
    f.verdicts.length === VERDICTS.length &&
    f.sector === 'All' &&
    f.scoreMin === 'All' &&
    f.upsideMin === 'All' &&
    f.qualityMin === 'All' &&
    f.mcap === 'All' &&
    f.sort === 'score' &&
    f.q === ''
  )
}

function csvCell(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export default function Screener({ rows, priceDate }: { rows: PublicRow[]; priceDate: string }) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

  // All scored rows, with the baked upside attached. Counts are
  // computed from these rows (never from the full results data — this
  // component never sees it).
  const allRows: Row[] = useMemo(
    () =>
      rows.map((r) => ({
        ...r,
        upside: r.price > 0 ? (r.fv - r.price) / r.price : 0,
      })),
    [rows],
  )

  const stats = useMemo(() => {
    const verdictCounts: Record<Verdict, number> = { Growth: 0, Value: 0, Watch: 0, Avoid: 0 }
    for (const r of allRows) verdictCounts[r.verdict] += 1
    const mcapCounts: Record<McapBand, number> = { All: allRows.length, gt100b: 0, '10-100b': 0, lt10b: 0 }
    for (const r of allRows) {
      for (const b of MCAP_BANDS) if (matchesMcap(r, b)) mcapCounts[b] += 1
    }
    /** Sectors with live counts, most names first. */
    const sectorMap = new Map<string, number>()
    for (const r of allRows) sectorMap.set(r.sector, (sectorMap.get(r.sector) ?? 0) + 1)
    const sectorCounts = [...sectorMap.entries()]
      .map(([sector, count]) => ({ sector, count }))
      .sort((a, b) => b.count - a.count || a.sector.localeCompare(b.sector))
    return { verdictCounts, mcapCounts, sectorCounts }
  }, [allRows])

  // Live prices from the shared store (one scan per poll per page —
  // see lib/tradingview.ts). While live, the Price and Upside cells
  // and the upside/price sorts run on the live price; scores, fair
  // values, verdicts and Quality stay baked.
  const live = useLiveQuotes()
  const liveNow = hasLiveQuotes(live)
  const livePrice = (symbol: string): number | null =>
    liveNow ? liveCloseFor(live, symbol) : null
  const effPrice = (r: Row): number => livePrice(r.symbol) ?? r.price
  const effUpside = (r: Row): number =>
    effPrice(r) > 0 ? (r.fv - effPrice(r)) / effPrice(r) : 0

  const filtered = useMemo(() => {
    const query = filters.q.trim().toLowerCase()
    const filteredRows = allRows.filter((r) => {
      if (!filters.verdicts.includes(r.verdict)) return false
      if (filters.sector !== 'All' && r.sector !== filters.sector) return false
      if (filters.scoreMin !== 'All' && r.overall_score < filters.scoreMin) return false
      if (filters.upsideMin !== 'All' && effUpside(r) < filters.upsideMin) return false
      if (filters.qualityMin !== 'All' && r.quality < filters.qualityMin) return false
      if (filters.mcap !== 'All' && !matchesMcap(r, filters.mcap)) return false
      if (query) {
        const symbolMatch = r.symbol.toLowerCase().startsWith(query)
        const nameMatch = (r.name ?? '').toLowerCase().includes(query)
        if (!symbolMatch && !nameMatch) return false
      }
      return true
    })
    // Sort on the effective (live when live) price and upside, so the
    // upside/price sorts track the live market, not the baked close.
    const display = filteredRows.map((r) => ({
      ...r,
      price: effPrice(r),
      upside: effUpside(r),
    }))
    return sortRows(display, filters.sort)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, liveNow, live.quotes])

  const toggleVerdict = (v: Verdict) => {
    setFilters((f) => {
      const next = f.verdicts.includes(v)
        ? f.verdicts.filter((x) => x !== v)
        : [...f.verdicts, v]
      // Never allow an empty verdict set — that would show zero rows
      // with no obvious cause. Dropping the last one restores all.
      return { ...f, verdicts: next.length === 0 ? [...VERDICTS] : next }
    })
  }

  const clearFilters = () => setFilters(DEFAULT_FILTERS)

  const downloadCsv = () => {
    const header = [
      'Symbol',
      'Name',
      'Verdict',
      'Overall score',
      'Price',
      'Fair value',
      'Upside',
      'Quality',
      'Sector',
      'Market cap',
    ]
    const lines = filtered.map((r) =>
      [
        r.symbol,
        r.name,
        r.verdict,
        r.overall_score.toFixed(1),
        r.price.toFixed(2),
        r.fv.toFixed(2),
        pct(r.upside, 1),
        r.quality.toFixed(1),
        r.sector,
        r.market_cap === null ? '' : Math.round(r.market_cap),
      ]
        .map(csvCell)
        .join(','),
    )
    const blob = new Blob([[header.map(csvCell).join(','), ...lines].join('\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `screener-${priceDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card title="Screen the scored universe">
      <div className="filter-row" role="group" aria-label="Filter by verdict">
        {VERDICTS.map((v) => (
          <button
            key={v}
            type="button"
            className={`filter-pill${filters.verdicts.includes(v) ? ' active' : ''}`}
            aria-pressed={filters.verdicts.includes(v)}
            onClick={() => toggleVerdict(v)}
          >
            {v} ({stats.verdictCounts[v]})
          </button>
        ))}
        {!isDefault(filters) && (
          <button type="button" className="filter-pill" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      <div className="filter-row" role="group" aria-label="Minimum overall score">
        {SCORE_MINS.map((m) => (
          <button
            key={String(m)}
            type="button"
            className={`filter-pill${filters.scoreMin === m ? ' active' : ''}`}
            aria-pressed={filters.scoreMin === m}
            onClick={() => setFilters({ ...filters, scoreMin: m })}
          >
            {m === 'All' ? 'Any score' : `Score ≥ ${m}`}
          </button>
        ))}
      </div>

      <div className="filter-row" role="group" aria-label="Minimum upside vs fair value">
        {UPSIDE_MINS.map((m) => (
          <button
            key={String(m)}
            type="button"
            className={`filter-pill${filters.upsideMin === m ? ' active' : ''}`}
            aria-pressed={filters.upsideMin === m}
            onClick={() => setFilters({ ...filters, upsideMin: m })}
          >
            {m === 'All' ? 'Any upside' : `Upside ≥ +${Math.round(m * 100)}%`}
          </button>
        ))}
      </div>

      <div className="filter-row" role="group" aria-label="Minimum Quality score">
        {QUALITY_MINS.map((m) => (
          <button
            key={String(m)}
            type="button"
            className={`filter-pill${filters.qualityMin === m ? ' active' : ''}`}
            aria-pressed={filters.qualityMin === m}
            onClick={() => setFilters({ ...filters, qualityMin: m })}
          >
            {m === 'All' ? 'Any Quality' : `Quality ≥ ${m}`}
          </button>
        ))}
      </div>

      <div className="filter-row">
        <select
          className="filter-select"
          aria-label="Filter by sector"
          value={filters.sector}
          onChange={(e) => setFilters({ ...filters, sector: e.target.value })}
        >
          <option value="All">All sectors ({allRows.length})</option>
          {stats.sectorCounts.map(({ sector, count }) => (
            <option key={sector} value={sector}>
              {sector} ({count})
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
              Market cap: {MCAP_LABELS[b]} ({stats.mcapCounts[b]})
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
      </div>

      <p className="filter-count">
        Showing {filtered.length} of {allRows.length} names
        <button
          type="button"
          className="filter-pill"
          onClick={downloadCsv}
          disabled={filtered.length === 0}
          style={{ marginLeft: '0.75rem' }}
        >
          Download CSV
        </button>
      </p>

      <LiveStatusLine priceDateLabel={priceDate} />

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
            <tr>
              <th>Stock</th>
              <th>Verdict</th>
              <th className="num">Score</th>
              <th className="num">Price</th>
              <th className="num">Fair value</th>
              <th className="num">Upside</th>
              <th className="num">Quality</th>
              <th>Sector</th>
              <th className="num">Market cap</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => (
              <tr key={t.symbol}>
                <td>
                  <Link href={`/stock/${t.symbol}`}>
                    <strong>{t.symbol}</strong>
                  </Link>
                  <br />
                  <span className="footnote">{t.name}</span>
                </td>
                <td>
                  <VerdictBadge verdict={t.verdict} />
                </td>
                <td className="num">{scoreSpan(t.overall_score)}</td>
                <td className="num">{money(t.price)}</td>
                <td className="num">{money(t.fv)}</td>
                <td className="num">{signedPctSpan(t.upside)}</td>
                <td className="num">{scoreSpan(t.quality)}</td>
                <td>{t.sector}</td>
                <td className="num">{bigUsd(t.market_cap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="footnote">
        Scores, verdicts, fair values and Quality are as of the {priceDate} close, unless a
        price is marked LIVE during market hours (quotes delayed ~15 min, TradingView).
        Filters use the Methodology wording: overall score 0–100, Quality is the Quality
        pillar score, upside is (fair value − price) / price. A name with no market-cap
        figure is excluded when a market-cap band is selected.
      </p>
    </Card>
  )
}
