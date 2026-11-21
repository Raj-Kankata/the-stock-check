import type { Metadata } from 'next'
import Screener from '@/components/Screener'
import NotScoredList from '@/components/NotScoredList'
import { NOTSCORED_RESULTS } from '@/lib/notscored-data'
import { RESULTS } from '@/lib/data'
import { allPublicRows, allNotScoredRows } from '@/lib/public'

export const metadata: Metadata = {
  title: 'Stock Screener',
  description:
    'Screen every stock scored by The Stock Check so far — filter by overall score, verdict, upside vs fair value, Quality, sector and market cap, then download the filtered rows as CSV. No sign-in. Anonymous usage stats only.',
}

export default function ScreenerPage() {
  const rows = allPublicRows()
  return (
    <>
      <h1>Stock Screener</h1>
      <p className="page-intro">
        Filter the whole scored universe — {RESULTS.price_date} close, {rows.length} names —
        by overall score, verdict, upside vs fair value, Quality, sector and market cap.
        Combine any filters; the table and the CSV download follow what you see. Scores,
        verdicts and fair values are as of the {RESULTS.price_date} close and never move
        intraday — only the price (and the upside computed from it) goes live during market
        hours.
      </p>

      <Screener rows={rows} priceDate={RESULTS.price_date} />

      <NotScoredList rows={allNotScoredRows()} priceDate={NOTSCORED_RESULTS.price_date} />

      <p>
        <strong>How to read this page.</strong> The filters use the Methodology wording:
        overall score 0–100, Quality is the Quality pillar score, upside is (fair value −
        price) / price, and the verdicts are Growth, Value, Watch and Avoid. A filtered view
        is a snapshot of the stated close, not a live quote. Research and education only —
        not investment advice.
      </p>
    </>
  )
}
