import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, scoreSpan } from '@/components/ui'
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
                <td className="num">{scoreSpan(t.overall_score)}</td>
                <td className="num">{money(t.price)}</td>
                <td className="num">{money(t.triangulated_fv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">
          {TICKERS.length} tickers are scored so far. The universe expands from here; the recipe does not
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
            for low-beta names and 12.0% for high-beta names (raw beta of 2.0 or more — 22 of
            the 227 names); terminal growth 2.5%; five-year growth
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
          </tbody>
        </table>
        <p className="footnote">
          Every name in the published 227-name universe has a computed DCF leg and therefore
          a computed CAPM cross-check — no leg is skipped, so no cross-check is skipped
          either. Backtest v3
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

      {/* Reading cards — every metric, explained */}
      <Card title="Reading cards — every metric, explained">
        <p>
          Every number on a stock card, explained in plain language: what it is,
          what every term means, exactly how it is computed — with a worked
          example — and how to read it. Scores are on a 0–100 scale unless stated
          otherwise. A fair value is our estimate of what a share is worth on our
          three valuation legs — it is research, not a buy or sell recommendation.
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
            <Link href="#triangulated-fv">Triangulated fair value</Link>
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
          Card text shows inputs rounded for readability; the engine stores full
          precision, so recomputing from the rounded figures can differ by a few
          cents from the stored value — the stored value is the correct one.
        </p>
      </Card>

      <section id="dcf-leg" className="card">
        <h2>DCF leg</h2>
        <h3>What it is</h3>
        <p>DCF stands for discounted cash flow. It answers one question: if a company kept generating cash for its owners, what is all that future cash worth today? Money in the future is worth less than money now, so each future year's cash is "discounted" — shrunk by a fixed percentage — before it is added up. The result is a fair value per share.</p>
        <h3>Every term, defined</h3>
        <ul>
          <li><strong>Free cash flow (FCF).</strong> The cash a company generates from running its business, after paying for the equipment and buildings it needs to keep operating. It is the cash that could, in theory, be handed to shareholders. We use the trailing twelve months (TTM) — the last four reported quarters added together.</li>
          <li><strong>FCF per share.</strong> Total free cash flow divided by the number of shares. It puts the cash on a per-share basis so it can be compared with the share price.</li>
          <li><strong>Projection.</strong> Our forecast of FCF per share for each of the next five years. We grow today's FCF per share by one growth rate each year.</li>
          <li><strong>Growth rate.</strong> How fast we assume FCF per share grows each year for five years. We use the company's implied five-year earnings growth, capped at 20%. The cap stops one hot forecast from producing a fantasy value.</li>
          <li><strong>Discount rate.</strong> The percentage used to shrink future cash to today's value. It is our charge for waiting and for risk: a higher discount rate means a lower value today. We use a fixed 10.0% for most names and 12.0% for high-beta names (raw beta of 2.0 or more — 22 of the 227 names, including NVDA at 2.247).</li>
          <li><strong>Terminal value.</strong> The value of all the cash the company will generate after our five-year forecast ends, boiled down to a single number at the end of year five. It assumes cash keeps growing forever at the terminal growth rate.</li>
          <li><strong>Terminal growth rate.</strong> The forever-growth rate used in the terminal value. Locked at 2.5% — roughly long-run inflation plus a little real growth.</li>
          <li><strong>Risk-free rate.</strong> The return on a loan to the US government, which is treated as risk-free. Our locked decision rate is 5.00%. (The live 10-year Treasury yield, 5.10%, is used only in the CAPM cross-check card, not here.)</li>
          <li><strong>Beta.</strong> A measure of how much a stock moves compared with the whole market. A beta above 1.0 means the stock usually moves more than the market; below 1.0 means it usually moves less.</li>
          <li><strong>Per-share.</strong> Divided by the number of shares, so the value can be compared with the price of one share.</li>
        </ul>
        <h3>How it's computed</h3>
        <p><strong>Formula.</strong> For each year t = 1 to 5, projected FCF per share = base FCF/share × (1 + growth)^t. Each year's cash is discounted: present value = projected cash ÷ (1 + discount rate)^t. Terminal value = year-5 cash × (1 + terminal growth) ÷ (discount rate − terminal growth), then discounted back five years the same way. DCF leg = sum of the five discounted years + discounted terminal value.</p>
        <p><strong>Worked example — Eli Lilly (LLY).</strong> Base FCF/share $13.06, growth 20%, discount 10.0%, terminal growth 2.5% (all from <code>results.json</code>, LLY DCF leg method text).</p>
        <table>
          <thead>
            <tr>
              <th>Year</th>
              <th className="num">Projected FCF/share</th>
              <th className="num">Discounted to today</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td className="num">$13.06 × 1.20 = $15.67</td>
              <td className="num">$15.67 ÷ 1.10 = $14.25</td>
            </tr>
            <tr>
              <td>2</td>
              <td className="num">$13.06 × 1.20² = $18.81</td>
              <td className="num">$18.81 ÷ 1.10² = $15.54</td>
            </tr>
            <tr>
              <td>3</td>
              <td className="num">$13.06 × 1.20³ = $22.57</td>
              <td className="num">$22.57 ÷ 1.10³ = $16.96</td>
            </tr>
            <tr>
              <td>4</td>
              <td className="num">$13.06 × 1.20⁴ = $27.08</td>
              <td className="num">$27.08 ÷ 1.10⁴ = $18.50</td>
            </tr>
            <tr>
              <td>5</td>
              <td className="num">$13.06 × 1.20⁵ = $32.50</td>
              <td className="num">$32.50 ÷ 1.10⁵ = $20.18</td>
            </tr>
          </tbody>
        </table>
        <p>Sum of the five discounted years: $14.25 + $15.54 + $16.96 + $18.50 + $20.18 = <strong>$85.42</strong>.</p>
        <p>Terminal value at end of year 5: $32.50 × 1.025 ÷ (0.10 − 0.025) = $33.31 ÷ 0.075 = <strong>$444.13</strong>. Discounted back five years: $444.13 ÷ 1.10⁵ = <strong>$275.77</strong>.</p>
        <p>DCF leg = $85.42 + $275.77 = <strong>$361.19</strong>. That is the stored LLY DCF leg.</p>
        <p><strong>Second example — NVIDIA (NVDA).</strong> NVDA is the exception that proves the rules. Its base is not its own TTM FCF/share but a normalised $4.80 per share — a blend of its FY26 actuals (about $4.01) and its TTM figure ($5.21) — because a single year of surging cash flow would overstate the base. Growth is 20% (capped) and the discount is 12.0% (high-beta tier, raw beta 2.247). The same maths gives $102.78: five discounted years sum to $29.66, terminal value $128.87 discounted to $73.12, $29.66 + $73.12 = <strong>$102.78</strong>.</p>
        <h3>How to read it</h3>
        <p>A higher DCF leg means the company's cash flow, at the assumed growth, supports a higher price. A DCF leg far below the share price means the market is paying for growth or earnings that this cash-flow view does not support. The DCF leg is the most assumption-sensitive of the three legs: small changes in growth or the discount rate move it a lot — which is why the sensitivity grid card exists.</p>
        <h3>Source + as-of</h3>
        <p>FCF from Yahoo Finance quarterly cash-flow statements (TTM = last four quarters summed; Yahoo's <code>info.freeCashflow</code> field is discarded — it was proven stale). Implied five-year EPS growth from Yahoo. Prices at the 13 November 2026 close; engine run 16 November 2026. Locked parameters (risk-free 5.00%, discount 10.0%/12.0%, terminal growth 2.5%, growth cap 20%) are frozen in SPEC v1.1 and do not change between runs.</p>
        <p><strong>Skip cases.</strong> No name in the published 227-name universe has a skipped DCF leg: every published fair value is the median of three legs. The engine still has a skip path — it skips the leg, rather than guessing it, when the per-share cash-flow basis cannot be verified in dollars (for example, a name reporting in another currency) or when &ldquo;free cash flow&rdquo; is not meaningful for the business (for example, a bank, whose operating cash flow is dominated by deposit and trading flows — Yahoo&rsquo;s FCF row for a bank equals operating cash flow, and StockAnalysis publishes no FCF for banks at all). Two names the site previously published used that path — NVO (Danish-krone reporting) and JPM (bank cash flow, TTM −$84.16B, or −$30.41 per share) — and both are unpublished in the current build, which publishes only three-leg names. When a leg was skipped, the fair value was the mean of the two remaining legs and the skip was flagged on the card.</p>
        <p><strong>Negative leg — AMZN.</strong> Amazon's DCF leg is <strong>−$107.54</strong>, because its TTM FCF/share is −$4.30: heavy capital spending made its trailing free cash flow negative (Yahoo-row FCF −$46.89B; Amazon's own reported figure is −$42.4B, which adds back about $4.5B of property-sale proceeds — we use the Yahoo row, per the frozen method). A negative DCF leg looks alarming, but it does not drag the fair value negative: our fair value is the <strong>median</strong> of the three legs, and the median of (−$107.54, $147.69, $249.31) is $147.69 — the DCF leg is simply the lowest of the three and the median ignores it. That is exactly what the median is for.</p>
      </section>

      <section id="pegy-leg" className="card">
        <h2>PEGY leg</h2>
        <h3>What it is</h3>
        <p>PEGY is Peter Lynch's growth-and-income version of the PEG ratio. It asks: is the price you pay for each dollar of earnings reasonable, once you count how fast earnings are growing and the dividend you collect while you wait? If growth plus dividend yield is high compared with the P/E ratio, the stock looks cheap on this view; if it is low, it looks expensive.</p>
        <h3>Every term, defined</h3>
        <ul>
          <li><strong>P/E ratio (price-to-earnings).</strong> The share price divided by earnings per share over the last twelve months. A P/E of 20 means you pay $20 for each $1 of yearly earnings. Higher P/E means you pay more for the same earnings.</li>
          <li><strong>Earnings growth.</strong> How fast earnings per share are expected to grow each year over the next five years. We use the implied five-year EPS growth, capped at 30% for this leg.</li>
          <li><strong>Dividend yield.</strong> The yearly dividend per share divided by the share price, as a percentage. It is the cash income you get just for holding the stock.</li>
          <li><strong>Non-GAAP earnings.</strong> Earnings as the company reports them after stripping out items it calls one-off or non-cash — as opposed to GAAP earnings, the strict accounting figure. We use non-GAAP earnings consistently for this leg, because that is the basis analysts' growth forecasts use.</li>
          <li><strong>One-off items.</strong> Large, unusual gains or losses that are not part of normal business — a tax windfall, a legal settlement, a one-time investment gain. Where a material one-off distorts earnings, we remove it before computing P/E (see the ONEOFF-v1 rule in the Source note below).</li>
          <li><strong>PEGY.</strong> The number you get from (earnings growth % + dividend yield %) ÷ P/E. A PEGY above 1.0 means growth plus dividends exceed the P/E — cheap on this view. Below 1.0 means the opposite.</li>
          <li><strong>Fair value (this leg).</strong> Share price × PEGY. It is the price at which PEGY would equal exactly 1.0.</li>
        </ul>
        <h3>How it's computed</h3>
        <p><strong>Formula.</strong> PEGY = (earnings growth % + dividend yield %) ÷ trailing P/E. Fair value = share price × PEGY. Growth is capped at 30%; the uncapped value is stored for audit.</p>
        <p><strong>Worked example — Eli Lilly (LLY).</strong> Growth used 30.0% (capped at 30%; uncapped growth would give PEGY 0.762), dividend yield 0.46%, trailing P/E 46.85.</p>
        <p>PEGY = (30.0 + 0.46) ÷ 46.85 = 30.46 ÷ 46.85 = <strong>0.650</strong>.</p>
        <p>Fair value = $1,443.50 × 0.650 = <strong>$938.51</strong>. (Using the unrounded PEGY 0.65016 gives $938.51 exactly; the card shows PEGY rounded to 0.650.)</p>
        <p><strong>Second example — NVIDIA (NVDA).</strong> Growth 30.0% (capped), dividend yield 0.17%, trailing P/E 20.59. PEGY = (30.0 + 0.17) ÷ 20.59 = 30.17 ÷ 20.59 = <strong>1.465</strong>. Fair value = $162.85 × 1.465 = <strong>$238.62</strong>. NVDA's uncapped PEGY is 5.008 — its uncapped implied growth is far above the 30% cap, and the cap is what keeps this leg grounded.</p>
        <h3>How to read it</h3>
        <p>PEGY above 1.0 means the stock looks cheap on growth-plus-income versus its P/E; below 1.0 means it looks expensive. LLY at 0.650 and NVDA at 1.465 sit on opposite sides of that line. Remember the leg is only as good as the growth forecast: a capped 30% growth rate is an assumption, not a promise.</p>
        <h3>Source + as-of</h3>
        <p>Trailing P/E and dividend yield from Yahoo Finance; implied five-year EPS growth from Yahoo's PEG (trailing P/E ÷ Yahoo PEG). Non-GAAP earnings basis throughout. Prices at the 13 November 2026 close; engine run 16 November 2026.</p>
        <p><strong>One-off adjustments (ONEOFF-v1).</strong> Where a material one-off distorts GAAP earnings, the trailing P/E used here is computed on <strong>adjusted</strong> earnings, and both variants are shown. <strong>GOOGL:</strong> three quarters of equity-securities gains and losses were removed — after-tax +$28.7B (Q1), +$77.1B (Q2) and −$6.7B (Q3), $99.1B net — giving adjusted TTM net income $136.6B and an adjusted trailing P/E of 26.65× (the unadjusted P/E would be far lower and would flatter the stock). The same rule adjusted five batch-2 names: AMZN (Q2 2026 Anthropic gain removed; adjusted P/E 31.38×), META (Q1 2026 $8.03B one-time tax benefit removed; 24.51×), TSLA (Q4 2025 $239M digital-assets loss added back; 399.17×), AVGO (Q4 FY25 $2.1B tax benefit removed; 46.89×) and BRK-B (Q2 2026 $12,684M investment gains removed; 19.86×). LLY's Q1 2026 profit jump was flagged but <strong>not</strong> adjusted — it was genuine operating growth (revenue +56% year on year), not a one-off.</p>
      </section>

      <section id="forward-sector-leg" className="card">
        <h2>Forward-sector leg</h2>
        <h3>What it is</h3>
        <p>This leg values a stock the way the market usually values it: take what analysts expect the company to earn per share next year, and multiply it by the price-to-earnings multiple that its sector currently trades at. Then knock 10% off, because next year's earnings are a forecast, not cash in hand. It is the most "market-priced" of our three legs.</p>
        <h3>Every term, defined</h3>
        <ul>
          <li><strong>Forward EPS.</strong> Analysts' consensus forecast of earnings per share for the next year (the coming fiscal year), in US dollars. "Forward" means it looks ahead; "EPS" is earnings per share.</li>
          <li><strong>Sector multiple.</strong> The average forward P/E ratio for the company's whole sector — how many dollars the market currently pays for $1 of next year's earnings across that sector. One multiple per sector, not per company.</li>
          <li><strong>FactSet.</strong> FactSet Research Systems, a financial data provider. Our sector multiples come from its weekly <em>Earnings Insight</em> report.</li>
          <li><strong>GICS sector.</strong> The Global Industry Classification Standard — the system that sorts every listed company into one of 11 sectors (Information Technology, Health Care, Financials, and so on).</li>
          <li><strong>Discount for one year (÷ 1.10).</strong> Next year's earnings are worth less than today's, so we divide by 1.10 — a 10% haircut for one year of waiting and forecast risk.</li>
          <li><strong>Cap and floor.</strong> The sector multiple is capped at 35× and floored at 10×, so an extreme sector reading cannot produce an extreme leg. Neither binds on the current table.</li>
        </ul>
        <h3>How it's computed</h3>
        <p><strong>Formula.</strong> Forward-sector leg = next-year EPS × sector forward P/E ÷ 1.10.</p>
        <p><strong>The sector table</strong> (FactSet Earnings Insight, 13 November 2026):</p>
        <table>
          <thead>
            <tr>
              <th>Sector</th>
              <th className="num">Forward P/E</th>
              <th className="num">Sector</th>
              <th className="num">Forward P/E</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Information Technology</td>
              <td className="num">18.0×</td>
              <td className="num">Industrials</td>
              <td className="num">22.5×</td>
            </tr>
            <tr>
              <td>Communication Services</td>
              <td className="num">16.8×</td>
              <td className="num">Materials</td>
              <td className="num">17.4×</td>
            </tr>
            <tr>
              <td>Health Care</td>
              <td className="num">20.0×</td>
              <td className="num">Real Estate</td>
              <td className="num">18.0×</td>
            </tr>
            <tr>
              <td>Consumer Discretionary</td>
              <td className="num">25.1×</td>
              <td className="num">Utilities</td>
              <td className="num">17.0×</td>
            </tr>
            <tr>
              <td>Consumer Staples</td>
              <td className="num">23.7×</td>
              <td className="num">Energy</td>
              <td className="num">12.2×</td>
            </tr>
            <tr>
              <td>Financials</td>
              <td className="num">15.1×</td>
              <td className="num">S&amp;P 500 (fallback)</td>
              <td className="num">18.3×</td>
            </tr>
          </tbody>
        </table>
        <p><strong>Worked example — Eli Lilly (LLY).</strong> Next-year EPS $50.80, Health Care forward P/E 20.0×. $50.80 × 20.0 ÷ 1.10 = <strong>$923.59</strong>. (The card shows EPS rounded to $50.80; the engine carries $50.79721, which is why the stored leg is $923.59 rather than the $923.64 the rounded figures give.)</p>
        <p><strong>Second example — NVIDIA (NVDA).</strong> Next-year EPS $15.85, Information Technology forward P/E 18.0×. $15.85 × 18.0 ÷ 1.10 = <strong>$259.42</strong>. (Same rounding note: the engine's EPS is $15.85369.)</p>
        <h3>How to read it</h3>
        <p>A higher sector multiple or higher forecast earnings means a higher leg. This leg is the highest of the three for 100 of the 227 names — it is the optimistic leg, because it takes analysts' forecasts at face value and applies today's sector pricing. If it is far above the other two legs, the fair value rests on forecasts, not on today's cash flow.</p>
        <h3>Source + as-of</h3>
        <p>Next-year EPS from Yahoo Finance analyst estimates. Sector multiples from FactSet <em>Earnings Insight</em>, 13 November 2026, refreshed quarterly (first Friday after quarter-end). Fallback chain if a sector multiple is missing: S&amp;P 500 forward P/E (18.3× on 13 November 2026), then the legacy fixed 22× as a flagged last resort. The old fixed-22× value is still stored for audit — for LLY it was $1,015.94, for NVDA $317.07. Prices at the 13 November 2026 close; engine run 16 November 2026.</p>
        <p><strong>Known flag — Visa (V).</strong> Yahoo's forward EPS for Visa is $17.14, but S&amp;P Global consensus FY2027 EPS is $15.03. We kept Yahoo's figure because Yahoo is the method's stated source, and the flag records the sensitivity: on the consensus figure the leg would be $206.32 instead of $235.29.</p>
      </section>

      <section id="triangulated-fv" className="card">
        <h2>Triangulated fair value</h2>
        <h3>What it is</h3>
        <p>Our fair value is not one model — it is the middle value of three different models (the DCF leg, the PEGY leg and the Forward-sector leg). That middle value is called the triangulated fair value. Using the middle value means no single model can dominate: if one leg is wildly optimistic or pessimistic, the other two outvote it.</p>
        <h3>Every term, defined</h3>
        <ul>
          <li><strong>Median.</strong> The middle value when three numbers are lined up from smallest to largest. With three legs, the median is simply the second one in order.</li>
          <li><strong>Mean (of two).</strong> When only two legs are available (a leg was skipped), the fair value is the ordinary average of the two — their sum divided by two.</li>
          <li><strong>Leg spread.</strong> The gap between the highest and lowest legs. A wide spread means the three models disagree a lot, so the fair value is less certain.</li>
          <li><strong>Upside.</strong> Fair value ÷ share price − 1, as a percentage. Positive upside means our fair value is above the price; negative means it is below.</li>
        </ul>
        <h3>How it's computed</h3>
        <p><strong>Formula.</strong> With three legs: fair value = median (middle) of the three. With two legs: fair value = mean of the two. Leg spread ÷ fair value is shown alongside, as a measure of disagreement.</p>
        <p><strong>Worked example — Eli Lilly (LLY).</strong> The three legs are DCF $361.19, PEGY $938.51 and Forward-sector $923.59. Lined up: $361.19, <strong>$923.59</strong>, $938.51. The middle one is $923.59, so the triangulated fair value is <strong>$923.59</strong>. Upside = $923.59 ÷ $1,443.50 − 1 = <strong>−36.0%</strong>. Leg spread = $938.51 − $361.19 = $577.32; spread ÷ fair value = $577.32 ÷ $923.59 = <strong>0.625</strong>.</p>
        <p><strong>Second example — NVIDIA (NVDA).</strong> Legs: DCF $102.78, PEGY $238.62, Forward-sector $259.42. Lined up: $102.78, <strong>$238.62</strong>, $259.42. The middle one is $238.62, so the fair value is <strong>$238.62</strong>. Upside = $238.62 ÷ $162.85 − 1 = <strong>+46.5%</strong>. Spread ÷ fair value = ($259.42 − $102.78) ÷ $238.62 = <strong>0.656</strong>.</p>
        <p><strong>Two legs never occur in the published universe.</strong> Every published fair value is the median of three legs (see the LLY and NVDA examples above). The engine&rsquo;s two-leg rule — the mean of the two available legs — applied to NVO and JPM when they were published; both are unpublished in the current build, which publishes only three-leg names.</p>
        <h3>How to read it</h3>
        <p>A fair value above the price (positive upside) means our three models, on balance, think the stock is worth more than it costs. Below the price (negative upside) means the opposite. A wide leg spread — above 0.75, and especially above 1.00 — means the models disagree sharply, so treat the fair value as a rough anchor, not a precise price. ICHR has the widest spread at 37.35 (fair value $2.23 on legs of −$26.55, $2.23 and $56.74); HE is next at 36.72.</p>
        <h3>Source + as-of</h3>
        <p>The three legs as computed on the DCF, PEGY and Forward-sector cards. Prices at the 13 November 2026 close; engine run 16 November 2026. Decision (Raj, 15 November 2026): keep the median-of-three. A wider backtest (2,498 rows) found no weighted mix of the legs separates future returns better than the median, so weighting was rejected — it would buy churn, not signal.</p>
      </section>

      <section id="conviction" className="card">
        <h2>Conviction</h2>
        <h3>What it is</h3>
        <p>Conviction measures whether the business itself is worth following: is the story getting better, and are the financials getting better? It is our own Story-Tracker score, reused exactly as published — the engine never recomputes it. It counts for 25% of the overall score.</p>
        <h3>Every term, defined</h3>
        <ul>
          <li><strong>Story sub-score.</strong> How the market story reads: expected revenue growth, whether the stock is leading the market, whether analysts are raising their estimates, and how strong the company's theme is (for example, AI infrastructure).</li>
          <li><strong>Financials sub-score.</strong> How the reported numbers read: revenue growth, profitability, cash flow, and whether growth is accelerating.</li>
          <li><strong>Revenue growth.</strong> How fast sales are rising, year on year.</li>
          <li><strong>Price leadership.</strong> Whether the stock has been outperforming the market — a sign the market is rewarding the story.</li>
          <li><strong>Estimate revisions.</strong> Whether analysts have been raising or cutting their earnings forecasts. Rising forecasts support the story; cuts undermine it.</li>
          <li><strong>Theme strength.</strong> How strongly the company sits in a powerful investment theme (such as AI, weight-loss drugs or cloud computing), ranked against the whole universe.</li>
          <li><strong>Profitability.</strong> Whether the company makes good money on its sales and its capital.</li>
          <li><strong>Acceleration.</strong> Whether growth is speeding up rather than slowing down.</li>
          <li><strong>Percentile rank.</strong> A score that says where a company stands against all 749 names in our watchlist universe — top third, middle third or bottom third.</li>
        </ul>
        <h3>How it's computed</h3>
        <p><strong>Formula.</strong> Conviction = (Story + Financials) ÷ 2.</p>
        <p>Story = 35% forward revenue growth + 30% price leadership + 20% estimate revisions + 15% theme strength (percentile ranks across the 749-name universe).</p>
        <p>Financials = 30% revenue growth + 30% profitability + 20% cash flow + 20% acceleration.</p>
        <p><strong>Worked example — Eli Lilly (LLY).</strong> Story 74.1, Financials 53.1. Conviction = (74.1 + 53.1) ÷ 2 = <strong>63.6</strong>. NVDA: Story 65.8, Financials 73.5, Conviction = (65.8 + 73.5) ÷ 2 = <strong>69.7</strong>.</p>
        <p>A "strong" label needs more than a high score: the Story side needs top-third ranking plus next-year revenue growth above zero and a price at or above 0.95× its 200-day average, and the Financials side needs revenue growing year on year. A small 4-point cushion (hysteresis) stops the label flickering on and off with daily noise.</p>
        <h3>How to read it</h3>
        <p>Above 50 is decent conviction; the Growth verdict requires conviction of at least 50. High conviction with a low valuation score means a good business at a price we cannot support — that is LLY (conviction 63.6, valuation 14.0, verdict Avoid). Low conviction caps what any verdict can be: a name our own tracker rates poorly cannot be called Growth on valuation alone. That rule is what keeps ADBE (conviction 46.3) at Watch even though its overall score is 77.2.</p>
        <h3>Source + as-of</h3>
        <p>Story-Tracker, run weekly on Monday before the market opens; the run date is shown on the card. Universe: our 749-name watchlist. Tickers outside that universe get a "conviction not scored" state, never a guessed score. GOOGL uses GOOG (class C shares) as its proxy — flagged on the card. Scores shown here are from the run behind the 16 November 2026 engine run.</p>
      </section>

      <section id="valuation" className="card">
        <h2>Valuation</h2>
        <h3>What it is</h3>
        <p>Valuation turns the triangulated fair value into a 0–100 score: how cheap or expensive is the stock against our own fair value? It counts for 30% of the overall score — the largest single weight, because price paid is the largest single driver of future returns.</p>
        <h3>Every term, defined</h3>
        <ul>
          <li><strong>Upside.</strong> Fair value ÷ share price − 1. Positive means our fair value is above the price (the stock looks cheap to us); negative means it is below (expensive to us).</li>
          <li><strong>Piecewise-linear scale.</strong> A score built by joining fixed points with straight lines: you look up where the upside falls between two fixed points and interpolate. It is a smooth ramp, not a cliff.</li>
          <li><strong>Leg-spread cap.</strong> A ceiling on the valuation score when the three legs disagree too much. If the legs are far apart, the fair value is uncertain, so the score is capped even if the upside looks good.</li>
          <li><strong>Pillar weights.</strong> How much each of the five pillars counts in the overall score: Conviction 25%, Valuation 30%, Quality 20%, Technical 10%, Trust 15%.</li>
        </ul>
        <h3>How it's computed</h3>
        <p><strong>Formula — valuation score from upside.</strong> Fixed points: −40% upside → 10; −25% → 25; −10% → 40; 0% → 55; +10% → 70; +25% → 85; +50% → 100. Between two points, interpolate in a straight line. Below −40% the score stays 10; above +50% it stays 100.</p>
        <p><strong>Leg-spread caps.</strong> If leg spread ÷ fair value is above 0.75, the score is capped at 65. If it is above 1.00, the score is capped at 55.</p>
        <p><strong>Worked example — Eli Lilly (LLY).</strong> Upside −36.0%. That sits between −40% (score 10) and −25% (score 25): 10 + (25 − 10) × (−36% + 40%) ÷ (−25% + 40%) = 10 + 15 × 4 ÷ 15 = <strong>14.0</strong>. Leg spread ÷ fair value is 0.625, below 0.75, so no cap applies. Valuation score <strong>14.0</strong>.</p>
        <p><strong>Second example — NVIDIA (NVDA).</strong> Upside +46.5%, between +25% (85) and +50% (100): 85 + (100 − 85) × (46.5% − 25%) ÷ (50% − 25%) = 85 + 15 × 21.5 ÷ 25 = <strong>97.9</strong>. Spread ÷ fair value is 0.656, so no cap. Valuation score <strong>97.9</strong>.</p>
        <p><strong>The cap, in action.</strong> In the previous engine version NVDA's valuation score was 65.0, not 97.9, with the fair value unchanged at $238.62. The Forward leg fell from $317.07 (old fixed 22×) to $259.42 (sector 18.0×), narrowing the leg spread from 0.898 to 0.656 and releasing the 65 cap. The business did not get better — the disagreement between the legs got smaller. The card says so explicitly whenever a score moves only because a cap released.</p>
        <p><strong>Formula — overall score.</strong> Overall = 0.25 × Conviction + 0.30 × Valuation + 0.20 × Quality + 0.10 × Technical + 0.15 × Trust.</p>
        <p><strong>Worked check — LLY.</strong> 63.6 × 0.25 + 14.0 × 0.30 + 76.0 × 0.20 + 89.0 × 0.10 + 79.0 × 0.15 = 15.90 + 4.20 + 15.20 + 8.90 + 11.85 = 56.05, shown as <strong>56.1</strong>. NVDA: 69.7 × 0.25 + 97.9 × 0.30 + 77.0 × 0.20 + 25.2 × 0.10 + 72.0 × 0.15 = 17.43 + 29.37 + 15.40 + 2.52 + 10.80 = 75.52, shown as <strong>75.5</strong>.</p>
        <p><strong>Verdict gates.</strong> <strong>Avoid</strong> if any of: overall below 45, valuation score below 30, quality below 40, or the price at or above our Exit level. <strong>Growth</strong> if overall ≥ 60 AND upside ≥ 0% AND quality ≥ 55 AND conviction ≥ 50 AND three-year revenue growth (CAGR) ≥ 10%. <strong>Value</strong> if overall ≥ 60 AND upside ≥ +25% AND quality ≥ 60 AND conviction ≥ 50 AND three-year revenue growth below 15% (Growth is checked first). Otherwise <strong>Watch</strong>. A verdict changes only if the overall score moves at least 5 points across a threshold, or a gate flips on two consecutive runs — a single-day wobble never flips a verdict.</p>
        <p><strong>Worked gate check — NVDA is Growth:</strong> overall 75.5 ≥ 60, upside +46% ≥ 0%, quality 77.0 ≥ 55, conviction 69.7 ≥ 50, three-year revenue growth 100% ≥ 10%. All five pass. <strong>LLY is Avoid:</strong> valuation 14.0 &lt; 30, and its price $1,443.50 is above our Exit level $1,108.31. <strong>AVGO shows the gates are absolute:</strong> its overall score is exactly 60.0, but it is Avoid because its valuation score is 15.6 — below 30.</p>
        <h3>How to read it</h3>
        <p>A valuation score under 30 is an Avoid gate on its own — no matter how good the rest of the card looks. A score near 100 means our fair value is far above the price. Always read the score together with the leg spread: a high score built on legs that disagree wildly is less trustworthy than the same score built on legs that agree.</p>
        <h3>Source + as-of</h3>
        <p>Upside and leg spread from the triangulated fair value (see that card). Weights, scale points, caps and gates are frozen in SPEC v1.1 §3–§4. Prices at the 13 November 2026 close; engine run 16 November 2026.</p>
      </section>

      <section id="quality" className="card">
        <h2>Quality</h2>
        <h3>What it is</h3>
        <p>Quality checks whether the reported profits are real. A company can report big earnings while generating little cash, stuffing its warehouses with unsold goods, or borrowing heavily. This pillar looks for those warning signs. It counts for 20% of the overall score.</p>
        <h3>Every term, defined</h3>
        <ul>
          <li><strong>Operating cash flow (OCF).</strong> The cash the business actually generated from its day-to-day operations. Unlike profit, cash cannot be faked by accounting choices.</li>
          <li><strong>Net income (NI).</strong> The company's reported profit after all expenses and taxes. OCF ÷ NI tells you how much of the profit arrived as cash: above 100% means more cash than profit — healthy.</li>
          <li><strong>Accruals (Sloan).</strong> The gap between profit and cash flow, scaled by assets. High accruals mean profit is running well ahead of cash — a classic earnings-quality warning sign. Named after Richard Sloan, who showed high-accrual companies tend to disappoint.</li>
          <li><strong>Receivables trend.</strong> Whether money owed by customers is growing faster than sales. If receivables swell, the company may be booking sales it has not collected — or stuffing the channel.</li>
          <li><strong>FCF conversion.</strong> Free cash flow ÷ net income. It asks how much of each dollar of profit turns into free cash after capital spending.</li>
          <li><strong>Return on assets (ROA).</strong> Net income ÷ total assets. How much profit the company squeezes from the assets it owns.</li>
          <li><strong>Leverage / debt-to-equity (D/E).</strong> Total debt ÷ shareholders' equity. How much the company owes compared with what its owners have put in. Higher means more debt and more risk.</li>
        </ul>
        <h3>How it's computed</h3>
        <p><strong>Formula.</strong> Quality = 25% OCF/NI + 20% accruals + 15% receivables trend + 20% FCF conversion + 10% ROA + 10% leverage. Each sub-score is 0–100, set by bands:</p>
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th className="num">100</th>
              <th className="num">75–85</th>
              <th className="num">40–70</th>
              <th className="num">20–45</th>
              <th className="num">20–35</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>OCF ÷ NI</td>
              <td className="num">above 100%</td>
              <td className="num">80–100%</td>
              <td className="num">60–80%</td>
              <td className="num">40–60%</td>
              <td className="num">below 40%</td>
            </tr>
            <tr>
              <td>Accruals (Sloan)</td>
              <td className="num">0 or below</td>
              <td className="num">up to 0.05</td>
              <td className="num">up to 0.10</td>
              <td className="num">above 0.10</td>
              <td className="num">—</td>
            </tr>
            <tr>
              <td>Receivables change (pp)</td>
              <td className="num">up to 1.0</td>
              <td className="num">up to 3.0</td>
              <td className="num">up to 5.0</td>
              <td className="num">above 5.0</td>
              <td className="num">—</td>
            </tr>
            <tr>
              <td>FCF conversion</td>
              <td className="num">above 80%</td>
              <td className="num">60–80%</td>
              <td className="num">40–60%</td>
              <td className="num">20–40%</td>
              <td className="num">below 20%</td>
            </tr>
            <tr>
              <td>ROA</td>
              <td className="num">above 30%</td>
              <td className="num">20–30%</td>
              <td className="num">15–20%</td>
              <td className="num">10–15%</td>
              <td className="num">below 10%</td>
            </tr>
            <tr>
              <td>Debt ÷ equity</td>
              <td className="num">up to 0.30</td>
              <td className="num">up to 0.60</td>
              <td className="num">up to 1.00</td>
              <td className="num">up to 2.00</td>
              <td className="num">above 2.00</td>
            </tr>
          </tbody>
        </table>
        <p><strong>Worked example — Eli Lilly (LLY).</strong> Sub-scores: OCF/NI 100 (OCF is 111% of NI), accruals 75 (Sloan 0.034), receivables 70 (change +2.81pp), FCF conversion 65 (42.4%), ROA 85 (21.1%), leverage 40 (D/E 1.23). Quality = 0.25×100 + 0.20×75 + 0.15×70 + 0.20×65 + 0.10×85 + 0.10×40 = 25 + 15 + 10.5 + 13 + 8.5 + 4 = <strong>76.0</strong>.</p>
        <p><strong>Second example — NVIDIA (NVDA).</strong> Sub-scores: OCF/NI 60 (OCF 69.7% of NI), accruals 50 (Sloan 0.084), receivables 100 (+0.14pp), FCF conversion 85 (65.8%), ROA 100 (53.6%), leverage 100 (D/E 0.17). Quality = 0.25×60 + 0.20×50 + 0.15×100 + 0.20×85 + 0.10×100 + 0.10×100 = 15 + 10 + 15 + 17 + 10 + 10 = <strong>77.0</strong>.</p>
        <h3>How to read it</h3>
        <p>Above 60 is solid; below 40 is an Avoid gate on its own. Watch the two cash checks first: if OCF is well below net income and FCF conversion is low, the profits are mostly accounting, not cash. A high debt-to-equity (above 2.0) scores only 20 and drags the pillar down.</p>
        <h3>Source + as-of</h3>
        <p>SEC filings (10-K/10-Q) via Yahoo Finance quarterly statements, with Yahoo cross-check; latest twelve months to the 13 November 2026 close; engine run 16 November 2026. Where a ONEOFF-v1 adjustment applies, OCF/NI and FCF conversion use <strong>adjusted</strong> net income (GOOGL and the five adjusted batch-2 names).</p>
        <p><strong>Bank artefact — no bank in the published universe.</strong> JPMorgan was previously published with this flag: its Quality score was 42.0, but two of its inputs were bank-flow artefacts, flagged not fixed — OCF/NI was −127.6% and FCF conversion −127.6%, because a bank&rsquo;s operating cash flow is dominated by deposit and trading flows, not by operating profit. Its gross margin showed 0.0 (a bank has no cost-of-goods line) and its receivables ratio used a balance-sheet line that is not trade receivables for a bank. The score was shown as computed, with the flags attached. JPM is unpublished in the current build, which publishes only three-leg names.</p>
      </section>

      <section id="technical" className="card">
        <h2>Technical (Timing)</h2>
        <h3>What it is</h3>
        <p>Technical, labelled <strong>Timing</strong> on the card, asks a narrow question: is now a good moment to act, based on the price chart alone? It says nothing about whether the business is good — that is the other pillars' job. It counts for 10% of the overall score, the smallest weight, because timing is the least reliable signal we use.</p>
        <h3>Every term, defined</h3>
        <ul>
          <li><strong>EMA (exponential moving average).</strong> The average price over the last 20, 50 or 200 days, with recent days weighted more heavily than old ones. EMA20 reacts fast; EMA200 is the slow, long-run trend.</li>
          <li><strong>Price vs 200-day.</strong> The share price compared with its 200-day average (EMA200). Above it means the long-run trend is up; below it means the trend is down.</li>
          <li><strong>RSI (Relative Strength Index).</strong> A 0–100 gauge of how fast the price has risen or fallen over the last 14 days. Above 70 is usually called overbought (risen fast); below 30 oversold (fallen fast). The middle (45–60) scores best here — not too hot, not too cold.</li>
          <li><strong>MACD (moving average convergence divergence).</strong> A trend gauge built from two moving averages. Its histogram (hist) is above zero when short-run momentum is stronger than long-run momentum, and below zero when it is weaker.</li>
        </ul>
        <h3>How it's computed</h3>
        <p><strong>Formula.</strong> Technical = 35% trend (EMA20/50/200) + 25% price vs 200-day + 20% RSI + 20% MACD.</p>
        <ul>
          <li><strong>Trend:</strong> 100 if price &gt; EMA20 &gt; EMA50 &gt; EMA200 (a clean uptrend); 75 if price &gt; EMA50 &gt; EMA200; 60 if price is above EMA50 or EMA200; 15 if price is below all three; 35 otherwise.</li>
          <li><strong>Price vs 200-day:</strong> +10% or more above → 100; 0 to +10% → 75; −10% to 0 → 45; below −10% → 20.</li>
          <li><strong>RSI:</strong> 45–60 → 80; 60–70 → 70; 30–45 → 55; above 70 → 40; below 30 → 35.</li>
          <li><strong>MACD:</strong> histogram above zero → 75; below zero → 40.</li>
        </ul>
        <p><strong>Worked example — Eli Lilly (LLY).</strong> Price $1,443.50, EMA20 $1,360.54, EMA50 $1,281.46, EMA200 $1,153.74 — price above all three, in order, so trend = 100. Price vs 200-day is +25.1% → 100. RSI 69.7 → 70. MACD histogram +3.45 (above zero) → 75. Technical = 0.35×100 + 0.25×100 + 0.20×70 + 0.20×75 = 35 + 25 + 14 + 15 = <strong>89.0</strong>.</p>
        <p><strong>Second example — NVIDIA (NVDA).</strong> Price $162.85, EMA20 $193.27, EMA50 $206.86, EMA200 $205.56 — price below all three, so trend = 15. Price vs 200-day is −20.8% → 20. RSI 24.9 (below 30) → 35. MACD histogram −4.12 (below zero) → 40. Technical = 0.35×15 + 0.25×20 + 0.20×35 + 0.20×40 = 5.25 + 5 + 7 + 8 = 25.25, shown as <strong>25.2</strong>. NVDA shares the lowest timing score (25.2) among the 12 Growth names, tied with LYTS — the business scores well, the chart does not.</p>
        <h3>How to read it</h3>
        <p>High means the trend is up and momentum is healthy; low means the stock is in a downtrend or has fallen hard and fast. A low technical score never makes a stock Avoid on its own — it is a timing warning, not a business judgement.</p>
        <h3>Source + as-of</h3>
        <p>Prices and indicators from Yahoo Finance, daily history sliced to the 13 November 2026 close; engine run 16 November 2026. One method note: EMA200 is computed on a one-year window, so it differs from other sites' longer-window EMA200 for every name — flagged per ticker, never swapped for the other figure.</p>
      </section>

      <section id="trust" className="card">
        <h2>Trust</h2>
        <h3>What it is</h3>
        <p>Trust measures how much we can rely on the numbers behind the other four pillars. A score built on complete data, wide analyst coverage, analysts who roughly agree, and insiders who are not all selling is more trustworthy than one built on gaps. It counts for 15% of the overall score. A perfect Trust score never hides missing data — gaps lower it.</p>
        <h3>Every term, defined</h3>
        <ul>
          <li><strong>Data completeness.</strong> Whether every input the engine needs was actually available. A name with an adjustment applied, a skipped leg or a currency problem scores below 100.</li>
          <li><strong>Analyst coverage.</strong> How many analysts publish price targets for the stock. More analysts means more independent eyes on the numbers.</li>
          <li><strong>Target dispersion.</strong> How far apart analysts' price targets are. If the highest target is far above the lowest, analysts disagree — and disagreement means uncertainty. We measure it as (highest target − lowest target) ÷ mean target.</li>
          <li><strong>Insider activity.</strong> What the company's own directors and executives did with their shares in the last 90 days: buying, selling, or nothing. Open-market trades only — scheduled sales and gifts are not counted as selling signals.</li>
        </ul>
        <h3>How it's computed</h3>
        <p><strong>Formula.</strong> Trust = 30% completeness + 25% analyst coverage + 25% target dispersion + 20% insider.</p>
        <ul>
          <li><strong>Completeness:</strong> 100 if all inputs are present with no adjustment; 80 where a ONEOFF-v1 adjustment was applied (GOOGL, AMZN, META, TSLA, AVGO, BRK-B). No name in the published universe has a skipped leg, so the 90 and 65 rungs of the original scale do not occur.</li>
          <li><strong>Analyst coverage:</strong> 30 or more analysts → 100; 10–29 → 80; under 10 → 50.</li>
          <li><strong>Target dispersion:</strong> spread ÷ mean up to 0.30 → 100; up to 0.60 → 80; up to 1.00 → 60; above 1.00 → 40.</li>
          <li><strong>Insider:</strong> no insider data → 50 (neutral, never "no selling"); sales only, under $500M → 45; sales only, $500M or more → 35; mixed buying and selling → 60.</li>
        </ul>
        <p><strong>Worked example — Eli Lilly (LLY).</strong> Completeness 100, analyst coverage 80 (29 analysts), target dispersion 80 (spread ÷ mean 0.519), insider 45 (2 sales, 11,500 shares, $15M, 0 buys in 90 days). Trust = 0.30×100 + 0.25×80 + 0.25×80 + 0.20×45 = 30 + 20 + 20 + 9 = <strong>79.0</strong>.</p>
        <p><strong>Second example — NVIDIA (NVDA).</strong> Completeness 100, analyst coverage 100 (53 analysts), target dispersion 40 (spread ÷ mean 1.247 — targets range from $170 to $515), insider 35 (5 sales, 4,297,200 shares, $960M, 0 buys). Trust = 0.30×100 + 0.25×100 + 0.25×40 + 0.20×35 = 30 + 25 + 10 + 7 = <strong>72.0</strong>. NVDA has the most analysts of any name we cover — and also the widest disagreement among them.</p>
        <h3>How to read it</h3>
        <p>High trust means the card rests on complete data and analysts who mostly agree. Low trust means read the other pillars with more caution. Note the insider rule: heavy insider selling lowers the score, but &quot;no insider data&quot; scores a neutral 50 — we never claim &quot;no selling&quot; when we simply have no feed. No name in the current 227-name universe scores the neutral 50 — every published name has insider data.</p>
        <h3>Source + as-of</h3>
        <p>Completeness per the engine's documented precedents (see the formula above). Analyst targets from Yahoo Finance, fetched 15–16 November 2026. Insider trades from SEC Form 4 filings via the Yahoo feed, last 90 days. Prices at the 13 November 2026 close; engine run 16 November 2026.</p>
      </section>

      <section id="ladder" className="card">
        <h2>Valuation ladder</h2>
        <h3>What it is</h3>
        <p>The ladder turns our fair value into four reference prices: Heavy, Buy, Fair and Exit. They are fixed fractions of the fair value — the same fractions for every stock. They are valuation context: they show where the current price sits relative to what we think the stock is worth. They are <strong>not</strong> instructions to buy or sell.</p>
        <h3>Every term, defined</h3>
        <ul>
          <li><strong>Heavy (0.60×).</strong> 60% of fair value. The deepest discount level on the ladder.</li>
          <li><strong>Buy (0.80×).</strong> 80% of fair value.</li>
          <li><strong>Fair (1.00×).</strong> Exactly the fair value.</li>
          <li><strong>Exit (1.20×).</strong> 120% of fair value. If the price is at or above this level, the Avoid verdict gate trips (see the Valuation card).</li>
          <li><strong>Median.</strong> The middle value of the three valuation legs — the fair value the ladder is built from.</li>
          <li><strong>Leg spread.</strong> The gap between the highest and lowest valuation legs. A wide spread means the fair value itself is uncertain, so the ladder levels are uncertain too.</li>
        </ul>
        <h3>How it's computed</h3>
        <p><strong>Formula.</strong> Heavy = fair value × 0.60; Buy = fair value × 0.80; Fair = fair value × 1.00; Exit = fair value × 1.20.</p>
        <p><strong>Worked example — Eli Lilly (LLY).</strong> Fair value $923.59.</p>
        <ul>
          <li>Heavy: $923.59 × 0.60 = <strong>$554.15</strong></li>
          <li>Buy: $923.59 × 0.80 = <strong>$738.87</strong></li>
          <li>Fair: $923.59 × 1.00 = <strong>$923.59</strong></li>
          <li>Exit: $923.59 × 1.20 = <strong>$1,108.31</strong></li>
        </ul>
        <p>LLY's price, $1,443.50, sits above even the Exit level — which is why the Avoid gate trips on price as well as on the valuation score.</p>
        <p><strong>Second example — NVIDIA (NVDA).</strong> Fair value $238.62. Heavy $143.17, Buy $190.90, Fair $238.62, Exit $286.34. NVDA's price, $162.85, sits between Heavy and Buy — below our fair value, which is the +46.5% upside in the Valuation card.</p>
        <h3>How to read it</h3>
        <p>The ladder answers "how far is the price from what we think it's worth?" in four steps. Price below Buy means the stock trades at a discount to our fair value; price above Exit means it trades at a premium of 20% or more. But read the label: these are reference points for valuation, not orders. Our own backtest (12 quarter-ends, December 2023 to September 2026, five tickers) found the ladder does <strong>not</strong> separate future returns: names priced above Exit averaged +19.9% over the following six months (winning 72% of the time), and the correlation between our upside figure and forward returns was about zero at one, three and six months. Until a wider backtest (749 names, including a bear market) says otherwise, the ladder stays labelled "valuation context — not a buy/sell signal". The Avoid gate "price at or above Exit" is unchanged — it is a valuation gate on the overall verdict, not a trading instruction.</p>
        <h3>Source + as-of</h3>
        <p>Ratios 0.60 / 0.80 / 1.00 / 1.20 are frozen in SPEC v1.1 §5. Fair values from the triangulated-fair-value card. Prices at the 13 November 2026 close; engine run 16 November 2026. The ladder is withheld entirely if the fair-value anchor is judged unreliable (a material one-off that cannot be quantified, or incomplete data) — the card says so rather than publishing levels from a bad anchor.</p>
      </section>

      <section id="sensitivity-grid" className="card">
        <h2>DCF sensitivity grid</h2>
        <h3>What it is</h3>
        <p>The sensitivity grid shows the DCF leg not as one number but as a table: what would the DCF leg be if cash-flow growth were lower or higher, and if the risk-free rate were lower or higher? It makes visible how much of the DCF value depends on two assumptions — growth and interest rates — instead of hiding that behind a single point.</p>
        <h3>Every term, defined</h3>
        <ul>
          <li><strong>Growth rows.</strong> The rows of the grid: FCF growth of 0%, 5%, 10%, 15% and 20% a year. The rows stop at 20% — the DCF growth cap. There are no 40% rows.</li>
          <li><strong>Risk-free columns.</strong> The columns of the grid: risk-free rates of 4.0%, 4.5%, 5.0%, 5.5% and 6.0%.</li>
          <li><strong>Discount spread.</strong> The fixed gap between the discount rate and the risk-free rate: the locked discount (10.0% for most names, 12.0% for high-beta names) minus the locked risk-free rate (5.00%). That is 5.0 percentage points for most names and 7.0 for high-beta names. Each grid cell's discount rate is its column's risk-free rate plus this spread.</li>
          <li><strong>Decision leg.</strong> The single DCF value the engine actually uses. It sits in the grid where the column is the locked risk-free rate (5.0%) and the row is the base growth — exactly, if the base growth is a grid row; between two rows if it is not.</li>
        </ul>
        <h3>How it's computed</h3>
        <p><strong>Formula.</strong> Each cell = the DCF value computed with that row's growth and that column's discount rate, where discount rate = risk-free rate + locked spread. Same base FCF/share, same terminal growth (2.5%) and same five-year horizon as the decision leg.</p>
        <p><strong>Worked example — Eli Lilly (LLY).</strong> Base FCF/share $13.06, locked spread 5.0pp, decision leg $361.19 (growth 20%, discount 10.0%).</p>
        <table>
          <thead>
            <tr>
              <th>FCF growth</th>
              <th className="num">rf 4.0% (disc 9.0%)</th>
              <th className="num">rf 4.5% (disc 9.5%)</th>
              <th className="num">rf 5.0% (disc 10.0%)</th>
              <th className="num">rf 5.5% (disc 10.5%)</th>
              <th className="num">rf 6.0% (disc 11.0%)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>0%</td>
              <td className="num">$184.65</td>
              <td className="num">$171.62</td>
              <td className="num">$160.33</td>
              <td className="num">$150.45</td>
              <td className="num">$141.73</td>
            </tr>
            <tr>
              <td>5%</td>
              <td className="num">$229.28</td>
              <td className="num">$212.72</td>
              <td className="num">$198.36</td>
              <td className="num">$185.80</td>
              <td className="num">$174.73</td>
            </tr>
            <tr>
              <td>10%</td>
              <td className="num">$282.69</td>
              <td className="num">$261.84</td>
              <td className="num">$243.79</td>
              <td className="num">$228.00</td>
              <td className="num">$214.08</td>
            </tr>
            <tr>
              <td>15%</td>
              <td className="num">$346.13</td>
              <td className="num">$320.16</td>
              <td className="num">$297.67</td>
              <td className="num">$278.02</td>
              <td className="num">$260.69</td>
            </tr>
            <tr>
              <td>20%</td>
              <td className="num">$421.00</td>
              <td className="num">$388.94</td>
              <td className="num"><strong>$361.19</strong></td>
              <td className="num">$336.94</td>
              <td className="num">$315.57</td>
            </tr>
          </tbody>
        </table>
        <p>The bold cell is the decision leg: growth 20% is a grid row, so the 5.0% column reproduces it exactly. Read across the 20% row: even at the most generous corner (20% growth, 4.0% risk-free) the DCF leg is $421.00 — still $1,022.50 below LLY's $1,443.50 price. Read down the 5.0% column: if growth were 0% instead of 20%, the leg would be $160.33.</p>
        <p><strong>Second example — NVIDIA (NVDA).</strong> Base $4.80, locked spread 7.0pp, decision leg $102.78 at 20% growth, rf 5.0% (discount 12.0%). The most generous cell (20% growth, rf 4.0%, discount 11.0%) is $115.98 — still $46.87 below NVDA's $162.85 price, which is why NVDA's fair value rests on the PEGY and Forward legs, not the DCF leg. The least generous cell (0% growth, rf 6.0%, discount 13.0%) is $42.31.</p>
        <h3>How to read it</h3>
        <p>Read across a row to see how much growth matters; read down a column to see how much interest rates matter. If the whole grid sits below the share price, the DCF view cannot support the price at any plausible assumption — the fair value must be coming from the other two legs. If the grid straddles the price, the DCF view is genuinely uncertain.</p>
        <h3>Source + as-of</h3>
        <p>Same base FCF/share and terminal growth as the decision DCF leg; locked spread from SPEC v1.1 §3(a). Grid values stored per ticker in <code>results.json</code> (<code>dcf_sensitivity_grid</code>). No published name has a skipped grid: all 227 names carry a full grid, because every published DCF leg is computed. Prices at the 13 November 2026 close; engine run 16 November 2026. The grid is a display of the decision leg's assumption-dependence, not a second valuation.</p>
      </section>

      <section id="us-vs-wall-street" className="card">
        <h2>The Stock Check vs Wall Street</h2>
        <h3>What it is</h3>
        <p>Wall Street analysts publish their own price targets for every stock. This card puts our fair value next to theirs, side by side, so you can see where we agree and where we disagree — and whether any of our three valuation legs can explain the difference.</p>
        <h3>Every term, defined</h3>
        <ul>
          <li><strong>Consensus mean target.</strong> The average of all analysts' 12-month price targets for the stock. It is the Street's central guess at where the price will be in a year.</li>
          <li><strong>Target range.</strong> The lowest and highest analyst targets. A wide range means analysts disagree with each other.</li>
          <li><strong>Analyst count.</strong> How many analysts publish a target. More analysts means a sturdier average; three analysts (Berkshire) is thin, sixty (Amazon) is thick.</li>
          <li><strong>Gap.</strong> Our fair value minus the consensus mean target, in dollars and as a percentage of the mean. Negative means we are below the Street; positive means we are above it.</li>
          <li><strong>The 10% "why the gap" rule.</strong> A rule with no judgement in it: a valuation leg "explains" the gap only if that leg sits within 10% of the consensus mean target. If no leg is that close, the card says plainly that no leg explains the gap — it never invents a reason.</li>
        </ul>
        <h3>How it's computed</h3>
        <p><strong>Formula.</strong> Our upside = fair value ÷ price − 1. Consensus upside = consensus mean ÷ price − 1. Gap = fair value − consensus mean; gap % = gap ÷ consensus mean. For each of the three legs, distance % = |leg − consensus mean| ÷ consensus mean. The closest leg "explains" the gap only if its distance is 10% or less.</p>
        <p><strong>Worked example — NVIDIA (NVDA), gap explained.</strong> Our fair value $238.62; consensus mean $276.56 (53 analysts, range $170–$515). Gap = $238.62 − $276.56 = <strong>−$37.94 (−13.7%)</strong>. Our upside is +46.5%; the consensus upside is ($276.56 ÷ $162.85 − 1) = <strong>+69.8%</strong> — the Street is more optimistic than we are. Closest leg: the Forward-sector leg at $259.42, which is |$259.42 − $276.56| ÷ $276.56 = <strong>6.2%</strong> from the mean — within 10%, so the gap is explained: the Street's view lines up with our Forward leg (next-year EPS $15.85 × IT sector 18.0× ÷ 1.10). The rest of the gap is triangulation: our fair value is the median of the three legs, and the DCF leg ($102.78) pulls that median down.</p>
        <p><strong>Worked example — Eli Lilly (LLY), gap NOT explained.</strong> Our fair value $923.59; consensus mean $1,463.40 (29 analysts, range $940–$1,700). Gap = $923.59 − $1,463.40 = <strong>−$539.81 (−36.9%)</strong>. Our upside is −36.0%; the consensus upside is +1.4%. Closest leg: PEGY at $938.51, which is still</p>
        <table>
          <thead>
            <tr>
              <th>$938.51 − $1,463.40</th>
              <th className="num">÷ $1,463.40 = <strong>35.9%</strong> from the mean — far outside</th>
            </tr>
          </thead>
          <tbody>
          </tbody>
        </table>
        <p>10%. No leg explains the gap, and the card says so. The disagreement is not a rounding difference: the Street's average target is essentially at the current price, while all three of our legs sit hundreds of dollars below it.</p>
        <h3>How to read it</h3>
        <p>A small gap means we and the Street roughly agree; a large gap means one of us is wrong. When a leg explains the gap, you can see exactly which view the Street is closest to. When no leg explains it, the honest answer is that our whole framework disagrees with the Street — not that one assumption is off. On the 13 November 2026 data, 63 of the 227 names have an explained gap (NVDA among them); the other 164 do not.</p>
        <h3>Source + as-of</h3>
        <p>Analyst targets from Yahoo Finance, fetched 15–16 November 2026 and carried through unchanged; the nightly refresh updates the price only. Our fair value and legs from the triangulation card. Prices at the 13 November 2026 close; engine run 16 November 2026. The 10% rule is implemented in the stock page code (<code>app/stock/[ticker]/page.tsx</code>, <code>closestLegToTarget</code>).</p>
      </section>

      <section id="capm-cross-check" className="card">
        <h2>CAPM cross-check</h2>
        <h3>What it is</h3>
        <p>A second opinion on the DCF leg. The decision DCF leg uses a fixed discount rate (10.0% for most names, 12.0% for high-beta names). This cross-check recomputes the same DCF with a market-based discount rate built the CAPM way — from the live 10-year Treasury yield, the stock's beta, and an equity risk premium. It is display only: <strong>it does not change any fair value, score or verdict</strong> until a wider backtest measures whether it should.</p>
        <h3>Every term, defined</h3>
        <ul>
          <li><strong>CAPM (Capital Asset Pricing Model).</strong> A standard formula for what return investors should demand for holding a risky stock: the risk-free return, plus extra return for the stock's market risk.</li>
          <li><strong>10-year Treasury yield.</strong> The interest rate on a 10-year US government bond — the market's risk-free rate. Live value here: 5.10%.</li>
          <li><strong>Beta.</strong> How much the stock moves with the market (see the DCF card). The raw beta comes from Yahoo Finance.</li>
          <li><strong>Adjusted beta.</strong> The raw beta shrunk toward 1.0: adjusted beta = 0.67 × raw beta + 0.33. Extreme betas are pulled back because they tend to moderate over time.</li>
          <li><strong>Equity risk premium (ERP).</strong> The extra yearly return investors demand for holding stocks instead of government bonds. Used here: 4.41%, from Aswath Damodaran (NYU Stern), "Trailing 12 month, with adjusted payout".</li>
          <li><strong>CAPM discount rate.</strong> 10-year Treasury + adjusted beta × ERP. It replaces the fixed 10.0%/12.0% discount in this second DCF run only.</li>
        </ul>
        <h3>How it's computed</h3>
        <p><strong>Formula.</strong> r_capm = 10Y Treasury + (0.67 × raw beta + 0.33) × ERP. Cross-check leg = the DCF formula from the DCF card, with the same base FCF/share, same growth, same terminal growth (2.5%) and same five-year horizon — only the discount rate changes.</p>
        <p><strong>Worked example — NVIDIA (NVDA).</strong> Raw beta 2.247 → adjusted beta = 0.67 × 2.247 + 0.33 = <strong>1.83549</strong>. r_capm = 5.10% + 1.83549 × 4.41% = 5.10% + 8.09% = <strong>13.19%</strong>. Same base $4.80 and 20% growth as the decision leg, discounted at 13.19% instead of 12.0%, gives <strong>$90.29</strong> versus the decision leg's $102.78. The market-based rate charges NVDA more than the fixed rate, so the cross-check leg is lower.</p>
        <p><strong>Second example — Eli Lilly (LLY).</strong> Raw beta 0.389 → adjusted beta = 0.67 × 0.389 + 0.33 = <strong>0.59063</strong>. r_capm = 5.10% + 0.59063 × 4.41% = 5.10% + 2.60% = <strong>7.70%</strong>. Same base $13.06 and 20% growth, discounted at 7.70% instead of 10.0%, gives <strong>$532.95</strong> versus the decision leg's $361.19. The market-based rate charges LLY less than the fixed rate, so the cross-check leg is much higher.</p>
        <p><strong>All cross-check legs</strong> (decision leg in brackets): NVDA $90.29 [$102.78] at 13.19%; AAPL $207.30 [$200.71] at 9.77%; MSFT $214.21 [$203.37] at 9.64%; GOOGL $35.37 [$36.25] at 10.18%; LLY $532.95 [$361.19] at 7.70%; AMZN −$94.12 [−$107.54] at 11.00%; META $294.49 [$308.64] at 10.33%; TSLA $20.61 [$25.72] at 11.71%; AVGO $194.48 [$222.91] at 11.01%; BRK-B $181.40 [$139.05] at 8.24%; V $350.62 [$295.10] at 8.88%.</p>
        <h3>How to read it</h3>
        <p>If the cross-check leg is close to the decision leg, the fixed discount rate is roughly what the market would charge. If it is far away, the two views disagree about risk — LLY is the extreme case ($532.95 vs $361.19). Either way, the cross-check changes nothing today: it is information, not a decision input.</p>
        <h3>Source + as-of</h3>
        <p>10-year Treasury 5.10% as of 12 November 2026 (FRED series DGS10). Damodaran implied ERP 4.41% as of 1 November 2026. Raw betas from Yahoo Finance, fetched 15 November 2026. Locked decision risk-free rate stays 5.00% — the live 5.10% feeds the cross-check only. SPEC v1.1 §3(a); METHOD-v1.3 §1.1. Note: Damodaran's own November page computes the 4.41% against a 5.29% Treasury rate in his calculation; we pair the 4.41% figure with the live 10Y 5.10%, exactly as USA Economy Now does.</p>
        <p>## VERIFICATION NOTES</p>
        <p>Every worked example above was recomputed from the stored values in <code>~/workspace/the-stock-check/lib/data/results.json</code> (engine scoring-engine-v1.3 + batch-2, as-of 2026-11-16, price date 2026-11-13) and the frozen SPEC/METHOD docs. Method: re-implemented the engine's <code>dcf()</code> (5-year discounted FCF + terminal value), PEGY, Forward-sector, median/mean triangulation, ladder, valuation interpolation, pillar weighted sums and the 10% gap rule in Python, and compared each result with the stored value.</p>
        <h3>Arithmetic checks — all reproduced</h3>
        <ul>
          <li><strong>LLY DCF $361.19:</strong> recomputed exactly. Year-by-year PVs 14.25 / 15.54 / 16.96 / 18.50 / 20.18 (sum 85.42); terminal value 444.13, discounted 275.77; total 361.19. Inputs: base FCF/share $13.06, growth 20%, discount 10.0%, terminal growth 2.5% (LLY DCF leg method text, <code>results.json</code>).</li>
          <li><strong>NVDA DCF $102.78:</strong> recomputed exactly. Five-year PVs sum 29.66; terminal value 128.87, discounted 73.12; total 102.78. Inputs: normalised base $4.80, growth 20%, discount 12.0%, terminal growth 2.5%.</li>
          <li><strong>LLY PEGY 0.650 → $938.51:</strong> (30.0 + 0.46) ÷ 46.85 = 0.65016; $1,443.50 × 0.65016 = $938.51. The card shows PEGY rounded to 0.650.</li>
          <li><strong>NVDA PEGY 1.465 → $238.62:</strong> (30.0 + 0.17) ÷ 20.59 = 1.46527; $162.85 × 1.46527 = $238.62.</li>
          <li><strong>LLY ladder:</strong> $923.59 × 0.60 / 0.80 / 1.00 / 1.20 = $554.15 / $738.87 / $923.59 / $1,108.31 — exact. NVDA ladder $143.17 / $190.90 / $238.62 / $286.34 — exact.</li>
          <li><strong>LLY Forward-sector $923.59:</strong> using the engine's unrounded next-year EPS $50.79721 (from <code>scoring-engine-v1.3-batch2/inputs.json</code>, <code>tickers/LLY/forward_eps</code>): $50.79721 × 20.0 ÷ 1.10 = $923.59 exact. With the card's rounded $50.80 the same maths gives $923.64 — a $0.05 rounding difference, flagged in the card.</li>
          <li><strong>NVDA Forward-sector $259.42:</strong> unrounded EPS $15.85369 (v1.3 <code>inputs.json</code>): $15.85369 × 18.0 ÷ 1.10 = $259.42 exact. Rounded $15.85 gives $259.36 ($0.06 difference).</li>
          <li><strong>GOOGL PEGY $168.03:</strong> growth used is 14.85%, not the 14.8% shown rounded in the method text: (14.85 + 0.29) ÷ 26.65 = 0.56811; $295.77 × 0.56811 = $168.03 exact. The 14.8% figure in the method text is a rounding of the stored 0.1485 growth scenario.</li>
          <li><strong>AMZN DCF −$107.54:</strong> growth used is 17.38% (stored growth_scenario 0.1738), not the rounded 17.4%: DCF(−$4.30, 17.38%, 10.0%) = −$107.54 exact.</li>
          <li><strong>Triangulation medians:</strong> LLY median of (361.19, 938.51, 923.59) = $923.59; NVDA median of (102.78, 238.62, 259.42) = $238.62 — exact. Leg spread ÷ FV: LLY (938.51 − 361.19) ÷ 923.59 = 0.625; NVDA (259.42 − 102.78) ÷ 238.62 = 0.656; BRK-B 1.898; AMZN 2.416 — all match stored values.</li>
          <li><strong>Valuation scores (interpolation):</strong> LLY upside −36.0% → 14.0 exact; NVDA +46.5% → 97.9 exact; META −15.1% → 34.9 — all match stored values. NVDA v1.1 cap story verified against SPEC v1.1 §6 / Appendix C: spread 0.898 capped valuation at 65.0, overall 65.6; v1.2 spread 0.656 released the cap, valuation 97.9, overall 75.5, FV unchanged $238.62.</li>
          <li><strong>Overall weighted sums:</strong> LLY 63.6×0.25 + 14.0×0.30 + 76.0×0.20 + 89.0×0.10 + 79.0×0.15 = 56.05 → 56.1; NVDA 75.515 → 75.5 — match.</li>
          <li><strong>Pillar weighted sums:</strong> LLY Quality 76.0, Technical 89.0, Trust 79.0, Conviction (74.1 + 53.1) ÷ 2 = 63.6 — exact. NVDA Quality 77.0, Trust 72.0, Conviction 69.7 — exact. NVDA Technical recomputes to 25.25, stored as 25.2 (one-decimal rounding).</li>
          <li><strong>Sensitivity grids:</strong> LLY grid cells recomputed exactly from DCF($13.06, growth, rf + 5.0pp) — 20% row $421.00 / $388.94 / $361.19 / $336.94 / $315.57; 0% row $184.65 / $171.62 / $160.33 / $150.45 / $141.73. NVDA grid: 20%/rf 4.0% cell $115.98; 0%/rf 5.0% cell $46.69 — exact (from METHOD-v1.3 §1.2 table, cross-checked against <code>results.json</code> grid values).</li>
          <li><strong>CAPM cross-checks:</strong> NVDA r = 5.10% + 1.83549 × 4.41% = 13.19%; DCF($4.80, 20%, 13.19%) = $90.29 (using the unrounded 13.1945%; the rounded 13.19% gives $90.33). LLY r = 5.10% + 0.59063 × 4.41% = 7.70%; DCF($13.06, 20%, 7.70468%) = $532.95 exact (the rounded 7.70% gives $533.46 — the $0.51 difference is the rounding of the discount rate, flagged here, not in the card). CAPM discounts for AAPL 9.77%, MSFT 9.64%, GOOGL 10.18% all recomputed from the stored raw betas.</li>
          <li><strong>10% gap rule, all 227 tickers recomputed:</strong> 63 have an explained gap, including NVDA (closest leg Forward $259.42, 6.2% from mean $276.56). The other 164 range from 10.3% (ALB) to 97.1% (BYND); META&rsquo;s closest leg (PEGY $699.29) is 17.8% from its mean and TSLA&rsquo;s (Forward $49.27) is 88.1%. LLY closest leg PEGY $938.51 is 35.9% from $1,463.40. Gaps: NVDA −$37.94 (−13.7%), LLY −$539.81 (−36.9%). Consensus upsides: NVDA +69.8%, LLY +1.4%.</li>
        </ul>
        <h3>Numbers I could NOT verify from the frozen sources</h3>
        <ul>
          <li><strong>Story-Tracker sub-weights in action:</strong> the Conviction card states the Story/Financials sub-weight splits (35/30/20/15 and 30/30/20/20) from SPEC v1.1 §3, and the stored Story/Financials scores from <code>results.json</code> — but the underlying percentile-rank inputs that produce Story 74.1 / Financials 53.1 for LLY are not in <code>results.json</code> or the frozen docs, so the sub-score arithmetic itself could not be re-performed. The card does not claim otherwise.</li>
          <li><strong>Quality/Technical/Trust band tables:</strong> the band cut-offs are from <code>scoring-engine-v1.3/engine.py</code> (<code>pillar_quality</code>, <code>pillar_technical</code>, <code>pillar_trust</code>), which is a frozen engine file, not from <code>results.json</code>. The sub-scores and inputs in <code>results.json</code> were verified to be consistent with those bands for LLY and NVDA.</li>
          <li><strong>Three-year revenue CAGRs other than NVDA (100%), LLY (32%), MSFT (16%), META (20%), AVGO (24%) and BRK-B (21%):</strong> taken from the <code>pros</code> lines in <code>results.json</code> where stated. AAPL, GOOGL, AMZN, TSLA and V carry no revenue-CAGR line in <code>results.json</code>, so no CAGR is quoted for them in this draft.</li>
          <li><strong>Sector-multiple history / cap-floor binding:</strong> the claim that neither the 35× cap nor the 10× floor binds at any date Dec 2023 – Nov 2026 is from SPEC v1.1 Appendix A; the underlying history file was not re-read for this draft.</li>
          <li><strong>Backtest figures in the Ladder card</strong> (+19.9% over 6 months above Exit, win 72%, correlations ≈ 0) are quoted from SPEC v1.1 §5 / Appendix D (backtest v2); the backtest report itself was not re-run.</li>
        </ul>
      </section>
    </>
  )
}
