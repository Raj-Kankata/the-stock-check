import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, VerdictBadge } from '@/components/ui'
import { RESULTS, money } from '@/lib/data'
import { PRICE_DATE } from '@/lib/site'

export const metadata: Metadata = {
  title: 'How we compare with Stock Verdicts',
  description:
    'A factual, sourced comparison of The Stock Check with Stock Verdicts (stockverdicts.com): what their model does, the differences we found, and the full 13-ticker side-by-side table.',
}

const TICKERS = Object.entries(RESULTS.tickers)
const AGREE_COUNT = TICKERS.filter(([, t]) => t.vs_stock_verdicts.verdict_agree).length

export default function VsStockVerdictsPage() {
  return (
    <>
      <h1>How we compare with Stock Verdicts</h1>
      <p className="page-intro">
        Stock Verdicts (stockverdicts.com) is the closest comparable site to this one: a free,
        rules-based engine that turns public fundamentals and prices into a verdict per stock.
        This page records what their model does, the differences we found when we checked it,
        and the full side-by-side table for the thirteen tickers we score. Our numbers below
        come from the same results file that powers our stock pages; their numbers are as
        captured from stockverdicts.com on 15 November 2026. Prices are as of the {PRICE_DATE}{' '}
        close.
      </p>

      <div className="callout">
        <strong>Research and education only — not investment advice.</strong> Nothing on this
        page is a recommendation to buy or sell any security. Fair values are model estimates
        built from stated assumptions, not predictions.
      </div>

      <Card title="(a) Who Stock Verdicts is">
        <p>
          Stock Verdicts is a small, free, deterministic rules-engine site built by an
          individual creator, Bonam Bobby — not a brokerage, an adviser, or a chat product. It
          has about eight public pages plus one stock-card template, and no paid tier: every
          page is free. The stock cards, Picks Performance, Sector Rotation, Market Pulse,
          Methodology and FAQ pages are public with no sign-in. Two discovery pages are not:
          Trending Stocks and the monthly Top 20 Value &amp; Growth picks (the Shopping List)
          both require Google sign-in — see (c) below.
        </p>
      </Card>

      <Card title="(b) What their model does">
        <p>
          One engine turns SEC-filing fundamentals and live prices into a single card per
          US-listed ticker:
        </p>
        <ul>
          <li>
            A verdict of <strong>Growth</strong>, <strong>Value</strong> or{' '}
            <strong>Avoid</strong>, from the same engine on every stock.
          </li>
          <li>
            Four 0–100 scores: <strong>Value</strong>, <strong>Growth</strong>,{' '}
            <strong>Quality</strong> and <strong>Technical</strong>.
          </li>
          <li>
            A <strong>Trust Score</strong> (0–100), described as resting on data completeness,
            earnings-quality findings and coverage.
          </li>
          <li>
            A price ladder — <strong>Heavy-Buy / Buy / Fair / Exit</strong> — marking where the
            price sits against their fair value.
          </li>
          <li>
            An earnings-quality line: operating cash flow as a percentage of net income, plus
            machine-generated pros and cons.
          </li>
        </ul>
        <p>
          Their fair value comes from a forward-earnings model: analysts&rsquo; next-year EPS
          &times; <strong>22&times; P/E</strong>, discounted at <strong>10% a year</strong>{' '}
          (1.2 years on NVDA&rsquo;s card, 1.1 years on NVO&rsquo;s). That formula appears in a
          footnote on the NVDA and NVO cards; no fair-value footnote was shown on the AAPL,
          MSFT or GOOGL cards we checked.
        </p>
      </Card>

      <Card title="(c) The differences we found">
        <p>
          Each of these was observed on the live site on 15 November 2026, signed out. They
          are stated as facts with their numbers, so anyone can re-check them:
        </p>
        <ul>
          <li>
            <strong>MSFT — the multiple does not match the footnote.</strong> Their fair value
            of $870.71 implies roughly 36&times; forward earnings per share, not the 22&times;
            multiple described in the fair-value footnote on their NVDA card.
          </li>
          <li>
            <strong>NVO — a krone figure used as dollars.</strong> Their fair value of $104.08
            was built from a next-year EPS figure of $22.89 that is denominated in Danish
            krone and was used as if it were dollars. Converted, $22.89 DKK is about $3.44.
          </li>
          <li>
            <strong>Performance — one pick, +78.8% in 9 trading days.</strong> On their Picks
            Performance page, the S&amp;P 500 Growth portfolio showed one pick, APP, up +78.8%
            in the 9 trading days from 1 to 15 November 2026. That figure is implausible
            against APP&rsquo;s market price on the same date, and the underlying entry prices
            are not published, so it cannot be checked from the page.
          </li>
          <li>
            <strong>Discovery is gated.</strong> Their Trending Stocks page redirects
            signed-out visitors to Google sign-in, and their monthly Top 20 picks show only a
            teaser until you sign in with Google. Our{' '}
            <Link href="/trending">Trending</Link> and{' '}
            <Link href="/picks">Top Picks</Link> pages are public — no sign-in.
          </li>
          <li>
            <strong>Their model is a black box.</strong> Their methodology page states that
            the specific formulas, thresholds, sector benchmarks and weightings behind the
            scores are proprietary. The only exact formulas published anywhere on the site are
            Sector Rotation&rsquo;s (RS, Momentum, Acceleration and Flow thresholds).
          </li>
        </ul>
        <p className="footnote">
          The point of listing these is auditability: our numbers are all shown, with the
          recipe printed on the Methodology page. Theirs cannot be re-derived from what they
          publish, so a discrepancy like the two above has no visible explanation.
        </p>
      </Card>

      <Card title="(d) The 13-ticker comparison">
        <p>
          Verdicts agree on {AGREE_COUNT} of the 13 tickers. &ldquo;Their fair value&rdquo; is
          the Fair rung of their Heavy / Buy / Fair / Exit ladder, as captured on 15 November
          2026. Our fair value is the triangulated median of three legs — DCF, PEGY and
          forward-sector — as described in Methodology §(b).
        </p>
        <table>
          <thead>
            <tr>
              <th>Stock</th>
              <th>Our verdict</th>
              <th className="num">Our fair value</th>
              <th>Their verdict</th>
              <th className="num">Their fair value</th>
              <th>Verdicts agree</th>
            </tr>
          </thead>
          <tbody>
            {TICKERS.map(([symbol, t]) => (
              <tr key={symbol}>
                <td>
                  <Link href={`/stock/${symbol}`}>
                    <strong>{symbol}</strong>
                  </Link>
                  <br />
                  <span className="footnote">{t.name}</span>
                </td>
                <td>
                  <VerdictBadge verdict={t.verdict} />
                </td>
                <td className="num">{money(t.triangulated_fv)}</td>
                <td>{t.stock_verdicts.verdict}</td>
                <td className="num">{money(t.stock_verdicts.ladder[2])}</td>
                <td>{t.vs_stock_verdicts.verdict_agree ? 'Yes' : 'No'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">
          Their fair values are the figures Stock Verdicts published on 15 November 2026; ours
          are from engine v1.3 as of the {PRICE_DATE} close. The two fair values are built by
          different methods, so a gap between them is a difference of method, not by itself an
          error in either.
        </p>
      </Card>

      <Card title="(e) Why we publish this comparison">
        <p>
          Because a fair value you cannot audit is a claim, not evidence. The Stock Check
          publishes every weight, threshold and locked parameter behind its scores, and every
          fair value with the three legs it was triangulated from — so that any reader can
          re-derive the number, or find where it goes wrong. That standard is what this page
          holds Stock Verdicts to, and what we hold ourselves to. The full recipe is on the{' '}
          <Link href="/methodology">Methodology</Link> page.
        </p>
      </Card>
    </>
  )
}
