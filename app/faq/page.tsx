import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, scoreSpan } from '@/components/ui'
import { RESULTS, money } from '@/lib/data'
import { CONTACT_EMAIL, PRICE_DATE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Frequently asked questions about The Stock Check: is it free, is it investment advice, what a fair value is, what the ladder means, and how often data refreshes.',
}

const TICKERS = Object.entries(RESULTS.tickers)

export default function FaqPage() {
  return (
    <>
      <h1>Frequently asked questions</h1>
      <p className="page-intro">
        Plain-English answers. For the full recipe, see <Link href="/methodology">Methodology</Link>.
      </p>

      <Card title="Is it free?">
        <p>
          Yes. No sign-in, no account, no paywall, no tracking and no analytics. The whole site
          is free to read.
        </p>
      </Card>

      <Card title="Is this investment advice?">
        <p>
          No. The Stock Check is research and education only. Nothing here is a recommendation
          to buy or sell any security, and the ladder levels are valuation context, not
          instructions. Verify everything before trading, and consider speaking to a licensed
          adviser about your own situation.
        </p>
      </Card>

      <Card title="What is a fair value — and what does “triangulated” mean?">
        <p>
          A fair value is our model&rsquo;s estimate of what a stock is worth, built from three
          independent angles: a discounted-cash-flow value, a PEGY value (growth plus dividend
          yield, divided by P/E), and a forward-sector value (next-year EPS times the
          sector&rsquo;s forward P/E). &ldquo;Triangulated&rdquo; means we take the{' '}
          <strong>median of the three legs</strong> — the middle value. The median is deliberate:
          it blunts whichever leg is most wrong on a given name. Each stock page shows all three
          legs and the spread between them, so you can see how much the three angles disagree.
        </p>
      </Card>

      <Card title="What does the ladder mean?">
        <p>
          The ladder marks where the price sits against the fair value: Heavy at 0.60&times;,
          Buy at 0.80&times;, Fair at 1.00&times;, Exit at 1.20&times; fair value. It is
          valuation context — a way to see how far the price is from our estimate — not a buy
          or sell signal. Backtests on 5 tickers and on the full 749-name universe found the
          ladder does not separate forward returns, which is exactly why it is published as
          context and never as an instruction. See Methodology §(d) for the numbers.
        </p>
      </Card>

      <Card title="Why did NVDA's score rise while its fair value didn't move?">
        <p>
          Between engine v1.1 and v1.2 the cap on the valuation-leg spread was released. That
          changed how the valuation pillar scores a wide spread between the legs — and
          NVDA&rsquo;s legs are far apart (DCF $102.78, PEGY $238.62, forward-sector $259.42) —
          so its overall score rose to 75.5. The triangulated fair value is the median of the
          three legs, and the median leg did not move, so the fair value stayed at $238.62.
          Score and fair value measure different things, and they can move independently.
        </p>
      </Card>

      <Card title="Why is GOOGL's P/E adjusted?">
        <p>
          GOOGL&rsquo;s reported earnings included $99.1B of equity-security marks — one-off,
          non-operating gains that say nothing about the underlying business. Under the ONEOFF-v1
          rule those marks are removed before the P/E is computed, so the P/E reflects operating
          earnings. Both variants — adjusted and unadjusted — are shown, so the adjustment is
          checkable rather than taken on trust.
        </p>
      </Card>

      <Card title="Why is NVO's DCF skipped?">
        <p>
          NVO reports in Danish krone, and the dollar basis the DCF needs is unverified. Rather
          than guess at a currency conversion, the DCF leg is skipped for NVO and its fair value
          is the median of the two remaining legs (PEGY $22.33 and forward-sector $62.54, giving
          $42.44). Its CAPM cross-check is skipped for the same reason. A skipped leg is stated
          openly wherever it applies.
        </p>
      </Card>

      <Card title="What is the CAPM number?">
        <p>
          A display-only cross-check: a second DCF computed with a CAPM discount rate (10-year
          Treasury plus adjusted beta times the Damodaran implied equity risk premium). It does
          not change any fair value, score or verdict. Backtest v3 measured the CAPM variant on
          the full 749-name universe and found it does not separate returns better, so it stays
          a cross-check. See Methodology §(e) for the formula and the per-ticker table.
        </p>
      </Card>

      <Card title="How often is data refreshed?">
        <ul>
          <li>Prices and technicals — daily close.</li>
          <li>Fundamentals (SEC filings) — daily.</li>
          <li>Conviction (Story-Tracker) — weekly, Monday pre-market.</li>
          <li>Market Pulse — every 6 hours (feed not wired in this build; see the Pulse page).</li>
          <li>Top Picks — monthly, on the 1st.</li>
          <li>Sector multiples — quarterly.</li>
        </ul>
        <p className="footnote">
          Prices on the site are as of the {PRICE_DATE} close.
        </p>
      </Card>

      <Card title="Which tickers are covered?">
        <p>Thirteen tickers are scored so far, and the universe expands from here:</p>
        <table>
          <thead>
            <tr>
              <th>Stock</th>
              <th>Verdict</th>
              <th className="num">Score</th>
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
                <td className="num">{money(t.triangulated_fv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="How do I contact you?">
        <p>
          Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. That is the only
          contact channel, and the only personal data the site ever sees is what you choose to
          put in an email.
        </p>
      </Card>
    </>
  )
}
