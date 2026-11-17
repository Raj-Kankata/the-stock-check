import type { Metadata } from 'next'
import { RESULTS, TICKER_SYMBOLS, getTicker, money, pct } from '@/lib/data'
import { ENGINE_VERSION, PILLAR_WEIGHTS, PRICE_DATE } from '@/lib/site'
import { Card, StockRow, StockTableHead } from '@/components/ui'
import GridPreview from '@/components/GridPreview'

export const metadata: Metadata = {
  title: 'Check any stock before you buy',
  description:
    'A free, deterministic, rules-based stock research tool. Five pillar scores, a triangulated fair value from three legs, and the full methodology published. No sign-in, no tracking.',
}

export default function HomePage() {
  const nvda = getTicker('NVDA')
  const legs = nvda?.pillars.valuation.detail.legs
  const legSpread = nvda?.pillars.valuation.detail.leg_spread_div_fv

  return (
    <>
      <h1>Check any stock before you buy.</h1>
      <p className="page-intro">
        A free research tool that scores a stock on five pillars and works out a fair value from
        three independent legs — and shows you every number, so you can check the work yourself.
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

      <Card title="Try the fair-value grid">
        <p>
          The grid shows what a stock&apos;s DCF fair value would be under different
          assumptions. Each row is a free-cash-flow growth rate, from 0% to 20%; each
          column is a risk-free rate, from 4.0% to 6.0%. Click any cell to compare it
          with that stock&apos;s DCF leg.
        </p>
        <GridPreview />
      </Card>

      <Card title="What you get">
        <p>Every scored stock gets the same treatment:</p>
        <ul>
          {PILLAR_WEIGHTS.map((p) => (
            <li key={p.key}>
              <strong>{p.label}</strong> — {p.weight}% of the overall score
            </li>
          ))}
        </ul>
        <p>
          The five pillar scores combine into one overall score (0–100) and a verdict: Growth,
          Value, Watch or Avoid. The overall score is a summary, not a recommendation — read the
          pillars and the fair value before deciding anything.
        </p>
        <p>
          <strong>Triangulated fair value.</strong> The fair value is the median of three
          independent legs — a 5-year DCF, a PEGY leg, and a forward-sector leg — not any single
          model&apos;s answer. The spread between the highest and lowest leg is published on every
          stock card, so you can see how much the three legs agree or disagree.
        </p>
        {legs && nvda && (
          <p>
            Example — NVDA: DCF {money(legs.dcf.value)}, PEGY {money(legs.pegy.value)},
            forward-sector {money(legs.forward_sector.value)}; median (fair value){' '}
            {money(nvda.triangulated_fv)}
            {legSpread !== undefined && legSpread !== null
              ? `, leg spread ${pct(legSpread, 1, false)} of fair value`
              : ''}
            .
          </p>
        )}
        <p>
          <strong>Ladder as valuation context.</strong> Each stock card also shows a ladder at
          0.60×, 0.80×, 1.00× and 1.20× fair value — where the price sits against the fair-value
          estimate. The ladder is valuation context, not a buy or sell signal: backtests on 5
          tickers and on the full 749-name universe found the ladder does not separate forward
          returns.
        </p>
        <p>
          <strong>Full methodology published.</strong> The scoring rules, the locked inputs, the
          backtests and the open items are all on the Methodology page. No sign-in, no tracking,
          no analytics, no paywall.
        </p>
      </Card>

      <Card title="Disclaimer" accent="amber">
        <p>
          The Stock Check is a free research tool for research and education only. It is not
          investment advice, and nothing on this site is a recommendation to buy or sell any
          security.
        </p>
        <p>
          Prices are as of the {PRICE_DATE} close. Scores and fair values come from {ENGINE_VERSION}.
          Data may be delayed and can contain errors — verify before trading. Past performance does not guarantee future results.
        </p>
      </Card>

      <p className="footnote">
        Engine: {RESULTS.engine} · Prices as of {RESULTS.price_date} · Scores as of{' '}
        {RESULTS.as_of}
      </p>
    </>
  )
}
