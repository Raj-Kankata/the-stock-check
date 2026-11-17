import type { Metadata } from 'next'
import { RESULTS, getTicker } from '@/lib/data'
import marketJson from '@/lib/data/market.json'
import { BENCHMARK, PICKS, PICKS_ENTRY_DATE, PICKS_NEW_ENTRY_DATE } from '@/lib/site'
import { Card } from '@/components/ui'
import PerformanceLive, { type PerformanceRow } from '@/components/PerformanceLive'
import BenchmarkLive from '@/components/BenchmarkLive'

export const metadata: Metadata = {
  title: 'Performance',
  description:
    'How the Top Picks are tracked: two equal-weight cohorts — four launch picks entered 13 Nov 2026 and nine new picks entered 16 Nov 2026 — at frozen entry prices, no costs, no dividends, against the S&P 500 benchmark. No return is published without its pick list.',
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

export default function PerformancePage() {
  const latestCloseDate = RESULTS.price_date
  const launchRows = cohortRows('launch')
  const newRows = cohortRows('new')

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
