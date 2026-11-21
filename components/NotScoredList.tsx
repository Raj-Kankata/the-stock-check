import Link from 'next/link'
import type { PublicNotScoredRow } from '@/lib/public-types'
import { money } from '@/lib/format'
import { signedPctSpan, Card } from '@/components/ui'

/**
 * The badged not-scored list shown under the scored tables on /stocks
 * and /screener (RULEBOOK §34). These names are tracked but have no
 * score, verdict or fair value, so they are NEVER rows in the ranked
 * tables, never enter any filter or count there, and are listed here
 * separately with the reason for each. Server component — rows arrive
 * as display-only props from lib/public.ts.
 */
export default function NotScoredList({
  rows,
  priceDate,
}: {
  rows: PublicNotScoredRow[]
  priceDate: string
}) {
  if (rows.length === 0) return null
  return (
    <Card title="Not scored — insufficient data">
      <p>
        These {rows.length} names are tracked, with a page each, but are{' '}
        <strong>not scored</strong>: the data needed for a fair value is not there yet.
        They are excluded from the rankings, filters and counts above — the scored count
        stays scored-only. Open a name to see exactly why it has no verdict.
      </p>
      <table>
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Company</th>
            <th>Sector</th>
            <th className="num">Price</th>
            <th className="num">Day</th>
            <th>Why no score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.symbol}>
              <td>
                <Link href={`/stock/${r.symbol}`}>
                  <strong>{r.symbol}</strong>
                </Link>{' '}
                <span className="pill notscored">NOT SCORED</span>
              </td>
              <td>{r.name}</td>
              <td>{r.sector}</td>
              <td className="num">{money(r.price)}</td>
              <td className="num">
                {r.change_pct !== null ? signedPctSpan(r.change_pct, 1, 0.001) : '—'}
              </td>
              <td>{r.reason_title}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="footnote">
        Prices are the {priceDate} close, refreshed nightly. No score is ever guessed
        for an unscored ticker.
      </p>
    </Card>
  )
}
