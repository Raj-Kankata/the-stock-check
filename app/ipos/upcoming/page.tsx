import type { Metadata } from 'next'
import { Card } from '@/components/ui'
import { dateLabel } from '@/lib/format'
import { IPO_UPCOMING, getIpoUpcomingStatus, type IpoUpcomingEntry } from '@/lib/ipo-data'

export const metadata: Metadata = {
  title: 'Upcoming IPO calendar · The Stock Check',
  description:
    'Mega-IPOs that have filed to go public but have not listed yet — the filing, the expected timing and the terms as filed. A tracker, not a check: no score, no fair value, no verdict.',
}

const STATUS_PILL: Record<IpoUpcomingEntry['status'], string> = {
  confidential: 'neutral',
  filed: 'neutral',
  postponed: 'avoid',
  priced: 'growth',
  'terms-set': 'watch',
}

function statusLine(entry: IpoUpcomingEntry): string {
  const s = getIpoUpcomingStatus(entry.id)
  if (!s) return 'Status check not yet run.'
  const bits: string[] = []
  if (s.latest_form && s.latest_filing_date) {
    bits.push(`Latest filing on EDGAR: ${s.latest_form}, ${dateLabel(s.latest_filing_date)}`)
  } else if (s.latest_form) {
    bits.push(`Latest filing on EDGAR: ${s.latest_form}`)
  }
  if (s.has_424b4) bits.push('a final prospectus (424B4) exists — this name has priced')
  if (s.withdrawn) bits.push('the registration has been withdrawn (RW)')
  if (s.listed) bits.push('this name has started trading')
  if (bits.length === 0) bits.push('No public filing on EDGAR — status is from attributed press.')
  if (s.notes) bits.push(s.notes)
  return bits.join('. ') + '.'
}

export default function UpcomingIposPage() {
  const asOf = dateLabel(IPO_UPCOMING.as_of)
  const entries = IPO_UPCOMING.entries
  return (
    <main>
      <header className="hero">
        <p className="eyebrow">Upcoming IPOs — filed, not yet listed · no score · no fair value · no verdict</p>
        <h1>Upcoming IPO calendar</h1>
        <p className="subhead">
          Mega-IPOs that have filed to go public but have not listed yet. Each entry carries
          the filing, the expected timing and the terms as filed — with every date and figure
          attributed. Expected dates are reported expectations, not facts, and they slip:
          filings are amended, raises are cut, listings are postponed. This is a tracker,
          not a check: no score, no fair value, no verdict.
        </p>
        <p>
          Checked {asOf} · {entries.length} names · weekly check · hand-maintained
        </p>
      </header>

      <Card title={`The calendar — ${entries.length} filed mega-IPOs not yet listed`}>
        <table className="tabled">
          <thead>
            <tr>
              <th>Company</th>
              <th>Ticker</th>
              <th>Status</th>
              <th>Price range</th>
              <th className="num">Raise target</th>
              <th className="num">Valuation target</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td>
                  <a href={`#${e.id}`}>{e.company}</a>
                  <br />
                  <span className="footnote">{e.sector}</span>
                </td>
                <td>
                  {e.ticker ? (
                    <a href={e.filing_url} target="_blank" rel="noreferrer">
                      {e.ticker}
                    </a>
                  ) : (
                    '—'
                  )}
                </td>
                <td>
                  <span className={`pill ${STATUS_PILL[e.status]}`}>{e.status_label}</span>
                </td>
                <td>{e.price_range ?? 'Not set'}</td>
                <td className="num">{e.raise_target ?? 'Not disclosed'}</td>
                <td className="num">{e.valuation_target ?? 'Not disclosed'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">
          Ticker links go to the filing list on SEC EDGAR. &ldquo;Raise target&rdquo; and
          &ldquo;valuation target&rdquo; are reported figures from attributed press unless
          the note says they come from the filing — they are not terms. &ldquo;Not set&rdquo;
          means the filing still leaves the item blank. Click a company name for the full
          entry below.
        </p>
      </Card>

      {entries.map((e) => (
        <Card key={e.id} title={`${e.company}${e.ticker ? ` (${e.ticker})` : ''}`} id={e.id}>
          <p>
            <span className={`pill ${STATUS_PILL[e.status]}`}>{e.status_label}</span>{' '}
            {e.exchange} · {e.sector}
          </p>
          <p>{e.what_it_does}</p>
          <h3>Expected timing</h3>
          <p>{e.expected}</p>
          <h3>Terms as filed</h3>
          <table className="tabled">
            <tbody>
              <tr>
                <td>Price range</td>
                <td className="num">
                  <strong>{e.price_range ?? 'Not set'}</strong>
                  <br />
                  <span className="footnote">{e.price_range_note}</span>
                </td>
              </tr>
              {e.shares_offered ? (
                <tr>
                  <td>Shares offered</td>
                  <td className="num">
                    <strong>{e.shares_offered}</strong>
                    {e.shares_offered_note ? (
                      <>
                        <br />
                        <span className="footnote">{e.shares_offered_note}</span>
                      </>
                    ) : null}
                  </td>
                </tr>
              ) : null}
              <tr>
                <td>Raise target</td>
                <td className="num">
                  <strong>{e.raise_target ?? 'Not disclosed'}</strong>
                  <br />
                  <span className="footnote">{e.raise_target_note}</span>
                </td>
              </tr>
              <tr>
                <td>Valuation target</td>
                <td className="num">
                  <strong>{e.valuation_target ?? 'Not disclosed'}</strong>
                  <br />
                  <span className="footnote">{e.valuation_target_note}</span>
                </td>
              </tr>
              <tr>
                <td>Lead underwriters</td>
                <td className="num">{e.underwriters}</td>
              </tr>
            </tbody>
          </table>
          <h3>The filing</h3>
          <p>
            {e.filing}{' '}
            <a href={e.filing_url} target="_blank" rel="noreferrer">
              Filing list on SEC EDGAR
            </a>
            {e.filing_url_note ? ` — ${e.filing_url_note}` : ''}
          </p>
          <p className="footnote">{statusLine(e)}</p>
          <h3>What to watch</h3>
          <p>{e.watch}</p>
          <h3>Sources</h3>
          <ul>
            {e.sources.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </Card>
      ))}

      <Card title="How the calendar is built" accent="amber">
        <p>
          An entry is added when it is a mega-IPO (a raise of $1B or more, or a valuation
          of $10B or more) with a filing on record — a public S-1 / F-1 on SEC EDGAR, or a
          company-confirmed confidential filing. SPACs, funds and sub-$1B deals are not
          listed. EDGAR is the authority for what is actually filed: the weekly check reads
          each company&apos;s filing index for new amendments, a final prospectus (424B4)
          or a withdrawal (RW), and checks whether the ticker has started trading. Dates
          and reported figures come from attributed press — Nasdaq&apos;s and Renaissance
          Capital&apos;s calendars and stockanalysis.com&apos;s filings list are used as
          discovery, and every date is cross-checked to EDGAR or a named outlet before it
          is written. New entries are added by hand; the weekly check never writes an
          entry, it only flags changes.
        </p>
        <p>
          When an IPO lists, it graduates off this calendar: a final prospectus and a first
          trading day mean a dossier is built under the same mega rule, and this page points
          at it. A postponed name stays, with the postponement date; a withdrawn name is
          removed, with the removal noted in the method record. An empty honest calendar
          beats a padded one — if only a handful are verifiable, only the handful are shown.
        </p>
      </Card>

      <Card title="How to read this calendar">
        <ul>
          <li>
            &ldquo;Expected&rdquo; means reported, not promised. IPO dates are rarely set
            more than 7–10 days in advance, and the names here have all moved their
            windows at least once.
          </li>
          <li>
            Postponed is not withdrawn. A postponed name keeps its filing on record and can
            return; a withdrawn name leaves the calendar.
          </li>
          <li>
            Reported raise and valuation targets are not terms. Only a filed price range
            is a term — and only the final prospectus sets the price.
          </li>
          <li>
            A filing is not a listing. A confidential filing discloses nothing at all: no
            financials, no price, no ticker, no date.
          </li>
          <li>
            A name on this calendar is not a recommendation, and its presence here says
            nothing about whether the listing will be a good investment.
          </li>
        </ul>
      </Card>

      <Card title="Disclaimer">
        <p>
          The upcoming-IPO calendar is research and education only, not investment advice.
          It carries no score, fair value or verdict — and it is not a recommendation to
          buy, hold or sell any security, listed or unlisted. Filing figures are from SEC
          EDGAR as cited; expected dates and reported figures are attributed press, not our
          view. Data may be delayed or inaccurate. See the <a href="/legal">Legal</a> page.
        </p>
      </Card>
    </main>
  )
}
