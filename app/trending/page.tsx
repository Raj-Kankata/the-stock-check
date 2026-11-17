import type { Metadata } from 'next'
import { RESULTS, TICKER_SYMBOLS } from '@/lib/data'
import TrendingBoards, { type TrendingStockMeta } from '@/components/TrendingBoards'

export function generateMetadata(): Metadata {
  return {
    title: 'Trending',
    description: `Trending on The Stock Check: the biggest live day-movers among the ${TICKER_SYMBOLS.length} scored names — top gainers, top losers and most active — each shown with our verdict and overall score. Quotes delayed ~15 minutes (TradingView).`,
  }
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function formatDate(iso: string | undefined): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d || m < 1 || m > 12) return iso
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

export default function TrendingPage() {
  // Only the light per-ticker facts the boards need cross the
  // server/client boundary — never the whole results.json.
  const stocks: TrendingStockMeta[] = TICKER_SYMBOLS.map((symbol) => {
    const t = RESULTS.tickers[symbol]
    return {
      symbol,
      name: t.name,
      verdict: t.verdict,
      score: t.overall_score,
    }
  })

  return (
    <>
      <h1>Trending</h1>
      <p className="page-intro">
        What is moving most on The Stock Check right now — the biggest live
        day-movers among the {TICKER_SYMBOLS.length} stocks we score, each
        shown with our verdict and overall score next to the move.
      </p>

      <TrendingBoards priceDateLabel={formatDate(RESULTS.price_date)} stocks={stocks} />

      <p className="footnote">
        Trending is research, not a recommendation. Nothing on this page is
        investment advice.
      </p>
    </>
  )
}
