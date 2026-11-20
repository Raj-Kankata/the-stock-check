'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { money } from '@/lib/format'

/** One disclosed congressional trade, projected server-side from
    lib/data/congress.json into this browser-safe shape. This
    component never imports the store itself. Prices are Bargo's
    estimates (price at the trade, and a recent price) — labelled as
    such in the table footnote. */
export interface CongressTradeRow {
  disclosed: string
  disclosedLabel: string
  member: string
  memberSlug: string
  party: string | null
  chamber: string
  stateLabel: string
  ticker: string
  hasCard: boolean
  type: string
  typeLabel: string
  amountRange: string
  tradeDateLabel: string
  lagDays: number | null
  estPrice: number | null
  recentPrice: number | null
}

type ChamberFilter = 'All' | 'house' | 'senate'
type PartyFilter = 'All' | 'Democrat' | 'Republican' | 'None'
type TypeFilter = 'All' | 'purchase' | 'sale'

interface Filters {
  chamber: ChamberFilter
  party: PartyFilter
  type: TypeFilter
  q: string
}

const DEFAULT_FILTERS: Filters = { chamber: 'All', party: 'All', type: 'All', q: '' }

function partyLabel(party: string | null): string {
  return party ?? '—'
}

export default function CongressBrowser({
  rows,
  totalCaptured,
}: {
  rows: CongressTradeRow[]
  totalCaptured: number
}) {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)

  const filtered = useMemo(() => {
    const query = filters.q.trim().toLowerCase()
    return rows.filter((r) => {
      if (filters.chamber !== 'All' && r.chamber !== filters.chamber) return false
      if (filters.party === 'None') {
        if (r.party === 'Democrat' || r.party === 'Republican') return false
      } else if (filters.party !== 'All' && r.party !== filters.party) return false
      if (filters.type !== 'All' && r.type !== filters.type) return false
      if (query) {
        const tickerMatch = r.ticker.toLowerCase().startsWith(query)
        const memberMatch = r.member.toLowerCase().includes(query)
        if (!tickerMatch && !memberMatch) return false
      }
      return true
    })
  }, [rows, filters])

  const isDefault =
    filters.chamber === 'All' &&
    filters.party === 'All' &&
    filters.type === 'All' &&
    filters.q === ''

  return (
    <>
      <div className="filter-row" role="group" aria-label="Filter by chamber">
        {(
          [
            ['All', 'Both chambers'],
            ['house', 'House'],
            ['senate', 'Senate'],
          ] as [ChamberFilter, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            className={`filter-pill${filters.chamber === v ? ' active' : ''}`}
            aria-pressed={filters.chamber === v}
            onClick={() => setFilters({ ...filters, chamber: v })}
          >
            {label}
          </button>
        ))}
        {(
          [
            ['All', 'Both parties'],
            ['Democrat', 'Democrat'],
            ['Republican', 'Republican'],
            ['None', 'No party on record'],
          ] as [PartyFilter, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            className={`filter-pill${filters.party === v ? ' active' : ''}`}
            aria-pressed={filters.party === v}
            onClick={() => setFilters({ ...filters, party: v })}
          >
            {label}
          </button>
        ))}
        {(
          [
            ['All', 'Buys + sells'],
            ['purchase', 'Buys'],
            ['sale', 'Sells'],
          ] as [TypeFilter, string][]
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            className={`filter-pill${filters.type === v ? ' active' : ''}`}
            aria-pressed={filters.type === v}
            onClick={() => setFilters({ ...filters, type: v })}
          >
            {label}
          </button>
        ))}
        {!isDefault && (
          <button
            type="button"
            className="filter-pill"
            onClick={() => setFilters(DEFAULT_FILTERS)}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="filter-row">
        <input
          className="filter-input"
          type="text"
          placeholder="Filter by ticker or member name"
          aria-label="Filter by ticker or member name"
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          autoComplete="off"
        />
      </div>

      <p className="filter-count">
        Showing {filtered.length} of {rows.length} filings on this board
        {totalCaptured > rows.length
          ? ` (the latest ${rows.length} of ${totalCaptured} captured)`
          : ''}
      </p>

      {filtered.length === 0 ? (
        <p>
          No filings match —{' '}
          <button
            type="button"
            className="btn"
            onClick={() => setFilters(DEFAULT_FILTERS)}
          >
            Clear filters
          </button>
        </p>
      ) : (
        <table className="tabled">
          <thead>
            <tr>
              <th>Disclosed</th>
              <th>Member</th>
              <th>Party</th>
              <th>Chamber / State</th>
              <th>Ticker</th>
              <th>Type</th>
              <th>Amount range</th>
              <th>Trade date</th>
              <th className="num">Lag</th>
              <th className="num">Price then → now</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, i) => (
              <tr key={`${r.memberSlug}-${r.ticker}-${r.disclosed}-${i}`}>
                <td>{r.disclosedLabel}</td>
                <td>
                  <Link href={`/congress/${r.memberSlug}`}>{r.member}</Link>
                </td>
                <td>{partyLabel(r.party)}</td>
                <td>
                  {r.chamber === 'senate' ? 'Senate' : 'House'} · {r.stateLabel}
                </td>
                <td>
                  {r.hasCard ? (
                    <Link href={`/stock/${r.ticker}`}>
                      <strong>{r.ticker}</strong>
                    </Link>
                  ) : (
                    <strong>{r.ticker}</strong>
                  )}
                </td>
                <td>{r.typeLabel}</td>
                <td>{r.amountRange}</td>
                <td>{r.tradeDateLabel}</td>
                <td className="num">{r.lagDays === null ? '—' : `${r.lagDays}d`}</td>
                <td className="num">
                  {r.estPrice === null && r.recentPrice === null
                    ? '—'
                    : `${money(r.estPrice)} → ${money(r.recentPrice)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="footnote">
        Amounts are the dollar ranges disclosed in the filings — the STOCK Act does not
        require exact figures. &ldquo;Price then → now&rdquo; is Bargo&apos;s estimate of
        the price at the trade and its recent price; neither is a fill price. Lag is the
        days between the trade and its disclosure — the legal window is up to ~45 days, so
        a disclosed trade is never breaking news about a position held today.
      </p>
    </>
  )
}
