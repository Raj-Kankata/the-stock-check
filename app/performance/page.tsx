import type { Metadata } from 'next'
import Link from 'next/link'
import { getTicker, money } from '@/lib/data'
import { PICKS, PICKS_ENTRY_DATE } from '@/lib/site'
import { Card } from '@/components/ui'

export const metadata: Metadata = {
  title: 'Performance',
  description:
    'How the Top Picks are tracked: an equal-weight portfolio at the frozen 13 Nov 2026 entry prices, no costs, no dividends. No return is published without its pick list.',
}

const NOT_YET_MEASURED = 'Not yet measured — first performance print comes after the next close'

export default function PerformancePage() {
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
            <strong>Weighting:</strong> equal weight across the picks.
          </li>
          <li>
            <strong>Costs:</strong> none included — no commissions, fees or slippage.
          </li>
          <li>
            <strong>Dividends:</strong> not included.
          </li>
          <li>
            <strong>Benchmark:</strong> none yet — a benchmark comparison will be shown with the
            first performance print, once there is a measured return to compare.
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
              <th className="num">Return</th>
            </tr>
          </thead>
          <tbody>
            {PICKS.map(({ symbol, entryPrice }) => {
              const t = getTicker(symbol)
              if (!t) return null
              return (
                <tr key={symbol}>
                  <td>
                    <Link href={`/stock/${symbol}`}>
                      <strong>{symbol}</strong>
                    </Link>
                    <br />
                    <span className="footnote">{t.name}</span>
                  </td>
                  <td>{PICKS_ENTRY_DATE}</td>
                  <td className="num">{money(entryPrice)}</td>
                  <td className="num">{NOT_YET_MEASURED}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="footnote">
          No later close exists in this build&apos;s data, so no return figure is published here.
          The first performance print comes after the next close, measured from these frozen entry
          prices. NVO was published as a pick on 13 Nov 2026 (entry $41.63) and removed from
          tracking when its card was unpublished under the three-leg-only policy.
        </p>
      </Card>

      <Card title="Why nothing is published yet">
        <p>
          A return without a frozen entry price is not auditable — it can always be restated after
          the fact. So we publish the entries first, freeze them, and only then measure. The
          entries above are the audit trail: when the first return appears, anyone can recompute
          it from the entry prices, the next close, and the equal-weight, no-cost, no-dividend
          method stated above.
        </p>
        <p className="footnote">
          Performance is research, not a promise. Past performance — including any future print on
          this page — does not guarantee future results. Nothing here is investment advice.
        </p>
      </Card>
    </>
  )
}
