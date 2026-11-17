import type { Metadata } from 'next'
import { TICKER_SYMBOLS, getTicker } from '@/lib/data'
import { PRICE_DATE } from '@/lib/site'
import { Card, StockRow, StockTableHead } from '@/components/ui'

export const metadata: Metadata = {
  title: 'All Stocks',
  description:
    'Every stock scored by The Stock Check so far — verdict, overall score, price, triangulated fair value and upside, all computed from the published rules. No sign-in, no tracking.',
}

export default function StocksPage() {
  return (
    <>
      <h1>All Stocks</h1>
      <p className="page-intro">
        Every name scored by the engine so far, in one table. Use the search in the header to
        jump to a single stock&apos;s full card.
      </p>

      <Card title="All scored tickers">
        <table>
          <thead>
            <StockTableHead />
          </thead>
          <tbody>
            {TICKER_SYMBOLS.map((symbol) => {
              const t = getTicker(symbol)
              if (!t) return null
              return <StockRow key={symbol} t={{ ...t, symbol }} />
            })}
          </tbody>
        </table>
        <p className="footnote">
          {TICKER_SYMBOLS.length} names are scored so far — use the search above to find any
          of them. Prices are the {PRICE_DATE} close. The scored universe expands as more
          names are run through the engine; no score is ever guessed for an unscored ticker.
        </p>
      </Card>
    </>
  )
}
