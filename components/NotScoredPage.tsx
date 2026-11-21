import Link from 'next/link'
import {
  NOTSCORED_RESULTS,
  NOTSCORED_FUNDAMENTALS_ASOF,
  getNotScoredResult,
  money,
  pct,
  bigUsd,
  int,
  type NotScoredEntry,
} from '@/lib/notscored-data'
import { Card, signedPctSpan } from '@/components/ui'

/**
 * The "Not scored — insufficient data" page (RULEBOOK §34). Rendered
 * by app/stock/[ticker]/page.tsx when the ticker has no scored card
 * but is in the tier. Shows the company, the nightly-refreshed price,
 * the fundamentals that DO exist, which valuation methods can and
 * cannot be computed, and a prominent plain-language reason panel.
 * NEVER shows a score, a verdict pill or a fair-value number — a
 * negative model output is described in words, never printed.
 */
export default function NotScoredPage({
  symbol,
  entry,
}: {
  symbol: string
  entry: NotScoredEntry
}) {
  const r = getNotScoredResult(symbol)
  const f = entry.fundamentals
  const priceDate = NOTSCORED_RESULTS.price_date

  const fundamentalRows: [string, string][] = []
  if (f.revenue_ttm !== null) fundamentalRows.push(['Revenue (last 12 months)', bigUsd(f.revenue_ttm)])
  if (f.net_income_ttm !== null) fundamentalRows.push(['Net income (last 12 months)', bigUsd(f.net_income_ttm)])
  if (f.ocf_ttm !== null) fundamentalRows.push(['Operating cash flow (last 12 months)', bigUsd(f.ocf_ttm)])
  if (f.fcf_ttm !== null) fundamentalRows.push(['Free cash flow (last 12 months)', bigUsd(f.fcf_ttm)])
  if (f.trailing_eps !== null)
    fundamentalRows.push(['Earnings per share (trailing)', f.trailing_eps < 0 ? `−$${Math.abs(f.trailing_eps).toFixed(2)}` : money(f.trailing_eps)])
  if (f.forward_eps !== null)
    fundamentalRows.push(['Earnings per share (forward, analyst estimate)', f.forward_eps < 0 ? `−$${Math.abs(f.forward_eps).toFixed(2)}` : money(f.forward_eps)])
  if (f.revenue_cagr_3y !== null) fundamentalRows.push(['Revenue growth, 3-year average', pct(f.revenue_cagr_3y, 1)])
  if (f.beta !== null) fundamentalRows.push(['Beta (volatility vs the market)', f.beta.toFixed(2)])

  return (
    <>
      <h1>
        {symbol} — {entry.name}{' '}
        <span className="pill notscored">NOT SCORED</span>
      </h1>
      <p className="page-intro">
        {entry.sector} · We track {entry.name} but do not score it: the data needed for a
        fair value is not there yet, and no score is ever guessed. The price below is kept
        fresh nightly; everything else on this page is the data that does exist, and the
        exact reason there is no verdict.
      </p>

      <Card title={`Why there is no score for ${symbol}`} accent="amber">
        <p>
          <strong>{entry.reason_title}.</strong>
        </p>
        <p>{entry.reason_text}</p>
        <p className="footnote">
          This page is the whole treatment for {symbol} today: no overall score, no
          verdict and no fair value — on this page, in search, or anywhere else on the
          site. How scoring works: <Link href="/methodology">Methodology</Link>.
        </p>
      </Card>

      {r && (
        <Card title="The tape">
          <table>
            <tbody>
              <tr>
                <td>Price ({priceDate} close)</td>
                <td className="num">{money(r.price)}</td>
              </tr>
              <tr>
                <td>Day change</td>
                <td className="num">
                  {r.change_pct !== null ? signedPctSpan(r.change_pct, 1, 0.001) : '—'}
                </td>
              </tr>
              <tr>
                <td>52-week range</td>
                <td className="num">
                  {money(r.low_52w)} – {money(r.high_52w)}
                </td>
              </tr>
              <tr>
                <td>Volume ({priceDate})</td>
                <td className="num">{r.volume !== null ? int(r.volume) : '—'}</td>
              </tr>
              <tr>
                <td>Trading days of price history</td>
                <td className="num">{int(r.bars)}</td>
              </tr>
            </tbody>
          </table>
          <p className="footnote">
            Prices refresh nightly from the same closing data as every scored card.
          </p>
        </Card>
      )}

      <Card title="What we could and couldn't compute">
        <table>
          <thead>
            <tr>
              <th>Valuation method</th>
              <th>Status</th>
              <th>Why</th>
            </tr>
          </thead>
          <tbody>
            {entry.methods.map((m) => (
              <tr key={m.key}>
                <td>{m.label}</td>
                <td>{m.available ? 'Available' : 'Not available'}</td>
                <td>{m.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">
          A published fair value needs at least two of the three methods to agree on a
          number. One method alone — or a combined result below zero — is never
          published as a value.
        </p>
      </Card>

      {fundamentalRows.length > 0 && (
        <Card title="The fundamentals that do exist">
          <table>
            <tbody>
              {fundamentalRows.map(([label, value]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td className="num">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="footnote">
            Fundamentals: {NOTSCORED_FUNDAMENTALS_ASOF}, from company filings (SEC EDGAR)
            and market data. Figures can be negative — a loss or cash burn is a fact, and
            facts are shown as they are.
          </p>
        </Card>
      )}

      <Card title="Story × Financials tracker readings">
        <table>
          <tbody>
            <tr>
              <td>Story score (tracker)</td>
              <td className="num">{entry.story.story.toFixed(1)}</td>
            </tr>
            <tr>
              <td>Financials score (tracker)</td>
              <td className="num">{entry.story.financials.toFixed(1)}</td>
            </tr>
            <tr>
              <td>Tracker quadrant</td>
              <td className="num">{entry.story.quadrant}</td>
            </tr>
          </tbody>
        </table>
        <p className="footnote">
          These are inputs a full card would use — readings from our Story × Financials
          tracker, shown as data. They are not a score for {symbol} and imply no verdict.
        </p>
      </Card>

      {entry.ipo_dossier && (
        <p>
          {entry.name} also has an{' '}
          <Link href={`/ipo/${entry.ipo_dossier}`}>IPO dossier</Link> on this site — its
          listing history, price path and what it would take to earn a full check.
        </p>
      )}

      <p>
        <strong>When could {symbol} get a full card?</strong> When the missing pieces
        arrive — earnings or cash flow turning positive, a second valuation method
        becoming computable, or revenue growth turning positive — a normal engine run
        publishes a scored card at this same address. Until then this page is updated
        nightly with the latest close.
      </p>
    </>
  )
}
