import type { Metadata } from 'next'
import Link from 'next/link'
import { Card } from '@/components/ui'
import { RESULTS, money } from '@/lib/data'
import {
  SECTOR_MULTIPLES,
  SECTOR_TABLE_SOURCE,
  SECTOR_TABLE_NOTE,
  PILLAR_WEIGHTS,
  BACKTEST_V2,
  BACKTEST_WIDE,
  BACKTEST_V3_CAPM,
  TRIANGULATION_DECISION,
  PRICE_DATE,
  ENGINE_VERSION,
} from '@/lib/site'

export const metadata: Metadata = {
  title: 'Methodology',
  description:
    'The full recipe: five pillars, three valuation legs, verdict gates, the valuation ladder, the CAPM cross-check and the backtests. SPEC v1.1, engine v1.3.',
}

const TICKERS = Object.entries(RESULTS.tickers)

export default function MethodologyPage() {
  return (
    <>
      <h1>Methodology</h1>
      <p className="page-intro">
        The full recipe, frozen as SPEC v1.1 and run by {ENGINE_VERSION}. Prices as of the{' '}
        {PRICE_DATE} close. Nothing on this page is a black box: every weight, threshold and
        locked parameter is printed below, and any change to one needs explicit approval and a
        new spec version.
      </p>

      <div className="callout">
        <strong>Research and education only — not investment advice.</strong> Fair values are
        model estimates built from stated assumptions, not predictions. The ladder is valuation
        context, not a buy or sell signal. See Terms for the full position.
      </div>

      <Card title="(a) What the score is">
        <p>
          Every stock gets an <strong>overall score from 0 to 100</strong>, the weighted mean of
          five pillars, each scored 0–100:
        </p>
        <table>
          <thead>
            <tr>
              <th>Pillar</th>
              <th className="num">Weight</th>
            </tr>
          </thead>
          <tbody>
            {PILLAR_WEIGHTS.map((p) => (
              <tr key={p.key}>
                <td>{p.label}</td>
                <td className="num">{p.weight}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">
          Overall = 25% Conviction + 30% Valuation + 20% Quality + 10% Technical + 15% Trust.
          Valuation carries the most weight because the question this site answers is whether
          the price is reasonable for what the business earns — but no single pillar can carry
          a stock on its own: the verdict gates below can veto a high overall score.
        </p>
        <h3>What is scored today</h3>
        <table>
          <thead>
            <tr>
              <th>Stock</th>
              <th>Verdict</th>
              <th className="num">Score</th>
              <th className="num">Price</th>
              <th className="num">Fair value</th>
            </tr>
          </thead>
          <tbody>
            {TICKERS.map(([symbol, t]) => (
              <tr key={symbol}>
                <td>
                  <strong>{symbol}</strong>
                  <br />
                  <span className="footnote">{t.name}</span>
                </td>
                <td>{t.verdict}</td>
                <td className="num">{t.overall_score.toFixed(1)}</td>
                <td className="num">{money(t.price)}</td>
                <td className="num">{money(t.triangulated_fv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">
          Thirteen tickers are scored so far. The universe expands from here; the recipe does not
          change when it does.
        </p>
      </Card>

      <Card title="(b) Each pillar's recipe">
        <h3>Conviction (25%) — the Story-Tracker</h3>
        <p>
          Conviction is the mean of two sub-scores, <strong>Story</strong> and{' '}
          <strong>Financials</strong>:
        </p>
        <ul>
          <li>
            Story = 35% forward revenue growth + 30% price leadership + 20% analyst revisions
            + 15% theme strength.
          </li>
          <li>
            Financials = 30% revenue growth + 30% profitability + 20% cash flow + 20%
            acceleration.
          </li>
        </ul>

        <h3>Valuation (30%) — median of three legs</h3>
        <p>
          The fair value is the <strong>median of three independent legs</strong> — DCF, PEGY
          and Forward-sector. The median is deliberate: it blunts whichever leg is most wrong
          on a given name (see (f) for the measurement behind keeping it).
        </p>
        <ul>
          <li>
            <strong>DCF leg (locked set):</strong> risk-free rate 5.00%; discount rate 10.0%
            for low-beta names and 12.0% for NVDA; terminal growth 2.5%; five-year growth
            capped at 20%; NVDA&rsquo;s normalised base free-cash-flow per share $4.80. These
            are locked parameters — they do not move with the market.
          </li>
          <li>
            <strong>PEGY leg:</strong> PEGY = (growth% + dividend yield%) &divide; P/E, with
            growth capped at 30%, computed on a non-GAAP basis consistently.
          </li>
          <li>
            <strong>Forward-sector leg:</strong> next-year EPS &times; the stock&rsquo;s GICS
            sector forward P/E, discounted 10% for one year.
          </li>
        </ul>
        <h3>Sector forward P/E table</h3>
        <table>
          <thead>
            <tr>
              <th>Sector</th>
              <th className="num">Forward P/E</th>
              <th className="num">5-yr avg</th>
              <th className="num">10-yr avg</th>
            </tr>
          </thead>
          <tbody>
            {SECTOR_MULTIPLES.map((s) => (
              <tr key={s.sector}>
                <td>{s.sector}</td>
                <td className="num">{s.forwardPE.toFixed(1)}&times;</td>
                <td className="num">{s.avg5y}</td>
                <td className="num">{s.avg10y}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">
          Source: {SECTOR_TABLE_SOURCE}. {SECTOR_TABLE_NOTE}
        </p>
        <h3>ONEOFF-v1 — one-off items</h3>
        <p>
          Reported earnings can include one-off gains or charges that say nothing about the
          operating business. ONEOFF-v1 strips them out before any P/E is computed — and shows
          both variants, adjusted and unadjusted, so the adjustment is checkable.
        </p>
        <ul>
          <li>
            <strong>T1 — detection:</strong> a quarterly net-income item is flagged when it
            deviates by more than 50% from the year-ago quarter or from the mean of the prior
            four quarters, <em>and</em> the absolute deviation is more than 10% of trailing
            twelve-month net income. A comparison-quarter test is applied alongside it.
          </li>
          <li>
            <strong>T2 — attribution hierarchy:</strong> the adjustment uses the
            company-disclosed adjusted figure first; failing that, the after-tax effect taken
            from the filing; failing that, the pre-tax effect &times; (1 &minus; 21%),
            flagged as an estimate.
          </li>
        </ul>
        <p className="footnote">
          Applied example: GOOGL — $99.1B of equity-security marks removed from earnings before
          the P/E was computed, with both variants shown.
        </p>

        <h3>Quality / Forensics (20%)</h3>
        <p>Sub-scores and weights:</p>
        <ul>
          <li>Operating cash flow / net income — 25%</li>
          <li>Accruals — 20%</li>
          <li>Receivables — 15%</li>
          <li>Free-cash-flow conversion — 20%</li>
          <li>Return on assets — 10%</li>
          <li>Leverage — 10%</li>
        </ul>

        <h3>Technical / Timing (10%)</h3>
        <p>
          EMA trend 35%, price vs 200-day moving average 25%, RSI 20%, MACD 20%. This pillar is
          labelled <strong>TIMING</strong>: it says something about when, never about whether a
          business is worth owning.
        </p>

        <h3>Trust (15%)</h3>
        <p>
          Completeness 30%, analyst coverage 25%, target dispersion 25%, insider activity 20%.
          There is <strong>no insider feed</strong> in this build, so the insider component is
          neutral / missing — it is never read as &ldquo;no selling&rdquo;.
        </p>
      </Card>

      <Card title="(c) Verdict gates">
        <p>
          The overall score proposes; the gates dispose. A stock&rsquo;s verdict is decided by
          these rules, in this order:
        </p>
        <table>
          <thead>
            <tr>
              <th>Verdict</th>
              <th>Conditions (all must hold)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Avoid</strong>
              </td>
              <td>
                Overall score below 45, <em>or</em> Valuation below 30, <em>or</em> Quality
                below 40, <em>or</em> price at or above the Exit ladder level.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Growth</strong>
              </td>
              <td>
                Overall &ge; 60 and upside &ge; 0% and Quality &ge; 55 and Conviction &ge; 50
                and 3-year revenue CAGR &ge; 10%.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Value</strong>
              </td>
              <td>
                Overall &ge; 60 and upside &ge; +25% and Quality &ge; 60 and Conviction &ge; 50
                and 3-year revenue CAGR &lt; 15%. Growth is checked first — a stock that
                qualifies for both is Growth.
              </td>
            </tr>
            <tr>
              <td>
                <strong>Watch</strong>
              </td>
              <td>Everything else.</td>
            </tr>
          </tbody>
        </table>
        <p>
          <strong>Hysteresis.</strong> A verdict changes only if the overall score moves at
          least 5 points across a threshold, or a gate flips on two consecutive runs. This
          stops verdicts flickering on noise.
        </p>
      </Card>

      <Card title="(d) The ladder — valuation context, not buy/sell instructions">
        <p>
          The ladder marks where the price sits against the triangulated fair value: Heavy at
          0.60&times;, Buy at 0.80&times;, Fair at 1.00&times;, Exit at 1.20&times; fair value.
          It is <strong>valuation context</strong> — a way to see how far the price is from our
          estimate — not an instruction to buy or sell at any level. No level on the ladder is
          a recommendation.
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
          <li>{BACKTEST_V3_CAPM.note}</li>
        </ul>
        <p className="footnote">
          Read plainly: stocks above Exit did not underperform stocks below Buy — in the wide
          backtest they did better. The ladder does not separate forward returns, so it is
          published as context and never as a signal.
        </p>
      </Card>

      <Card title="(e) CAPM cross-check — display only">
        <p>
          A second DCF is computed with a CAPM discount rate, as a cross-check on the locked
          decision DCF. It is <strong>display-only</strong>: it does not change any fair value,
          score or verdict.
        </p>
        <p>
          Formula: r = 10-year Treasury yield + adjusted beta &times; Damodaran implied
          equity risk premium, where adjusted beta = 0.67 &times; raw beta + 0.33. Inputs:
          10-year Treasury 5.10% as of 2026-11-12 (FRED series DGS10); Damodaran implied ERP
          4.41% as of 2026-11-01.
        </p>
        <table>
          <thead>
            <tr>
              <th>Stock</th>
              <th className="num">Raw beta &rarr; adjusted</th>
              <th className="num">CAPM discount</th>
              <th className="num">Decision DCF</th>
              <th className="num">CAPM cross-check DCF</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>NVDA</td>
              <td className="num">2.247 &rarr; 1.835</td>
              <td className="num">13.19%</td>
              <td className="num">$102.78 @ 12.0%</td>
              <td className="num">$90.29</td>
            </tr>
            <tr>
              <td>AAPL</td>
              <td className="num">1.089 &rarr; 1.060</td>
              <td className="num">9.77%</td>
              <td className="num">$200.71</td>
              <td className="num">$207.30</td>
            </tr>
            <tr>
              <td>MSFT</td>
              <td className="num">1.045 &rarr; 1.030</td>
              <td className="num">9.64%</td>
              <td className="num">$203.37</td>
              <td className="num">$214.21</td>
            </tr>
            <tr>
              <td>GOOGL</td>
              <td className="num">1.226 &rarr; 1.151</td>
              <td className="num">10.18%</td>
              <td className="num">$36.25</td>
              <td className="num">$35.37</td>
            </tr>
            <tr>
              <td>NVO</td>
              <td className="num">0.368 &rarr; 0.577</td>
              <td className="num">7.64%</td>
              <td className="num">Skipped (DKK)</td>
              <td className="num">Skipped</td>
            </tr>
          </tbody>
        </table>
        <p className="footnote">
          NVO reports in Danish krone and the DCF&rsquo;s dollar basis is unverified, so its DCF
          — and therefore its CAPM cross-check — is skipped rather than guessed. Backtest v3
          measured the CAPM variant on the full universe ({BACKTEST_V3_CAPM.belowBuy6m} below
          Buy vs {BACKTEST_V3_CAPM.aboveExit6m} above Exit over six months; correlations{' '}
          {BACKTEST_V3_CAPM.correlations}) and found it does not separate returns better — which
          is why it stays display-only.
        </p>
      </Card>

      <Card title="(f) Triangulation — median-of-three, kept">
        <p>{TRIANGULATION_DECISION.label}.</p>
        <ul>
          <li>{TRIANGULATION_DECISION.median}.</li>
          <li>{TRIANGULATION_DECISION.bestWeighted}.</li>
        </ul>
        <p>{TRIANGULATION_DECISION.verdict}</p>
      </Card>

      <Card title="(g) Data sources & cadence">
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
              <td>Monthly, 1st of the month</td>
            </tr>
            <tr>
              <td>Sector multiples</td>
              <td>FactSet Earnings Insight</td>
              <td>Quarterly</td>
            </tr>
          </tbody>
        </table>
        <p className="footnote">
          One field is deliberately discarded: Yahoo&rsquo;s freeCashflow field was found wrong,
          so free cash flow is taken from the quarterly cash-flow statement instead.
        </p>
      </Card>

      <Card title="(h) Change control">
        <p>
          The weights, thresholds, verdict gates, ladder ratios and locked DCF parameters on
          this page are frozen under SPEC v1.1. Any change to a weight, threshold, gate, ladder
          ratio or locked parameter needs explicit approval and a new spec version — the engine
          version, the results and this page move together, and no number changes silently.
        </p>
      </Card>

      <Card title="(i) How we compare with Stock Verdicts">
        <p>
          Stock Verdicts (stockverdicts.com) is the closest comparable site: a free,
          rules-based engine with the same shape of output — a verdict, four scores and a
          price ladder per stock. The difference is auditability. Their methodology page states
          that the formulas, thresholds, sector benchmarks and weightings are proprietary, and
          the only exact formulas they publish are Sector Rotation&rsquo;s. We publish the full
          recipe above, and we checked their published numbers against it — including a fair
          value that implies roughly 36&times; forward EPS against a stated 22&times;
          multiple (MSFT) and a krone EPS figure used as dollars (NVO). The full comparison,
          with the 13-ticker side-by-side table, is on the{' '}
          <Link href="/vs-stock-verdicts">How we compare with Stock Verdicts</Link> page.
        </p>
      </Card>
    </>
  )
}
