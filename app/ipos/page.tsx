import type { Metadata } from 'next'
import Link from 'next/link'
import { Card } from '@/components/ui'
import { IpoLiveStatusLine, LiveIpoRows } from '@/components/IpoLive'
import { dateLabel } from '@/lib/format'
import { IPO_RESULTS, IPO_UPCOMING, IPO_UPCOMING_COUNT } from '@/lib/ipo-data'
import { allIpoRows } from '@/lib/public'

export const metadata: Metadata = {
  title: 'IPO dossiers · The Stock Check',
  description:
    'Recent mega-IPOs that are too new for a five-pillar check — the tape, the filing, the calendar and the path to a check. No score, no fair value, no verdict.',
}

export default function IposPage() {
  const rows = allIpoRows()
  const priceDate = dateLabel(IPO_RESULTS.price_date)
  return (
    <main>
      <header className="hero">
        <p className="eyebrow">IPO dossiers — no score · no fair value · no verdict</p>
        <h1>IPO dossiers</h1>
        <p className="subhead">
          Recent mega-IPOs that are too new for a five-pillar check. Each dossier carries the
          tape, the filing, the calendar and the path to a check — with no score, no fair
          value and no verdict, because a dossier is not a check.
        </p>
        <IpoLiveStatusLine priceDateLabel={priceDate} />
      </header>

      <Card title={`Dossiers — ${rows.length} listings`}>
        <table className="tabled">
          <thead>
            <tr>
              <th>IPO</th>
              <th className="num">Price</th>
              <th className="num">Vs offer</th>
              <th className="num">Market cap</th>
              <th className="num">Price bars</th>
              <th className="num">Quarters</th>
              <th>Unlock ETA</th>
            </tr>
          </thead>
          <tbody>
            <LiveIpoRows rows={rows} />
          </tbody>
        </table>
        <p className="footnote">
          Prices as of the {priceDate} close (live in market hours). Market cap is the
          outstanding basis — the fully-diluted and float figures are on each dossier page.
          &ldquo;Price bars&rdquo; is the path to a full check: the engine needs 200 price
          bars and four public-company quarters. &ldquo;Unlock ETA&rdquo; is when the full
          check becomes possible, not a price call.
        </p>
      </Card>

      <Card title={`Upcoming — ${IPO_UPCOMING_COUNT} filed mega-IPOs not yet listed`}>
        <p>
          Companies that have filed to go public but have not listed yet:{' '}
          {IPO_UPCOMING.entries
            .map((e) => `${e.company}${e.ticker ? ` (${e.ticker})` : ''}`)
            .join(', ')}
          . The calendar carries the filing, the expected timing and the terms as filed —
          with no score, no fair value and no verdict, because a tracker is not a check.
        </p>
        <p>
          <Link href="/ipos/upcoming">The upcoming IPO calendar →</Link>
        </p>
      </Card>

      <Card title="How a dossier is built" accent="amber">
        <p>
          A dossier is built for a listing when it is a mega-IPO (a raise of $1B or more, or
          a valuation of $10B or more) or a heavily-searched name with no card. Every figure
          in the filing section comes from the S-1 / 424B4 on SEC EDGAR — never from press
          summaries alone — and cites the filing and date. The &ldquo;What the market is
          saying&rdquo; section is fenced speculation: every item carries its source and
          date, and nothing unattributed is repeated. Valuation context is arithmetic on
          verified numbers — never a DCF, never a fair value, never a verdict.
        </p>
      </Card>

      <Card title="How to read this board">
        <ul>
          <li>
            &ldquo;Vs offer&rdquo; is the move since the offer price — the first print is
            usually above it, so it is not a return anyone necessarily earned.
          </li>
          <li>
            A dossier with 200 price bars and four quarters becomes a full five-pillar
            check. Until then, the bars and quarters columns are the progress — not a
            countdown to a recommendation.
          </li>
          <li>
            Market cap here is the outstanding basis. Fully diluted (which counts options,
            RSUs and convertibles) is on each dossier page and is the larger number where
            it exists.
          </li>
          <li>
            Lockup releases and index-inclusion dates are on each dossier&apos;s calendar,
            with the source for each date.
          </li>
        </ul>
      </Card>

      <Card title="Disclaimer">
        <p>
          IPO dossiers are research and education only, not investment advice. They carry
          no score, fair value or verdict — and they are not a recommendation to buy, hold
          or sell. Prices are delayed ~15 min when live and are otherwise the {priceDate}{' '}
          close. Filing figures are from SEC EDGAR as cited; press items are attributed
          speculation, not our view. Data may be delayed or inaccurate. See the{' '}
          <a href="/legal">Legal</a> page.
        </p>
      </Card>
    </main>
  )
}
