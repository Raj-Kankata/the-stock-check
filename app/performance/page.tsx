import type { Metadata } from 'next'
import { RESULTS, getTicker } from '@/lib/data'
import marketJson from '@/lib/data/market.json'
import {
  BENCHMARK,
  DAILY_BENCHMARK_CLOSES,
  PICKS,
  PICKS_ENTRY_DATE,
  PICKS_NEW_ENTRY_DATE,
} from '@/lib/site'
import { Card } from '@/components/ui'
import SearchBox from '@/components/SearchBox'
import { searchIndex, etfSearchIndex, indexSearchIndex, ipoSearchIndex } from '@/lib/public'
import PerformanceLive, { type PerformanceRow } from '@/components/PerformanceLive'
import BenchmarkLive from '@/components/BenchmarkLive'

const DAILY_SHOWN = 5

function formatEntryDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${d} ${months[m - 1]} ${y}`
}

export function generateMetadata(): Metadata {
  const launch = PICKS.filter((p) => p.cohort === 'launch').length
  const fresh = PICKS.filter((p) => p.cohort === 'new').length
  const daily = PICKS.filter((p) => p.cohort === 'daily').length
  const dailyDays = new Set(PICKS.filter((p) => p.cohort === 'daily').map((p) => p.entryDate)).size
  return {
    title: 'Performance',
    description: `How the Top Picks are tracked: two equal-weight frozen cohorts — ${launch} launch picks entered 13 Nov 2026 and ${fresh} new picks entered 16 Nov 2026 — plus one daily table of the top 5 by overall score (${daily} daily picks across ${dailyDays} days) — at frozen entry prices, no costs, no dividends, against the S&P 500 benchmark. No return is published without its pick list.`,
  }
}

function cohortRows(cohort: 'launch' | 'new'): PerformanceRow[] {
  return PICKS.filter((p) => p.cohort === cohort)
    .map(({ symbol, entryPrice }) => {
      const t = getTicker(symbol)
      if (!t) return null
      return { symbol, name: t.name, entryPrice, bakedLatest: t.price }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
}

/** Daily tables: one group per entry date, newest first. */
function dailyGroups(): { entryDate: string; rows: PerformanceRow[] }[] {
  const byDate = new Map<string, PerformanceRow[]>()
  for (const { symbol, entryPrice, entryDate } of PICKS.filter((p) => p.cohort === 'daily')) {
    const t = getTicker(symbol)
    if (!t) continue
    const row = { symbol, name: t.name, entryPrice, bakedLatest: t.price }
    const rows = byDate.get(entryDate)
    if (rows) rows.push(row)
    else byDate.set(entryDate, [row])
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([entryDate, rows]) => ({ entryDate, rows }))
}

function dailyTable(
  group: { entryDate: string; rows: PerformanceRow[] },
  latestCloseDate: string,
  bakedSpx: number,
) {
  const entryClose = DAILY_BENCHMARK_CLOSES[group.entryDate]
  return (
    <PerformanceLive
      key={group.entryDate}
      rows={group.rows}
      entryDate={group.entryDate}
      latestCloseDate={latestCloseDate}
      title={`Picks (entered ${formatEntryDate(group.entryDate)})`}
      benchmark={
        typeof entryClose === 'number'
          ? { entryClose, latestClose: bakedSpx }
          : undefined
      }
    />
  )
}

export default function PerformancePage() {
  const latestCloseDate = RESULTS.price_date
  const launchRows = cohortRows('launch')
  const newRows = cohortRows('new')
  const daily = dailyGroups()
  const dailyShown = daily.slice(0, DAILY_SHOWN)
  const dailyEarlier = daily.slice(DAILY_SHOWN)

  // Baked S&P 500 close in this build's data (market.json); the entry
  // closes stay frozen in BENCHMARK and never move with the refresh.
  const spx = (marketJson as { indices?: { symbol?: string; close?: number }[] }).indices?.find(
    (i) => i.symbol === '^GSPC',
  )
  const bakedSpx = typeof spx?.close === 'number' ? spx.close : BENCHMARK.newEntryClose

  return (
    <>
      <h1>Performance</h1>
      <p className="page-intro">
        Every return we publish is recomputable from the frozen entries below. No return is ever
        published without its pick list.
      </p>

      <Card title="How performance is measured">
        <p>
          The Top Picks are tracked as <strong>equal-weight portfolios</strong>, one per entry
          cohort, at the frozen entry prices shown below. Each portfolio holds its picks in
          equal weight at entry; no costs and no dividends are included — both are stated here
          so the numbers can be reproduced exactly. The two cohorts are measured separately
          and never blended into one return.
        </p>
        <ul>
          <li>
            <strong>Entry prices:</strong> frozen at publication — {PICKS_ENTRY_DATE} close for
            the launch cohort, {PICKS_NEW_ENTRY_DATE} close for the new cohort — never
            restated.
          </li>
          <li>
            <strong>Latest close:</strong> the close in this build&apos;s data (
            {latestCloseDate}); the return is recomputed from it on every nightly refresh.
            During market hours the tables below show the live price instead, and the return
            is then entry → live price.
          </li>
          <li>
            <strong>Daily picks:</strong> one new table each morning — the top 5 by overall
            score at the previous close, entered at that close (Raj&apos;s rule, 19 Nov 2026).
            Newest table first; the latest {DAILY_SHOWN} are shown in full and older tables
            sit collapsed under &ldquo;Earlier daily picks&rdquo;. A table is only ever built
            on a fresh close — if the nightly refresh fails, that day gets no table.
          </li>
          <li>
            <strong>Weighting:</strong> equal weight across the picks in each cohort.
          </li>
          <li>
            <strong>Costs:</strong> none included — no commissions, fees or slippage.
          </li>
          <li>
            <strong>Dividends:</strong> not included.
          </li>
          <li>
            <strong>Benchmark:</strong> the S&amp;P 500, shown below with returns since each
            cohort&apos;s entry date. It carries no costs or dividends either, same as the
            picks.
          </li>
        </ul>
      </Card>

      {dailyShown.map((group) => dailyTable(group, latestCloseDate, bakedSpx))}
      {dailyEarlier.length > 0 ? (
        <details className="metric-note">
          <summary>Earlier daily picks ({dailyEarlier.length} tables)</summary>
          {dailyEarlier.map((group) => dailyTable(group, latestCloseDate, bakedSpx))}
        </details>
      ) : null}

      <PerformanceLive
        rows={launchRows}
        entryDate={PICKS_ENTRY_DATE}
        latestCloseDate={latestCloseDate}
        title="Launch picks (entered 13 Nov 2026)"
        nvoNote
      />

      <PerformanceLive
        rows={newRows}
        entryDate={PICKS_NEW_ENTRY_DATE}
        latestCloseDate={latestCloseDate}
        title="New picks (entered 16 Nov 2026)"
      />

      <BenchmarkLive bakedLatest={bakedSpx} latestCloseDate={latestCloseDate} />

      <Card title="Check any ticker">
        <p>
          Looking for a different name? Search any ticker or company below — the same search
          as the header, over every scored stock, tracked ETF, index and IPO dossier — and it
          takes you to that card.
        </p>
        <SearchBox
          entries={searchIndex()}
          etfEntries={etfSearchIndex()}
          indexEntries={indexSearchIndex()}
          ipoEntries={ipoSearchIndex()}
        />
      </Card>

      <Card title="Why the record is still short">
        <p>
          A return without a frozen entry price is not auditable — it can always be restated after
          the fact. So we publish the entries first, freeze them, and only then measure. The
          entries above are the audit trail: every return on this page can be recomputed from the
          entry prices, the latest close, and the equal-weight, no-cost, no-dividend method stated
          above. The record starts with the closes since entry and grows by one close each night.
        </p>
        <p className="footnote">
          Performance is research, not a promise. Past performance — including any print on this
          page — does not guarantee future results. Nothing here is investment advice.
        </p>
      </Card>
    </>
  )
}
