import type { Metadata } from 'next'
import Link from 'next/link'
import { Card } from '@/components/ui'
import CongressBrowser, { type CongressTradeRow } from '@/components/CongressBrowser'
import { dateLabel, int, money } from '@/lib/format'
import { TICKER_SYMBOLS } from '@/lib/data'
import {
  CONGRESS_AS_OF,
  CONGRESS_CAPTURE_START,
  CONGRESS_MEMBERS,
  CONGRESS_PARTY_MAP,
  CONGRESS_PERF_AS_OF,
  CONGRESS_STATS,
  CONGRESS_TOP_BUYS,
  CONGRESS_TRADES,
  CONGRESS_WORST_BUYS,
  congressChamberLabel,
  congressStateLabel,
  congressTypeLabel,
  type CongressTrade,
} from '@/lib/congress-data'

export const metadata: Metadata = {
  title: 'Congress trading · The Stock Check',
  description:
    'What members of Congress disclosed buying and selling, from the official STOCK Act filings — amounts are disclosed ranges, filings lag trades by up to ~45 days. No score, no fair value, no verdict.',
}

/** The board table carries the latest filings only; every member's
    full captured history is on their page. */
const BOARD_ROWS = 500

const BARGO_URL = 'https://www.bargo.ai/free-apis/congress'

/** Bargo's perf_pct is already in percent units (3.87 = +3.87%) —
    unlike lib/format's pct(), which takes a fraction. */
function perfPct(v: number | null): string {
  if (v === null) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

function PerfTable({
  rows,
  cardSet,
}: {
  rows: CongressTrade[]
  cardSet: Set<string>
}) {
  return (
    <div className="table-scroll">
    <table className="tabled dense">
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Member</th>
          <th className="nw">Trade date</th>
          <th>Disclosed</th>
          <th className="nw">Amount range</th>
          <th className="num nw">Price then → now</th>
          <th className="num">Return</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t, i) => (
          <tr key={`${t.member_slug}-${t.ticker}-${t.transaction_date}-${i}`}>
            <td>
              {cardSet.has(t.ticker) ? (
                <Link href={`/stock/${t.ticker}`}>
                  <strong>{t.ticker}</strong>
                </Link>
              ) : (
                <strong>{t.ticker}</strong>
              )}
            </td>
            <td>
              <Link href={`/congress/${t.member_slug}`}>{t.member}</Link>
            </td>
            <td className="nw">{dateLabel(t.transaction_date)}</td>
            <td>{dateLabel(t.disclosure_date)}</td>
            <td className="nw">{t.amount_range}</td>
            <td className="num nw">
              {t.est_price === null && t.recent_price === null
                ? '—'
                : `${money(t.est_price)} → ${money(t.recent_price)}`}
            </td>
            <td className="num">
              <span
                className={
                  t.perf_pct !== null && t.perf_pct >= 0
                    ? 'num-pos'
                    : 'num-neg'
                }
              >
                {perfPct(t.perf_pct)}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
}

export default function CongressPage() {
  const cardSet = new Set(TICKER_SYMBOLS)
  const asOf = dateLabel(CONGRESS_AS_OF)
  const captureStart = dateLabel(CONGRESS_CAPTURE_START)

  const rows: CongressTradeRow[] = CONGRESS_TRADES.slice(0, BOARD_ROWS).map((t) => ({
    disclosed: t.disclosure_date,
    disclosedLabel: dateLabel(t.disclosure_date),
    member: t.member,
    memberSlug: t.member_slug,
    party: t.party,
    chamber: t.chamber,
    stateLabel: congressStateLabel(t.state, t.chamber),
    ticker: t.ticker,
    hasCard: cardSet.has(t.ticker),
    type: t.type,
    typeLabel: congressTypeLabel(t.type),
    amountRange: t.amount_range,
    tradeDateLabel: dateLabel(t.transaction_date),
    lagDays: t.lag_days,
    estPrice: t.est_price,
    recentPrice: t.recent_price,
  }))

  const groups = (['Democratic', 'Bipartisan', 'Republican'] as const).map((g) => ({
    group: g,
    rows: CONGRESS_PARTY_MAP.filter((p) => p.group === g),
  }))

  return (
    <main>
      <header className="hero">
        <p className="eyebrow">Congress trading — STOCK Act filings · no score · no verdict</p>
        <h1>Congress trading</h1>
        <p className="subhead">
          What members of the House and Senate disclosed buying and selling — read from the
          official filings, not from rumours. This board is context, not a signal: a
          disclosed trade tells you what a member filed, weeks after the fact, in a dollar
          range. It is never a recommendation to follow them.
        </p>
        <p className="footnote">
          Trade data by{' '}
          <a href={BARGO_URL} target="_blank" rel="noreferrer">
            Bargo
          </a>{' '}
          — built from official House &amp; Senate filings. Filings captured since{' '}
          {captureStart}; latest disclosure {asOf}.
        </p>
      </header>

      <Card title="How to read this board" accent="amber">
        <ul>
          <li>
            <strong>Amounts are ranges.</strong> The STOCK Act requires members to disclose
            a dollar band (for example $1,001 – $15,000), never an exact figure. We show
            the band exactly as filed.
          </li>
          <li>
            <strong>Filings lag trades by up to ~45 days.</strong> Every row shows the trade
            date and the disclosure date side by side, with the lag in days. A position
            disclosed today may already have been sold.
          </li>
          <li>
            <strong>Coverage grows nightly.</strong> We capture new filings as they are
            published and keep our own store, starting {captureStart}. Early on, the board
            shows the most active filers first — it is not yet the whole Congress.
          </li>
        </ul>
      </Card>

      <Card title="Most traded by Congress (90 days)">
        <table className="tabled">
          <thead>
            <tr>
              <th>Ticker</th>
              <th className="num">Trades</th>
              <th className="num">Buys</th>
              <th className="num">Sells</th>
              <th className="num">Members</th>
            </tr>
          </thead>
          <tbody>
            {CONGRESS_STATS.most_traded_90d.map((r) => (
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
                <td className="num">{r.trades}</td>
                <td className="num">{r.buys}</td>
                <td className="num">{r.sells}</td>
                <td className="num">{r.members}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">
          Bargo&apos;s 90-day ranking across its full dataset ({int(CONGRESS_STATS.totals.trades)}{' '}
          disclosed trades from {int(CONGRESS_STATS.totals.members)} members in total) — not
          just the filings we have captured below. A ticker links to its check when we score
          it.
        </p>
      </Card>

      <Card title="How disclosed buys have done">
        {CONGRESS_TOP_BUYS.length === 0 ? (
          <p className="footnote">
            No disclosed buys with a price estimate in the filings captured so far.
          </p>
        ) : (
          <>
            <h3>Best-performing disclosed buys</h3>
            <PerfTable rows={CONGRESS_TOP_BUYS} cardSet={cardSet} />
            <h3>Worst-performing disclosed buys</h3>
            <PerfTable rows={CONGRESS_WORST_BUYS} cardSet={cardSet} />
          </>
        )}
        <p className="footnote">
          Performance is the return since the member&apos;s trade date using{' '}
          <a href={BARGO_URL} target="_blank" rel="noreferrer">
            Bargo
          </a>
          &apos;s price estimates, as of{' '}
          {CONGRESS_PERF_AS_OF ? dateLabel(CONGRESS_PERF_AS_OF) : 'the latest capture'}. It
          is a record of past moves, not a backtest, not a signal, and not what a follower
          could have earned — filings arrive up to ~45 days after the trade, so the move
          was already history before the filing became public. Buys only, from the filings
          we have captured since {captureStart}; a member&apos;s average across their buys
          is on their page.
        </p>
      </Card>

      <Card title="Party money map">
        {groups.map(({ group, rows: grows }) => (
          <div key={group}>
            <h3>{group}</h3>
            {grows.length === 0 ? (
              <p className="footnote">
                No tickers in this group in the filings captured so far.
              </p>
            ) : (
              <table className="tabled">
                <thead>
                  <tr>
                    <th>Ticker</th>
                    <th className="num">Dem buys</th>
                    <th className="num">Dem sells</th>
                    <th className="num">Rep buys</th>
                    <th className="num">Rep sells</th>
                  </tr>
                </thead>
                <tbody>
                  {grows.map((p) => (
                    <tr key={p.ticker}>
                      <td>
                        {cardSet.has(p.ticker) ? (
                          <Link href={`/stock/${p.ticker}`}>
                            <strong>{p.ticker}</strong>
                          </Link>
                        ) : (
                          <strong>{p.ticker}</strong>
                        )}
                      </td>
                      <td className="num">{p.dem_buys}</td>
                      <td className="num">{p.dem_sells}</td>
                      <td className="num">{p.rep_buys}</td>
                      <td className="num">{p.rep_sells}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
        <p className="footnote">
          Computed from the filings we have captured since {captureStart} (disclosed in the
          last 90 days, at least two trades): a ticker sits under a party when that
          party&apos;s members net-bought it — more buys than sells — and the other party
          did not; &ldquo;Bipartisan&rdquo; when both did. Party is matched from the
          congress-legislators record of the current Congress; a member we cannot match is
          left out of this panel rather than guessed. The map grows as the nightly capture
          grows.
        </p>
      </Card>

      <Card title={`Latest disclosed trades — ${rows.length} filings`}>
        <CongressBrowser rows={rows} totalCaptured={CONGRESS_TRADES.length} />
      </Card>

      <Card title="Members in the captured filings">
        <table className="tabled">
          <thead>
            <tr>
              <th>Member</th>
              <th>Party</th>
              <th>Chamber / State</th>
              <th className="num">Trades captured</th>
              <th className="num">Buys</th>
              <th className="num">Sells</th>
              <th>Last trade</th>
            </tr>
          </thead>
          <tbody>
            {CONGRESS_MEMBERS.map((m) => (
              <tr key={m.slug}>
                <td>
                  <Link href={`/congress/${m.slug}`}>{m.name}</Link>
                </td>
                <td>{m.party ?? '—'}</td>
                <td>
                  {congressChamberLabel(m.chamber)} ·{' '}
                  {congressStateLabel(m.state, m.chamber)}
                </td>
                <td className="num">{m.trades}</td>
                <td className="num">{m.buys}</td>
                <td className="num">{m.sells}</td>
                <td>{dateLabel(m.last_trade)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">
          Counts are the filings we have captured since {captureStart} — a member with a
          long filing history shows only what the capture holds. Each member page carries
          their captured trades, their filing-lag record and a portfolio reconstructed from
          those filings.
        </p>
      </Card>

      <Card title="How this board is built">
        <p>
          Filings come from the two official sources — the House Clerk&apos;s financial
          disclosure system and the Senate eFD — via{' '}
          <a href={BARGO_URL} target="_blank" rel="noreferrer">
            Bargo
          </a>
          , which parses them into structured records. A nightly step pulls the newest
          disclosures into our own store and dedupes them; nothing here is typed by hand.
          Party comes from the congress-legislators project&apos;s record of the current
          Congress (each member&apos;s latest term). The official filings themselves are
          public: House disclosures at{' '}
          <a
            href="https://disclosures-clerk.house.gov/FinancialDisclosure"
            target="_blank"
            rel="noreferrer"
          >
            disclosures-clerk.house.gov
          </a>{' '}
          and Senate eFD at{' '}
          <a href="https://efdsearch.senate.gov/search/" target="_blank" rel="noreferrer">
            efdsearch.senate.gov
          </a>
          .
        </p>
      </Card>

      <Card title="Disclaimer">
        <p>
          Congress trading is research and education only, not investment advice. It carries
          no score, fair value or verdict, and a member&apos;s disclosed trade is not a
          recommendation to buy, hold or sell — members file late, file ranges, and trade
          for reasons the filings do not state. Data may be delayed or contain errors; the
          filing linked from the official portals is the authoritative record. See the{' '}
          <a href="/legal">Legal</a> page.
        </p>
      </Card>
    </main>
  )
}
