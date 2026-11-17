import type { Metadata } from 'next'
import Link from 'next/link'
import { Card } from '@/components/ui'
import { RESULTS } from '@/lib/data'
import {
  BACKTEST_V2,
  BACKTEST_WIDE,
  BACKTEST_V3_CAPM,
} from '@/lib/site'

export const metadata: Metadata = {
  title: 'Methodology',
  description:
    'How The Stock Check scores stocks and estimates fair value, in plain language.',
}

export default function MethodologyPage() {
  return (
    <>
      <h1>Methodology</h1>
      <p className="page-intro">
        Every stock on this site gets an overall score from 0 to 100 and one fair value — our
        estimate of what a share is worth. The score comes from five angles on the business;
        the fair value comes from three independent estimates combined into one number. This
        page explains, in plain language, what each number means and how to read it. Prices
        are the {RESULTS.price_date} close unless marked LIVE during market hours.
      </p>

      <div className="callout">
        <strong>Research and education only — not investment advice.</strong> Fair values are
        model estimates built from stated assumptions, not predictions. The ladder is valuation
        context, not a buy or sell signal. See Terms for the full position.
      </div>

      <Card title="(a) What the score is">
        <p>
          Every stock gets an <strong>overall score from 0 to 100</strong>, built from five
          pillars, each scored 0–100: Conviction, Valuation, Quality, Technical (Timing), and
          Trust. Each stock also gets a verdict — Growth, Value, Watch, or Avoid — based on
          its scores and how its price compares with our fair value.
        </p>
        <p>
          {Object.keys(RESULTS.tickers).length} stocks scored today — see them all on{' '}
          <Link href="/stocks">All Stocks</Link>.
        </p>
      </Card>

      <Card title="(b) Each pillar, in plain words">
        <h3>Conviction — the Story-Tracker</h3>
        <p>
          How good the business story and its financials look: whether sales and profits are
          growing, analysts are raising their forecasts, and the stock is leading the market.
        </p>

        <h3>Valuation</h3>
        <p>
          How the share price compares with our fair value. Our fair value combines three
          independent estimates: one based on the company&rsquo;s cash flow, one based on its
          growth and dividend compared with its earnings multiple, and one based on next
          year&rsquo;s expected earnings at its sector&rsquo;s going multiple.
        </p>
        <p>
          One-off gains are taken out and one-off charges are added back before
          earnings are valued, so a single unusual quarter does not distort the
          picture — in either direction. A gain that will not repeat makes a
          business look more profitable than it is; a charge that will not
          repeat makes it look less profitable than it is.
        </p>
        <p>
          The growth behind the cash-flow and growth-based estimates is also kept honest:
          when the implied growth rate is far out of line with what the business itself is
          growing at — or when no analyst publishes a long-term growth estimate for the
          name at all — the growth used is held to a level the business&rsquo;s own
          revenue growth can support. The third estimate, based on next year&rsquo;s
          earnings at the sector&rsquo;s multiple, is unaffected.
        </p>

        <h3>Quality / Forensics</h3>
        <p>
          Whether the reported profits are real: backed by cash actually coming in, customers
          paying what they owe, and borrowing kept in check.
        </p>

        <h3>Technical / Timing</h3>
        <p>
          What the price chart says about timing. It is about when, never about whether a
          business is worth owning, and it is the smallest part of the score.
        </p>

        <h3>Trust</h3>
        <p>
          How much we can rely on the numbers behind the other four pillars: whether the data
          is complete, analysts broadly agree, and insiders are not all selling. There is{' '}
          <strong>no insider feed</strong> in this build, so that part stays neutral — it is
          never read as &ldquo;no selling&rdquo;.
        </p>
      </Card>

      <Card title="(c) The ladder — valuation context, not buy/sell instructions">
        <p>
          The ladder marks where the price sits against our fair value, in four steps from
          well below it to well above it. It is <strong>valuation context</strong> — a way to
          see how far the price is from our estimate — not an instruction to buy or sell at
          any level. No level on the ladder is a recommendation.
        </p>
        <p>That restraint is evidence-based, not modesty. Three backtests measured whether the
          ladder separates forward returns:</p>
        <h3>{BACKTEST_V2.label}</h3>
        <ul>
          <li>{BACKTEST_V2.aboveExit}.</li>
          <li>
            Six months after being above Exit: {BACKTEST_V2.aboveExit6m} average return,{' '}
            {BACKTEST_V2.aboveExitWin} of observations positive, {BACKTEST_V2.aboveExitVsSpy}.
          </li>
          <li>Correlations, upside vs forward return: {BACKTEST_V2.correlations}.</li>
        </ul>
        <h3>{BACKTEST_WIDE.label}</h3>
        <ul>
          <li>Six-month return below Buy: {BACKTEST_WIDE.belowBuy6m}.</li>
          <li>Six-month return above Exit: {BACKTEST_WIDE.aboveExit6m}.</li>
          <li>Correlations: {BACKTEST_WIDE.correlations}.</li>
        </ul>
        <h3>{BACKTEST_V3_CAPM.label}</h3>
        <ul>
          <li>Six-month return below Buy: {BACKTEST_V3_CAPM.belowBuy6m}.</li>
          <li>Six-month return above Exit: {BACKTEST_V3_CAPM.aboveExit6m}.</li>
          <li>Correlations: {BACKTEST_V3_CAPM.correlations}.</li>
        </ul>
        <p className="footnote">
          Read plainly: stocks above Exit did not underperform stocks below Buy — in the wide
          backtest they did better. The ladder does not separate forward returns, so it is
          published as context and never as a signal.
        </p>
      </Card>

      <Card title="(d) CAPM cross-check — display only">
        <p>
          A second, market-based check on our cash-flow estimate. It uses live market interest
          rates instead of our fixed assumptions, and it is <strong>display-only</strong>: it
          does not change any fair value, score or verdict.
        </p>
        <p>
          A full backtest found it does not separate future returns any better than the
          estimate it checks — which is why it stays display-only.
        </p>
      </Card>

      <Card title="(e) Data sources & cadence">
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Source</th>
              <th>Cadence</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Fundamentals</td>
              <td>SEC filings</td>
              <td>Daily</td>
            </tr>
            <tr>
              <td>Prices / technicals</td>
              <td>Yahoo Finance</td>
              <td>Daily close</td>
            </tr>
            <tr>
              <td>Free cash flow / operating cash flow</td>
              <td>Yahoo quarterly cash-flow statements</td>
              <td>Quarterly</td>
            </tr>
            <tr>
              <td>Forward EPS / P/E / price targets / beta</td>
              <td>Yahoo Finance</td>
              <td>Daily</td>
            </tr>
            <tr>
              <td>Insider activity</td>
              <td>Form 4 / 13G-D filings</td>
              <td>As filed (no live feed in this build — see Trust)</td>
            </tr>
            <tr>
              <td>Macro (Market Pulse)</td>
              <td>FRED + Yahoo</td>
              <td>Every 6 hours (feed not wired in this build)</td>
            </tr>
            <tr>
              <td>Conviction (Story-Tracker)</td>
              <td>Story-Tracker</td>
              <td>Weekly, Monday pre-market</td>
            </tr>
            <tr>
              <td>Top Picks</td>
              <td>Engine output</td>
              <td>Frozen at publication; changes only by decision</td>
            </tr>
          </tbody>
        </table>
        <p className="footnote">
          One field is deliberately discarded: Yahoo&rsquo;s freeCashflow field was found wrong,
          so free cash flow is taken from the quarterly cash-flow statement instead.
        </p>
      </Card>

      <Card title="(f) How Top Picks performance is tracked">
        <p>
          Top Picks are the four launch names plus the top five Growth and top five Value names
          as of the 16 Nov 2026 close.
        </p>
        <p>
          The list is frozen at publication. It changes only when a new decision is made — names
          are never rotated in automatically.
        </p>
        <p>
          Performance is tracked in two groups, one for each entry date, and each group is
          measured on its own — the two groups are never blended into one return.
        </p>
        <p>
          The S&amp;P 500 is the benchmark, shown with returns since each entry date. It carries
          no costs or dividends either, same as the picks.
        </p>
      </Card>

      {/* Reading cards — every metric, explained */}
      <Card title="Reading cards — every metric, explained">
        <p>
          Every number on a stock card, explained in plain language: what it is and how to
          read it. Scores are on a 0–100 scale unless stated otherwise. A fair value is our
          estimate of what a share is worth — it is research, not a buy or sell
          recommendation.
        </p>
        <ul>
          <li>
            <Link href="#dcf-leg">DCF leg</Link>
          </li>
          <li>
            <Link href="#pegy-leg">PEGY leg</Link>
          </li>
          <li>
            <Link href="#forward-sector-leg">Forward-sector leg</Link>
          </li>
          <li>
            <Link href="#triangulated-fv">Fair value</Link>
          </li>
          <li>
            <Link href="#conviction">Conviction</Link>
          </li>
          <li>
            <Link href="#valuation">Valuation</Link>
          </li>
          <li>
            <Link href="#quality">Quality</Link>
          </li>
          <li>
            <Link href="#technical">Technical (Timing)</Link>
          </li>
          <li>
            <Link href="#trust">Trust</Link>
          </li>
          <li>
            <Link href="#ladder">Valuation ladder</Link>
          </li>
          <li>
            <Link href="#sensitivity-grid">DCF sensitivity grid</Link>
          </li>
          <li>
            <Link href="#us-vs-wall-street">The Stock Check vs Wall Street</Link>
          </li>
          <li>
            <Link href="#capm-cross-check">CAPM cross-check</Link>
          </li>
        </ul>
        <p className="footnote">
          Prices at the 13 November 2026 close; engine run 16 November 2026.
        </p>
      </Card>

      <section id="dcf-leg" className="card">
        <h2>DCF leg</h2>
        <p>
          This estimate values a company by the cash it is expected to generate for its owners
          in the years ahead, worked back to what that cash is worth today. A higher value
          means the company&rsquo;s expected cash flow supports a higher price — but it leans
          heavily on assumptions about future growth, so read it together with the other two
          estimates.
        </p>
      </section>

      <section id="pegy-leg" className="card">
        <h2>PEGY leg</h2>
        <p>
          This estimate asks whether the price you pay for each dollar of earnings is
          reasonable once you count how fast earnings are growing and the dividend you collect
          while you wait. If growth plus dividend income is high compared with the
          price-to-earnings ratio, the stock looks cheap on this view; if it is low, it looks
          expensive.
        </p>
      </section>

      <section id="forward-sector-leg" className="card">
        <h2>Forward-sector leg</h2>
        <p>
          This estimate values a stock the way the market usually does: next year&rsquo;s
          expected earnings per share, priced at the multiple its whole sector currently
          trades at. It is the most market-priced of the three estimates, so when it stands
          far above the other two, the fair value is resting on forecasts rather than on
          today&rsquo;s cash flow.
        </p>
      </section>

      <section id="triangulated-fv" className="card">
        <h2>Fair value</h2>
        <p>
          Our fair value is one number built from three independent estimates, so no single
          estimate can dominate it. When the price is below our fair value, our estimates on
          balance say the stock is worth more than it costs — and when it is above, they say
          the opposite.
        </p>
      </section>

      <section id="conviction" className="card">
        <h2>Conviction</h2>
        <p>
          Conviction measures whether the business itself is worth following — whether its
          story and its financials are both getting better. A high score here means a good
          business, not a cheap price: a strong company can still be too expensive to score
          well overall.
        </p>
      </section>

      <section id="valuation" className="card">
        <h2>Valuation</h2>
        <p>
          Valuation turns our fair value into a 0–100 score: the further the price sits below
          our fair value, the higher the score. Always read it with how far apart the three
          estimates are in mind — a high score means less when the estimates disagree wildly.
        </p>
      </section>

      <section id="quality" className="card">
        <h2>Quality</h2>
        <p>
          Quality checks whether reported profits are real — backed by cash actually coming
          in, customers paying what they owe, and borrowing kept in check. When profits run
          well ahead of cash, treat the earnings with caution, however big they look.
        </p>
      </section>

      <section id="technical" className="card">
        <h2>Technical (Timing)</h2>
        <p>
          Technical, labelled Timing on the card, asks only whether now looks like a good
          moment to act, based on the price chart alone. It says nothing about whether the
          business is good, and a low score here never makes a stock Avoid on its own.
        </p>
      </section>

      <section id="trust" className="card">
        <h2>Trust</h2>
        <p>
          Trust measures how much we can rely on the numbers behind the other pillars —
          whether the data is complete, analysts broadly agree, and insiders are not all
          selling. A low score means read the rest of the card with more caution, not that the
          business itself is bad.
        </p>
      </section>

      <section id="ladder" className="card">
        <h2>Valuation ladder</h2>
        <p>
          The ladder shows where the price sits against our fair value in four steps, from
          well below it to well above it. These are reference points for context only — never
          instructions to buy or sell.
        </p>
      </section>

      <section id="sensitivity-grid" className="card">
        <h2>DCF sensitivity grid</h2>
        <p>
          This grid shows the cash-flow estimate not as one number but as a table, so you can
          see how much it moves when growth or interest-rate assumptions change. If the whole
          grid sits below the share price, the cash-flow view cannot support the price on any
          plausible assumption.
        </p>
      </section>

      <section id="us-vs-wall-street" className="card">
        <h2>The Stock Check vs Wall Street</h2>
        <p>
          Wall Street analysts publish their own price targets, and this card puts our fair
          value next to theirs so you can see where we agree and where we disagree. A small
          gap means rough agreement; a large gap means one of us is wrong — and when none of
          our three estimates sits near their average target, we say so plainly.
        </p>
      </section>

      <section id="capm-cross-check" className="card">
        <h2>CAPM cross-check</h2>
        <p>
          This is a second opinion on our cash-flow estimate, built with live market interest
          rates instead of our fixed assumptions. It changes nothing — no fair value, score,
          or verdict — and is shown only so you can see how the estimate holds up under a
          market-based view.
        </p>
      </section>
    </>
  )
}
