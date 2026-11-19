import type { Metadata } from 'next'
import Link from 'next/link'
import { Card } from '@/components/ui'
import { RESULTS } from '@/lib/data'
import {
  BACKTEST_V2,
  BACKTEST_WIDE,
  BACKTEST_V3_CAPM,
} from '@/lib/site-server'

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
        the fair value comes from up to three independent estimates combined into one number.
        This page explains, in plain language, what each number means and how to read it.
        Prices are the {RESULTS.price_date} close unless marked LIVE during market hours.
      </p>

      <div className="callout">
        <strong>Research and education only — not investment advice.</strong> Fair values are
        model estimates built from stated assumptions, not predictions. The ladder is valuation
        context, not a buy or sell signal. This is not a stock promotion. Data may be delayed,
        incomplete or inaccurate — do your own research and consult a licensed financial
        advisor. Past performance does not guarantee future results. See Terms and Legal for
        the full position.
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
          How the share price compares with our fair value. Our fair value combines up to
          three independent estimates: one based on the company&rsquo;s cash flow, one based
          on its growth and dividend compared with its earnings multiple, and one based on
          next year&rsquo;s expected earnings at its sector&rsquo;s going multiple.
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
        <p>
          When a one-off gain or charge is so large that it swamps a
          company&rsquo;s whole year of earnings, the middle of the three
          estimates stops meaning anything — so the fair value is based
          instead on next year&rsquo;s expected earnings at the sector&rsquo;s
          multiple, the estimate that does not depend on those reported
          earnings at all. The card says so in plain words wherever this
          applies.
        </p>
        <p>
          When no analyst publishes a long-term growth estimate for a name, the growth used
          comes from the company&rsquo;s own filings instead — how fast its revenue has
          compounded over the last three fiscal years. The same caps still apply, so the
          growth used never runs ahead of what the business itself has delivered.
        </p>
        <p>
          When one of the three estimates cannot be computed at all — a bank&rsquo;s cash flow
          is not a meaningful number, for example — the fair value is the average of the two
          that can be, and the card names which two. A name whose fair value still comes out
          at or below zero is not published at all.
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
          is complete, analysts broadly agree, and insiders are not all selling.
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
              <td>Buying and selling by insiders in the last 90 days</td>
              <td>Daily (Yahoo insider feed)</td>
            </tr>
            <tr>
              <td>Macro (Market Pulse)</td>
              <td>FRED + Yahoo</td>
              <td>Daily (nightly refresh)</td>
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

      <Card title="(g) How scoring works" id="how-scoring-works">
        <p>
          Every score on this site — overall, pillar, and each check inside a pillar — runs
          from 0 to 100. Scores are coloured green at 70 and above, amber from 40 to 69, and
          red below 40. The overall score is a weighted average of the five pillars:
          Conviction 25%, Valuation 30%, Quality 20%, Technical 10%, Trust 15%.
        </p>
        <h3>The verdict gates</h3>
        <p>
          Avoid when any of these is true: the overall score is below 45; the Valuation score
          is below 30; the Quality score is below 40; or the price is at or above the Exit
          rung of the ladder. Growth when the overall score is 60 or more, the price sits
          below our fair value, the Quality score is 55 or more, Conviction is 50 or more,
          and revenue has compounded at 10% a year or more over three years. Value when the
          overall score is 60 or more, the upside is +25% or more, the Quality score is 60
          or more, Conviction is 50 or more, and growth is slower. Anything else is Watch.
        </p>
        <h3>Valuation — from the upside, with a disagreement cap</h3>
        <p>
          The Valuation score comes from how far the price sits below or above our fair
          value, on a sliding scale: −40% upside scores 10, −25% scores 25, −10% scores 40,
          0% scores 55, +10% scores 70, +25% scores 85, and +50% scores 100, with a straight
          line between those points. Then it is capped when the three estimates disagree: if
          they span more than the fair value itself, the score is capped at 55; if they span
          more than 75% of it, capped at 65.
        </p>
        <p>
          On each stock card the Valuation table shows the same three steps: the upside and
          the score it maps to, the leg spread and the cap it triggers, and the final score
          after the cap. When the spread is more than the fair value, both cap conditions
          hold and the 55 applies — the stricter cap always wins.
        </p>
        <h3>Conviction — Story and Financials, averaged</h3>
        <p>
          Conviction is the average of two 0–100 scores from our weekly Story-Tracker. Story
          is 35% forward revenue growth, 30% price leadership, 20% estimate revisions, and
          15% theme strength. Financials is 30% revenue growth, 30% profitability, 20% cash
          flow, and 20% revenue-growth acceleration. Both are percentile ranks across the
          whole watchlist, so 50 is the middle stock.
        </p>
        <p>
          The Story-Tracker also sorts names into four standings — Full position, Speculative,
          Hold (don&rsquo;t add), and Out — from whether each side is &ldquo;strong&rdquo;: a
          side is strong in the top third of the watchlist plus, for the story, next-year
          revenue growth above zero and the price within 5% of its 200-day average, and for
          the financials, revenue growing year on year. A side that was strong stays strong
          until it falls 4 points below the line. Both strong is a Full position; story only
          is Speculative; financials only is Hold, don&rsquo;t add; neither is Out. The
          standing is a weekly Story-Tracker label and is not shown on the card.
        </p>
        <h3>Quality — six checks</h3>
        <p>
          Each check reads one number and scores it on fixed bands. The pillar score weights
          them: OCF vs net income 25%, Accruals 20%, Receivables trend 15%, FCF conversion
          20%, Return on assets 10%, Leverage 10%.
        </p>
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>What is scored</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>OCF vs net income</td>
              <td>Operating cash flow as a share of net income</td>
              <td>&le;40% → 20 · &le;60% → 40 · &le;80% → 60 · &le;100% → 80 · above 100% → 100</td>
            </tr>
            <tr>
              <td>Accruals (Sloan)</td>
              <td>How much of earnings is accruals, not cash</td>
              <td>&le;0 → 100 · &le;0.05 → 75 · &le;0.10 → 50 · above 0.10 → 25</td>
            </tr>
            <tr>
              <td>Receivables trend</td>
              <td>Change in receivables &divide; revenue, in points</td>
              <td>&le;1 → 100 · &le;3 → 70 · &le;5 → 40 · above 5 → 20</td>
            </tr>
            <tr>
              <td>FCF conversion</td>
              <td>Free cash flow as a share of net income</td>
              <td>&le;20% → 20 · &le;40% → 45 · &le;60% → 65 · &le;80% → 85 · above 80% → 100</td>
            </tr>
            <tr>
              <td>Return on assets</td>
              <td>Net income &divide; assets</td>
              <td>&le;10% → 35 · &le;15% → 55 · &le;20% → 70 · &le;30% → 85 · above 30% → 100</td>
            </tr>
            <tr>
              <td>Leverage</td>
              <td>Debt &divide; equity</td>
              <td>&le;0.30 → 100 · &le;0.60 → 80 · &le;1.00 → 60 · &le;2.00 → 40 · above 2.00 → 20</td>
            </tr>
          </tbody>
        </table>
        <p>
          When adjusted net income is under 1% of revenue, the two cash checks (OCF vs net
          income and FCF conversion) cannot be read — their ratios explode on a near-zero
          denominator — so both score a neutral 50 and the card shows &ldquo;not
          meaningful&rdquo; instead of the percentages. The other four checks are unaffected.
        </p>
        <p>
          When the receivables trend cannot be read from the filings at all, that one check
          scores a neutral 50 and the card shows a dash instead of a number — the missing
          check neither helps nor hurts the Quality score.
        </p>
        <h3>Technical — four checks</h3>
        <p>
          Weights: EMA trend 35%, Price vs 200-day 25%, RSI 20%, MACD 20%.
        </p>
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>What is scored</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>EMA trend</td>
              <td>Where the price sits against its 20-, 50- and 200-day averages</td>
              <td>Above all three → 100 · Above 50 and 200 → 75 · Above 50 or 200 → 60 · Below all three → 15 · Anything else → 35</td>
            </tr>
            <tr>
              <td>Price vs 200-day</td>
              <td>Price against the 200-day average</td>
              <td>&le;−10% → 20 · Below 0% → 45 · Below +10% → 75 · +10% or more → 100</td>
            </tr>
            <tr>
              <td>RSI</td>
              <td>14-day relative strength index</td>
              <td>45–60 → 80 · 60–70 → 70 · 30–45 → 55 · Above 70 → 40 · Below 30 → 35</td>
            </tr>
            <tr>
              <td>MACD</td>
              <td>MACD histogram</td>
              <td>Above zero → 75 · Zero or below → 40</td>
            </tr>
          </tbody>
        </table>
        <h3>Trust — four checks</h3>
        <p>
          Weights: Data completeness 30%, Analyst coverage 25%, Target dispersion 25%,
          Insider activity 20%.
        </p>
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>What is scored</th>
              <th>Score</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Data completeness</td>
              <td>Whether every input the model needs is present</td>
              <td>All present, no adjustment → 100 · A one-off adjustment was applied → 80 · One documented gap → 90 · Two gaps → 75 · Three or more gaps → 65 (an adjustment caps the score at 80)</td>
            </tr>
            <tr>
              <td>Analyst coverage</td>
              <td>How many analysts publish a view</td>
              <td>30 or more → 100 · 10 or more → 80 · Fewer than 10 → 50</td>
            </tr>
            <tr>
              <td>Target dispersion</td>
              <td>How far apart analysts&rsquo; targets are (spread &divide; mean)</td>
              <td>&le;30% → 100 · &le;60% → 80 · &le;100% → 60 · Above 100% → 40</td>
            </tr>
            <tr>
              <td>Insider activity</td>
              <td>Buying and selling by insiders in the last 90 days</td>
              <td>No insider data → 50 (neutral — never read as &ldquo;no selling&rdquo;) · Sales only, $500M or more → 35 · Sales only, under $500M → 45 · Mixed buying and selling → 60</td>
            </tr>
          </tbody>
        </table>
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
          <li>
            <Link href="#how-scoring-works">How scoring works</Link>
          </li>
        </ul>
        <p className="footnote">
          Prices at the {RESULTS.price_date} close; engine run {RESULTS.as_of}.
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
        <p>
          For banks and property companies whose cash-flow statement carries no meaningful
          capital-spending line, this estimate is skipped — their reported cash flow is
          dominated by deposits and trading flows, not by the cash the business generates
          for its owners. The card says so, and the fair value uses the other two estimates.
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
        <p>
          On each stock card, the Lynch value panel beside the DCF grid shows this same
          estimate the way Peter Lynch framed it: a stock is fairly priced when its P/E
          equals its growth rate, so the fair price is EPS &times; (growth + dividend
          yield). It uses the same growth (capped at 30%, or by the guardrail where the
          growth is not supported by revenue growth), the same dividend yield, and the same
          P/E as the PEGY leg — the EPS is the one behind that P/E, adjusted where a
          one-off adjustment applies. The Lynch value is the PEGY leg, shown with its
          inputs; it is a comparison only and never changes the fair value, score or
          verdict. Where earnings are negative or no growth estimate exists, the panel
          says so instead of showing a number.
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
        <p>
          When only two of the three estimates can be computed, the fair value is their
          average, and the card names the two. Names whose fair value comes out at or below
          zero are not published.
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
          plausible assumption. The grid also carries the stock&rsquo;s own growth rate as
          its own row, highlighted at the 5.0% risk-free rate, so the published value always
          sits on the grid itself.
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
        <p>
          Where no beta is published for a name, the beta used here is computed from a year
          of daily returns against the S&amp;P 500.
        </p>
      </section>

      <Card title="(h) ETFs — two reads, no fair value" id="etfs">
        <p>
          ETFs are a separate product on this site, with a different method. An ETF holds a
          basket of securities, not a business — it has no earnings to value, so it never
          gets a fair value, a verdict, or an overall score. What it gets is two reads,
          each with its own evidence, and they are never combined into one number. The
          Technical and Momentum reads are informational only — they are not a
          recommendation to buy or sell any fund.
        </p>
        <p>
          <strong>Technical score (0–100)</strong> — the stock engine&apos;s Technical
          pillar, exactly: EMA trend (35%), price vs the 200-day average (25%), RSI (20%),
          MACD histogram (20%), with the same bands. Strong ≥ 70, Mixed 40–69, Weak
          &lt; 40.
        </p>
        <p>
          <strong>Momentum Score</strong> — 0.5 × 13-week total return + 0.3 × 4-week
          total return + 0.2 × 1-week total return, dividends included (Yahoo adjusted
          closes). Building ≥ +5%, Flat −5% to +5%, Fading &lt; −5%.
        </p>
        <p>
          <strong>Types stay distinct.</strong> Equity, bond, commodity and leveraged
          funds are badged in different colours and filtered separately. Bond and commodity
          funds behave differently from equity funds. Leveraged funds reset their leverage
          daily — they are flagged, kept out of the shared momentum sort, and compared
          only with other leveraged funds.
        </p>
        <p>
          <strong>Data.</strong> Prices and technicals come from the TradingView scanner
          and Yahoo Finance daily history, refreshed nightly with the stock refresh. Fund
          facts (expense ratio, assets, yield, holdings, inception, top-10 holdings) come
          from stockanalysis.com and refresh weekly. The ETF universe (55 funds) is
          curated from the tracker sheet; one ticker was replaced at launch because its
          symbol no longer exists — SPLG was renamed SPYM by State Street in October
          2025, so the board carries SPYM. GLD holds physical gold bullion, not stocks,
          so its card shows that instead of a holdings table.
        </p>
        <p>
          <Link href="/etfs">The ETF board →</Link>
        </p>
      </Card>
    </>
  )
}
