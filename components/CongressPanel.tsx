import Link from 'next/link'
import { Card } from '@/components/ui'
import { dateLabel } from '@/lib/format'
import {
  CONGRESS_CAPTURE_START,
  congressStateLabel,
  congressTradesForTicker,
  congressTypeLabel,
} from '@/lib/congress-data'

/** Congress-trading panel for a stock card (RULEBOOK §31): the member
    trades in this ticker from the filings captured since the capture
    start date, newest first. Server component — it reads the store
    (lib/congress-data) at build time, like the rest of the card.
    Context only: no score, no verdict, and a disclosed trade is never
    presented as a signal. Renders for every card, including the
    empty state, so a reader can tell "no filings captured" apart
    from a missing panel. */
export default function CongressPanel({ ticker }: { ticker: string }) {
  const trades = congressTradesForTicker(ticker)
  const captureStart = dateLabel(CONGRESS_CAPTURE_START)
  const credit = (
    <p className="footnote">
      Trade data by{' '}
      <a href="https://www.bargo.ai/free-apis/congress" target="_blank" rel="noreferrer">
        Bargo
      </a>
      , from official House &amp; Senate filings. Amounts are disclosed ranges; filings lag
      trades by up to ~45 days. Context, not a signal.
    </p>
  )

  if (trades.length === 0) {
    return (
      <Card title="Congress trading — disclosed filings">
        <p>
          No congressional trades for {ticker} in the filings we&apos;ve captured since{' '}
          {captureStart}.
        </p>
        {credit}
      </Card>
    )
  }

  const buys = trades.filter((t) => t.type === 'purchase').length
  const sells = trades.filter((t) => t.type === 'sale').length
  const latest = trades.slice(0, 5)

  return (
    <Card title="Congress trading — disclosed filings">
      <p>
        <strong>
          {buys} {buys === 1 ? 'buy' : 'buys'} · {sells} {sells === 1 ? 'sell' : 'sells'}
        </strong>{' '}
        in the filings we&apos;ve captured since {captureStart} (latest disclosed{' '}
        {dateLabel(trades[0].disclosure_date)}).
      </p>
      <table className="tabled">
        <thead>
          <tr>
            <th>Member</th>
            <th>Type</th>
            <th>Amount range</th>
            <th>Trade date</th>
            <th>Disclosed</th>
          </tr>
        </thead>
        <tbody>
          {latest.map((t, i) => (
            <tr key={`${t.member_slug}-${t.transaction_date}-${t.type}-${i}`}>
              <td>
                <Link href={`/congress/${t.member_slug}`}>{t.member}</Link>
                <br />
                <span className="footnote">
                  {t.party ?? '—'} · {congressStateLabel(t.state, t.chamber)}
                </span>
              </td>
              <td>{congressTypeLabel(t.type)}</td>
              <td>{t.amount_range}</td>
              <td>{dateLabel(t.transaction_date)}</td>
              <td>{dateLabel(t.disclosure_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        <Link href="/congress">All Congress trading →</Link>
      </p>
      {credit}
    </Card>
  )
}
