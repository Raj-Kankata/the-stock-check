import type { Metadata } from 'next'
import Link from 'next/link'
import { RESULTS, getTicker, money } from '@/lib/data'
import { PICKS, PICKS_ENTRY_DATE } from '@/lib/site'
import { Card, signedPctSpan } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Performance',
  description:
    'How the Top Picks are tracked: an equal-weight portfolio at the frozen 13 Nov 2026 entry prices, no costs, no dividends. No return is published without its pick list.',
}

export default function PerformancePage() {
  const latestCloseDate = RESULTS.price_date
  const measured = PICKS.map(({ symbol, entryPrice }) => {
    const t = getTicker(symbol)
    if (!t) return null
    const ret = (t.price - entryPrice) / entryPrice
    return { symbol, name: t.name, entryPrice, latest: t.price, ret }
  }).filter((r): r is NonNullable<typeof r> => r !== null)
  const portfolioReturn =
    measured.length > 0
      ? measured.reduce((sum, r) => sum + r.ret, 0) / measured.length
      : null

  return (
    <>
      <h1>Performance</h1>
      <p className="page-intro">
        Every return we publish is recomputable from the frozen entries below. No return is ever
        published without its pick list.
      </p>

      <Card title="How performance is measured">
        <p>
          The Top Picks are tracked as an <strong>equal-weight portfolio</strong>, entered at the
          frozen {PICKS_ENTRY_DATE} entry prices shown below. The portfolio holds each pick in
          equal weight at entry; no costs and no dividends are included — both are stated here so
          the numbers can be reproduced exactly.
        </p>
        <ul>
          <li>
            <strong>Entry prices:</strong> frozen at publication ({PICKS_ENTRY_DATE} close), never
            restated.
          </li>
          <li>
            <strong>Latest close:</strong> the close in this build&apos;s data (
            {latestCloseDate}); the return is recomputed from it on every nightly refresh.
          </li>
          <li>
            <strong>Weighting:</strong> equal weight across the picks.
          </li>
          <li>
            <strong>Costs:</strong> none included — no commissions, fees or slippage.
          </li>
          <li>
            <strong>Dividends:</strong> not included.
          </li>
          <li>
            <strong>Benchmark:</strong> none yet — no benchmark is tracked against these picks at
            present.
          </li>
        </ul>
      </Card>

      <Card title="Picks under tracking">
        <table>
          <thead>
            <tr>
              <th>Stock</th>
              <th>Entry date</th>
              <th className="num">Entry price</th>
              <th className="num">Latest close</th>
              <th className="num">Return since entry</th>
            </tr>
          </thead>
          <tbody>
            {measured.map(({ symbol, name, entryPrice, latest, ret }) => (
              <tr key={symbol}>
                <td>
                  <Link href={`/stock/${symbol}`}>
                    <strong>{symbol}</strong>
                  </Link>
                  <br />
                  <span className="footnote">{name}</span>
                </td>
                <td>{PICKS_ENTRY_DATE}</td>
                <td className="num">{money(entryPrice)}</td>
                <td className="num">{money(latest)}</td>
                <td className="num">{signedPctSpan(ret)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">
          Return = (latest close − entry price) ÷ entry price, measured from the{' '}
          {PICKS_ENTRY_DATE} close to the {latestCloseDate} close — the closes since entry. The
          print lengthens with every nightly refresh; it is a return since entry, not a track
          record. NVO was published as a pick on 13 Nov 2026 (entry $41.63) and removed from
          tracking when its card was unpublished under the three-leg-only policy.
        </p>
        {portfolioReturn !== null ? (
          <p>
            <strong>Equal-weight portfolio return since entry: {signedPctSpan(portfolioReturn)}</strong>{' '}
            <span className="footnote">
              (mean of the {measured.length} picks above, {PICKS_ENTRY_DATE} entry to{' '}
              {latestCloseDate} close)
            </span>
          </p>
        ) : null}
      </Card>

      <Card title="Why the record is still short">
        <p>
          A return without a frozen entry price is not auditable — it can always be restated after
          the fact. So we publish the entries first, freeze them, and only then measure. The
          entries above are the audit trail: every return on this page can be recomputed from the
          entry prices, the latest close, and the equal-weight, no-cost, no-dividend method stated
          above. The record starts with the closes since entry and grows by one close each night.
        </p>
        <p className="footnote">
          Performance is research, not a promise. Past performance — including any print on this
          page — does not guarantee future results. Nothing here is investment advice.
        </p>
      </Card>
    </>
  )
}
