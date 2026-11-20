import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Card } from '@/components/ui'
import { dateLabel, money } from '@/lib/format'
import { TICKER_SYMBOLS } from '@/lib/data'
import {
  CONGRESS_CAPTURE_START,
  CONGRESS_MEMBERS,
  congressChamberLabel,
  congressStateLabel,
  congressTradesForMember,
  congressTypeLabel,
  getCongressMember,
} from '@/lib/congress-data'

// Static export: one page per member in the captured store, taken
// from congress.json so the generated set can never drift from the
// data.
export function generateStaticParams() {
  return CONGRESS_MEMBERS.map((m) => ({ member: m.slug }))
}

export async function generateMetadata({
  params,
}: PageProps<'/congress/[member]'>): Promise<Metadata> {
  const { member } = await params
  const m = getCongressMember(member)
  if (!m) return { title: 'Not found | The Stock Check' }
  return {
    title: `${m.name} — Congress trading | The Stock Check`,
    description: `Disclosed stock trades by ${m.name} from the official STOCK Act filings captured by The Stock Check — amounts are disclosed ranges, filings lag trades by up to ~45 days.`,
  }
}

function Kv({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  )
}

/** A disclosed range, summed: $X – $Y with the sign carried on both
    ends (a net reduction shows as a negative range). */
function rangeLabel(low: number, high: number): string {
  return `${money(low, 0)} – ${money(high, 0)}`
}

/** Bargo's perf_pct is already in percent units (3.87 = +3.87%) —
    unlike lib/format's pct(), which takes a fraction. */
function perfPct(v: number | null): string {
  if (v === null) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

export default async function CongressMemberPage({
  params,
}: PageProps<'/congress/[member]'>) {
  const { member } = await params
  const m = getCongressMember(member)
  if (!m) notFound()
  const trades = congressTradesForMember(member)
  const cardSet = new Set(TICKER_SYMBOLS)
  const captureStart = dateLabel(CONGRESS_CAPTURE_START)

  // Most-traded tickers by this member, from the captured trades.
  const perTicker = new Map<
    string,
    { buys: number; sells: number; buyLow: number; buyHigh: number; sellLow: number; sellHigh: number }
  >()
  for (const t of trades) {
    const row = perTicker.get(t.ticker) ?? {
      buys: 0, sells: 0, buyLow: 0, buyHigh: 0, sellLow: 0, sellHigh: 0,
    }
    if (t.type === 'purchase') {
      row.buys += 1
      row.buyLow += t.amount_low
      row.buyHigh += t.amount_high
    } else if (t.type === 'sale') {
      row.sells += 1
      row.sellLow += t.amount_low
      row.sellHigh += t.amount_high
    }
    perTicker.set(t.ticker, row)
  }
  const tickerRows = [...perTicker.entries()]
    .map(([ticker, r]) => ({ ticker, ...r, total: r.buys + r.sells }))
    .sort((a, b) => b.total - a.total || a.ticker.localeCompare(b.ticker))

  return (
    <main>
      <header className="hero">
        <p className="eyebrow">
          Congress trading — {congressChamberLabel(m.chamber)} ·{' '}
          {congressStateLabel(m.state, m.chamber)}
        </p>
        <h1>{m.name}</h1>
        <p className="subhead">
          {m.party ?? '—'} · {congressChamberLabel(m.chamber)} ·{' '}
          {congressStateLabel(m.state, m.chamber)}. Every figure below comes from the
          STOCK Act filings we have captured since {captureStart} — disclosed ranges,
          filed up to ~45 days after each trade. Context, not a signal.
        </p>
        <p className="footnote">
          Trade data by{' '}
          <a
            href="https://www.bargo.ai/free-apis/congress"
            target="_blank"
            rel="noreferrer"
          >
            Bargo
          </a>{' '}
          — built from official House &amp; Senate filings.
        </p>
      </header>

      <Card title="Filing record in the captured filings">
        <Kv k="Trades captured" v={String(m.trades)} />
        <Kv k="Buys" v={String(m.buys)} />
        <Kv k="Sells" v={String(m.sells)} />
        <Kv k="Last trade" v={dateLabel(m.last_trade)} />
        <Kv
          k="Average filing lag"
          v={m.avg_lag_days === null ? '—' : `${m.avg_lag_days} days`}
        />
        <Kv
          k="Late filings (over 45 days)"
          v={String(m.late_filings)}
        />
        {m.buy_perf_count > 0 && m.avg_buy_perf_pct !== null && (
          <Kv
            k="Avg buy performance"
            v={`${perfPct(m.avg_buy_perf_pct)} across ${m.buy_perf_count} ${
              m.buy_perf_count === 1 ? 'buy' : 'buys'
            }`}
          />
        )}
        <p className="footnote">
          The STOCK Act window is ~45 days from trade to disclosure. A late filing here is
          one whose disclosure in the captured record came after that window — the count
          covers only the filings we hold, not the member&apos;s whole history.
        </p>
        {m.buy_perf_count > 0 && (
          <p className="footnote">
            Avg buy performance is the average return since trade date on disclosed buys
            (Bargo price estimates), over the captured buys that carry a price estimate —
            a record of past moves, not what anyone following the filings could have
            earned, since each filing arrived weeks after its trade.
          </p>
        )}
      </Card>

      <Card title="Most-traded tickers">
        <table className="tabled">
          <thead>
            <tr>
              <th>Ticker</th>
              <th className="num">Trades</th>
              <th className="num">Buys</th>
              <th className="num">Sells</th>
            </tr>
          </thead>
          <tbody>
            {tickerRows.slice(0, 15).map((r) => (
              <tr key={r.ticker}>
                <td>
                  {cardSet.has(r.ticker) ? (
                    <Link href={`/stock/${r.ticker}`}>
                      <strong>{r.ticker}</strong>
                    </Link>
                  ) : (
                    <strong>{r.ticker}</strong>
                  )}
                </td>
                <td className="num">{r.total}</td>
                <td className="num">{r.buys}</td>
                <td className="num">{r.sells}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Portfolio from filings">
        <table className="tabled">
          <thead>
            <tr>
              <th>Ticker</th>
              <th className="num">Buys</th>
              <th className="num">Sells</th>
              <th>Net disclosed range</th>
            </tr>
          </thead>
          <tbody>
            {tickerRows.map((r) => (
              <tr key={r.ticker}>
                <td>
                  {cardSet.has(r.ticker) ? (
                    <Link href={`/stock/${r.ticker}`}>
                      <strong>{r.ticker}</strong>
                    </Link>
                  ) : (
                    <strong>{r.ticker}</strong>
                  )}
                </td>
                <td className="num">{r.buys}</td>
                <td className="num">{r.sells}</td>
                <td>{rangeLabel(r.buyLow - r.sellHigh, r.buyHigh - r.sellLow)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">
          Estimate from captured filings only. Members may hold positions from before our
          window; amounts are disclosed ranges.
        </p>
        <p className="footnote">
          The net range sums the buy bands and subtracts the sell bands — the low end
          subtracts the largest possible sales, the high end the smallest — so it is a
          band on a band, not a holding value. Nothing here says what the member holds
          today.
        </p>
      </Card>

      <Card title={`All captured trades — ${trades.length}`}>
        <div className="table-scroll">
        <table className="tabled dense">
          <thead>
            <tr>
              <th>Disclosed</th>
              <th>Ticker</th>
              <th>Type</th>
              <th className="nw">Amount range</th>
              <th className="nw">Trade date</th>
              <th className="num nw">Lag</th>
              <th className="num nw">Price then → now</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t, i) => (
              <tr key={`${t.ticker}-${t.transaction_date}-${t.type}-${i}`}>
                <td>{dateLabel(t.disclosure_date)}</td>
                <td>
                  {cardSet.has(t.ticker) ? (
                    <Link href={`/stock/${t.ticker}`}>
                      <strong>{t.ticker}</strong>
                    </Link>
                  ) : (
                    <strong>{t.ticker}</strong>
                  )}
                </td>
                <td>{congressTypeLabel(t.type)}</td>
                <td className="nw">{t.amount_range}</td>
                <td className="nw">{dateLabel(t.transaction_date)}</td>
                <td className="num nw">{t.lag_days === null ? '—' : `${t.lag_days}d`}</td>
                <td className="num nw">
                  {t.est_price === null && t.recent_price === null
                    ? '—'
                    : `${money(t.est_price)} → ${money(t.recent_price)}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <p className="footnote">
          &ldquo;Price then → now&rdquo; is Bargo&apos;s estimate of the price at the trade
          and its recent price — neither is a fill price. The authoritative record is the
          filing itself, on the official portals linked from the{' '}
          <Link href="/congress">Congress board</Link>.
        </p>
      </Card>

      <p>
        <Link href="/congress">← All Congress trading</Link>
      </p>
    </main>
  )
}
