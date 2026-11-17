import type { Metadata } from 'next'
import { TICKER_SYMBOLS, getTicker } from '@/lib/data'
import { PRICE_DATE } from '@/lib/site'
import { Card, StockRow, StockTableHead } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Trending',
  description:
    'Trending on The Stock Check: an interim list of the 227 currently scored names while the trending formula is still being locked. No hidden ranking inputs.',
}

export default function TrendingPage() {
  return (
    <>
      <h1>Trending</h1>
      <p className="page-intro">
        What is getting attention on The Stock Check right now — with the ranking shown, not
        hidden.
      </p>

      <div className="callout amber">
        <strong>The exact trending formula is not locked yet.</strong> The trending formula is an
        open item (SPEC v1.1 §8, open item 1). Until it is locked, this page shows an interim list
        and the criteria it uses — and the full ranking launches when the formula is locked.
      </div>

      <Card title={`Interim list — the ${TICKER_SYMBOLS.length} currently scored names`}>
        <p>
          Interim criteria, in full: this list is the {TICKER_SYMBOLS.length} names currently
          scored by engine v1.3, shown with verdict, overall score, price, fair value and
          upside. There are no hidden ranking inputs — no undisclosed score, no weighting, no
          ordering beyond the scored universe itself.
        </p>
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
          Prices are the {PRICE_DATE} close. Each row links to the stock&apos;s card, where the
          pillar scores, the three fair-value legs and the leg spread are all published.
        </p>
      </Card>

      <Card title="Why a name appears here">
        <p>
          A name appears on this page because it is in the scored universe — because it has been
          run through the engine and has a published verdict, score and fair value. It does not
          appear because of undisclosed social or flow data: no social-media mentions, no options
          flow, no search volume and no other off-page signal feeds this list.
        </p>
        <p>
          When the trending formula is locked, this page will print the formula in full, the same
          way the scoring methodology is published — including what counts, how much it counts,
          and what does not count. Until then, this interim list is the whole of the Trending
          page: {TICKER_SYMBOLS.length} scored names, nothing ranked behind the scenes.
        </p>
        <p className="footnote">
          Trending is research, not a recommendation. Nothing on this page is investment advice.
        </p>
      </Card>
    </>
  )
}
