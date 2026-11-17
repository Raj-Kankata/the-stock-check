import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, scoreSpan } from '@/components/ui'
import { RESULTS, money } from '@/lib/data'
import { CONTACT_EMAIL } from '@/lib/site'

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
        Plain-English answers. For more detail, see <Link href="/methodology">Methodology</Link>.
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

      <Card title="What is a fair value?">
        <p>
          A fair value is our model&rsquo;s estimate of what a stock is worth, built from three
          independent angles: a discounted-cash-flow value, a PEGY value (growth plus dividend
          yield, divided by P/E), and a forward-sector value (next-year EPS times the
          sector&rsquo;s forward P/E). Each stock page shows all three values and the spread
          between them, so you can see how much the three angles disagree.
        </p>
      </Card>

      <Card title="What does the ladder mean?">
        <p>
          The ladder marks where the price sits against the fair value, from well below it to
          above it. It is
          valuation context — a way to see how far the price is from our estimate — not a buy
          or sell signal. Backtests on 5 tickers and on the full 749-name universe found the
          ladder does not separate forward returns, which is exactly why it is published as
          context and never as an instruction. See Methodology for the numbers.
        </p>
      </Card>

      <Card title="Why did NVDA's score rise while its fair value didn't move?">
        <p>
          Between engine v1.1 and v1.2, how the valuation pillar treats a wide spread between
          the three values changed — and
          NVDA&rsquo;s values are far apart (DCF $102.78, PEGY $238.62, forward-sector $259.42) —
          so its overall score rose to 75.5. The fair value did not move, so the fair value
          stayed at $238.62.
          Score and fair value measure different things, and they can move independently.
        </p>
      </Card>

      <Card title="Why is GOOGL's P/E adjusted?">
        <p>
          GOOGL&rsquo;s reported earnings included $99.1B of equity-security marks — one-off,
          non-operating gains that say nothing about the underlying business. Those marks are
          removed before the P/E is computed, so the P/E reflects operating
          earnings. Both variants — adjusted and unadjusted — are shown, so the adjustment is
          checkable rather than taken on trust.
        </p>
      </Card>

      <Card title="Why would a DCF leg ever be skipped?">
        <p>
          It would be skipped, not guessed, when the dollar per-share cash-flow basis the
          DCF needs cannot be verified — for example, a name reporting in another currency,
          or a bank, whose &ldquo;free cash flow&rdquo; is not meaningful because operating
          cash flow is dominated by deposit and trading flows. When a leg is skipped, the
          fair value is worked out from the two remaining angles, and the skip is
          stated openly wherever it applies. No name in the current {TICKERS.length}-name universe has a
          skipped leg: every published fair value uses all three angles. Two names the
          site previously published did use the skip path — NVO (Danish-krone reporting) and
          JPM (bank cash flow) — and both are unpublished in the current build.
        </p>
      </Card>

      <Card title="What is the second DCF number?">
        <p>
          A display-only cross-check: a second DCF value computed a different way. It does
          not change any fair value, score or verdict. Backtest v3 measured the cross-check
          variant on
          the full 749-name universe and found it does not separate returns better, so it stays
          a cross-check. See Methodology for more.
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
          Prices on the site are the {RESULTS.price_date} close unless marked LIVE during market
          hours.
        </p>
      </Card>

      <Card title="Which tickers are covered?">
        <p>{TICKERS.length} tickers are scored so far, and the universe expands from here:</p>
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
