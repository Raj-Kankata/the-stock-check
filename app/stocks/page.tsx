import type { Metadata } from 'next'
import StockBrowser from '@/components/StockBrowser'

export const metadata: Metadata = {
  title: 'All Stocks',
  description:
    'Every stock scored by The Stock Check so far — verdict, overall score, price, fair value and upside, all computed from the published rules. No sign-in, no tracking.',
}

export default function StocksPage() {
  return (
    <>
      <h1>All Stocks</h1>
      <p className="page-intro">
        Every name scored by the engine so far, in one table. Filter by verdict or sector,
        sort by score, upside, price or fair value, or narrow to names trading under fair
        value — the URL updates as you filter, so any view is shareable. Use the search in
        the header to jump to a single stock&apos;s full card.
      </p>

      <StockBrowser />
    </>
  )
}
