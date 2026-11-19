import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Card } from '@/components/ui'
import { IpoLivePrice, IpoLiveStatusLine } from '@/components/IpoLive'
import { bigUsd, dateLabel, int, money } from '@/lib/format'
import {
  IPO_BARS_NEEDED,
  IPO_RESULTS,
  IPO_SYMBOLS,
  barsRemaining,
  getIpo,
  getIpoDossier,
  getIpoUniverse,
} from '@/lib/ipo-data'
import { signedPctSpan } from '@/components/ui'

const tickerList = [...IPO_SYMBOLS].sort()
export const dynamicParams = false
export function generateStaticParams(): { ticker: string }[] {
  return tickerList.map((ticker) => ({ ticker }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>
}): Promise<Metadata> {
  const { ticker } = await params
  const t = getIpo(ticker)
  const u = getIpoUniverse(ticker)
  if (!t || !u) return { title: 'IPO dossier not found · The Stock Check' }
  return {
    title: `${ticker} IPO dossier — ${u.company} · The Stock Check`,
    description:
      `${t.name} listed ${dateLabel(u.listing_date)} at $${u.offer_price} — ` +
      `the tape, the filing, the calendar and the path to a full check. ` +
      `No score, no fair value, no verdict: a dossier is not a check.`,
  }
}

function ProgressBar({ label, done, total }: { label: string; done: number; total: number }) {
  const pctDone = Math.min(100, Math.round((done / total) * 100))
  return (
    <div className="scorebar">
      <div className="label">{label}</div>
      <div className="track">
        <div className="fill neutral" style={{ width: `${pctDone}%` }} />
      </div>
      <div className="value">
        {done} / {total}
      </div>
    </div>
  )
}

export default async function IpoDossierPage({
  params,
}: {
  params: Promise<{ ticker: string }>
}) {
  const { ticker } = await params
  const t = getIpo(ticker)
  const u = getIpoUniverse(ticker)
  const dossier = getIpoDossier(ticker)
  if (!t || !u || !dossier) notFound()

  const priceDate = dateLabel(IPO_RESULTS.price_date)
  const vsOffer = t.price / u.offer_price - 1
  const path = dossier.path_to_check
  const barsLeft = barsRemaining(t.bars)

  return (
    <main>
      <header className="hero">
        <p className="eyebrow">IPO dossier — no score · no fair value · no verdict</p>
        <h1>
          {ticker} — {t.name}
        </h1>
        <p className="subhead">
          {u.company} · {t.sector} · {u.exchange} · Listed {dateLabel(u.listing_date)}
        </p>
        <p className="subhead">
          <IpoLivePrice symbol={ticker} price={t.price} changePct={t.change_pct} />
        </p>
        <IpoLiveStatusLine priceDateLabel={priceDate} />
      </header>

      <Card title="What a dossier is — and what it is not" accent="amber">
        <p>
          {t.name} is too new for a five-pillar check: the engine needs 200 price bars and
          four public-company quarters of filings, and {ticker} has neither yet. This dossier
          is the next best thing — everything that can be verified about the listing, laid
          out in the platform&apos;s framework, with no score, no fair value and no verdict.
          Nothing here is a buy, hold or sell signal, and nothing in the
          &ldquo;What the market is saying&rdquo; section is our view. When {ticker} clears
          the bars and quarters gates, this page links to the full check.
        </p>
      </Card>

      <Card title="The tape">
        <table className="tabled">
          <tbody>
            <tr>
              <td>Price</td>
              <td className="num">
                <IpoLivePrice symbol={ticker} price={t.price} changePct={t.change_pct} />
              </td>
            </tr>
            <tr>
              <td>Change today</td>
              <td className="num">
                {t.change_pct !== null ? (
                  signedPctSpan(t.change_pct, 1, 0.001)
                ) : (
                  '— first trading day (no previous close)'
                )}
              </td>
            </tr>
            <tr>
              <td>Change vs the offer price</td>
              <td className="num">{signedPctSpan(vsOffer, 1, 0.001)}</td>
            </tr>
            <tr>
              <td>Volume</td>
              <td className="num">{int(t.volume)}</td>
            </tr>
            <tr>
              <td>Market cap — shares outstanding</td>
              <td className="num">{bigUsd(t.market_cap_outstanding_usd)}</td>
            </tr>
            {t.market_cap_fully_diluted_usd !== null ? (
              <tr>
                <td>Market cap — fully diluted</td>
                <td className="num">{bigUsd(t.market_cap_fully_diluted_usd)}</td>
              </tr>
            ) : null}
            <tr>
              <td>Market cap — float only</td>
              <td className="num">{bigUsd(t.market_cap_float_usd)}</td>
            </tr>
            <tr>
              <td>52-week range</td>
              <td className="num">
                {money(t.low_52w)} – {money(t.high_52w)}
              </td>
            </tr>
            <tr>
              <td>First trade</td>
              <td className="num">{dateLabel(u.listing_date)}</td>
            </tr>
            <tr>
              <td>Exchange</td>
              <td className="num">{u.exchange}</td>
            </tr>
          </tbody>
        </table>
        <p className="footnote">
          Market caps are price × the share counts from the prospectus (see IPO Facts) — not
          from a data vendor, because vendor share counts lag for new listings. Fully diluted
          and outstanding differ when options, RSUs and convertibles exist: both are shown
          so neither is mistaken for the other. Market caps are as of the {priceDate} close;
          the live price above moves the value, the share counts do not.
        </p>
      </Card>

      <Card title="IPO facts">
        <table className="tabled">
          <tbody>
            <tr>
              <td>Offer price</td>
              <td className="num">{money(u.offer_price)}</td>
            </tr>
            <tr>
              <td>Shares sold</td>
              <td className="num">
                {int(u.shares_sold)}
                {u.shares_sold_stockholders > 0
                  ? ` — ${int(u.shares_sold_company)} by the company, ${int(u.shares_sold_stockholders)} by selling stockholders`
                  : ' — all by the company'}
              </td>
            </tr>
            <tr>
              <td>Amount raised</td>
              <td className="num">
                {bigUsd(u.amount_raised_usd)}
                {u.amount_raised_note ? ` (${u.amount_raised_note})` : ''}
              </td>
            </tr>
            <tr>
              <td>Lead underwriters</td>
              <td className="num">{u.underwriters}</td>
            </tr>
            <tr>
              <td>Shares outstanding</td>
              <td className="num">
                {int(u.shares_outstanding)}
                {u.shares_outstanding_note ? ` — ${u.shares_outstanding_note}` : ''}
              </td>
            </tr>
            {u.shares_fully_diluted_approx !== null ? (
              <tr>
                <td>Shares, fully diluted (approx.)</td>
                <td className="num">
                  {int(u.shares_fully_diluted_approx)}
                  {u.shares_fully_diluted_note
                    ? ` — ${u.shares_fully_diluted_note}`
                    : ''}
                </td>
              </tr>
            ) : null}
            <tr>
              <td>Float</td>
              <td className="num">
                {int(u.shares_float)}
                {u.shares_float_note ? ` — ${u.shares_float_note}` : ''}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="footnote">
          Offer price, shares sold, amount raised and underwriters are from the final
          prospectus (Form 424B4) on SEC EDGAR — the listing date is the first trading day.
        </p>
      </Card>

      <Card title="The filing">
        <p>{dossier.what_it_does}</p>
        <h3>Revenue history</h3>
        <table className="tabled">
          <thead>
            <tr>
              <th>Period</th>
              <th className="num">Revenue</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {dossier.revenue_rows.map((r) => (
              <tr key={r.period}>
                <td>{r.period}</td>
                <td className="num">{bigUsd(r.revenue_usd)}</td>
                <td>{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>What matters in the filing</h3>
        <table className="tabled">
          <tbody>
            {dossier.filing_facts.map((f) => (
              <tr key={f.label}>
                <td>{f.label}</td>
                <td className="num">
                  <strong>{f.value}</strong>
                  {f.note ? <br /> : null}
                  {f.note ? <span className="footnote">{f.note}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">Source: {dossier.filing_source}</p>
      </Card>

      <Card title="The calendar">
        <table className="tabled">
          <thead>
            <tr>
              <th>Date</th>
              <th>Event</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {dossier.calendar.map((c) => (
              <tr key={`${c.date}-${c.event.slice(0, 24)}`}>
                <td>{dateLabel(c.date)}</td>
                <td>{c.event}</td>
                <td>{c.source}</td>
                <td>{c.status === 'done' ? 'Done' : 'Upcoming'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">
          Dates are from the prospectus and listing rules as cited. Lockup releases are
          maximums — the shares become sellable, they are not necessarily sold. Upcoming
          dates move if the company announces a change; this section is updated when that
          happens.
        </p>
      </Card>

      <Card title="What the market is saying" accent="amber">
        <p>
          <strong>Speculation — not our view.</strong> Everything below is an attributed
          claim from the source and date shown. We do not endorse it, and we do not repeat
          unattributed claims.
        </p>
        <ul>
          {dossier.market_says.map((m) => (
            <li key={`${m.date}-${m.source}`}>
              <strong>{dateLabel(m.date)} · {m.source}:</strong> {m.text}
            </li>
          ))}
        </ul>
        <p className="footnote">
          No analyst coverage exists yet where the quiet period is still running — initiations
          and price targets are added here once they exist, with the firm and date.
        </p>
      </Card>

      <Card title="Valuation context only">
        <p>
          Arithmetic, not a verdict. Each line divides a market value by a revenue figure
          from the filing, at the {priceDate} close. A multiple is not a price target, and a
          low multiple is not a bargain — the revenue figures differ in what they measure
          (accounting revenue, run-rate, guidance), so read the basis before the number.
        </p>
        <table className="tabled">
          <thead>
            <tr>
              <th>Basis</th>
              <th className="num">Multiple</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {dossier.valuation_context.map((v) => {
              const numerator =
                v.numerator === 'fully_diluted'
                  ? (t.market_cap_fully_diluted_usd ?? t.market_cap_outstanding_usd)
                  : t.market_cap_outstanding_usd
              const multiple = numerator / v.denominator_usd
              return (
                <tr key={v.basis}>
                  <td>
                    {v.basis}
                    <br />
                    <span className="footnote">
                      {v.numerator === 'fully_diluted'
                        ? 'Fully-diluted market cap'
                        : 'Outstanding market cap'}{' '}
                      ÷ {v.denominator_label}
                    </span>
                  </td>
                  <td className="num">
                    <strong>{multiple.toFixed(1)}x</strong>
                  </td>
                  <td>{v.note}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="footnote">
          No DCF, no fair value, no P/E from a single quarter — those need the four
          quarters of filings the engine requires.
        </p>
      </Card>

      <Card title="Path to a check">
        <ProgressBar label="Price bars" done={t.bars} total={IPO_BARS_NEEDED} />
        <p className="footnote">
          {t.bars} of 200 price bars as of the {priceDate} close
          {barsLeft > 0 ? ` — ${barsLeft} to go (about ${Math.ceil(barsLeft / 21)} more months of trading)` : ' — the bars gate passes'}.
        </p>
        <ProgressBar
          label="Public-company quarters filed"
          done={path.quarters_filed}
          total={path.quarters_needed}
        />
        <p className="footnote">{path.quarters_note}</p>
        <p>
          <strong>Blocker:</strong> {path.blocker}
        </p>
        <p>
          <strong>Unlock ETA:</strong> {path.unlock_eta}
        </p>
      </Card>

      <Card title="How to read this dossier">
        <ul>
          <li>
            A dossier is what we can say before the engine can say anything — the tape, the
            filing, the calendar and the path to a full check.
          </li>
          <li>
            &ldquo;Change vs the offer price&rdquo; is the move since listing, not a return
            anyone necessarily earned — the offer price is not a price anyone could trade at
            after the first print.
          </li>
          <li>
            Market caps use prospectus share counts, because vendor counts lag for new
            listings. Fully diluted counts everything that can become shares; outstanding
            counts what exists today; the float is what trades.
          </li>
          <li>
            Lockup releases are dates when shares <em>can</em> be sold, not dates when they
            will be — a release is a supply event, not a price forecast.
          </li>
          <li>
            The valuation multiples are arithmetic on verified numbers. They are not a
            verdict, and they do not compare like-for-like across companies unless the
            revenue basis is the same.
          </li>
          <li>
            When {ticker} clears both gates, this page links to the full five-pillar check.
            Until then, there is no score, no fair value and no verdict — by design.
          </li>
        </ul>
      </Card>

      <Card title="Disclaimer">
        <p>
          This dossier is research and education only, not investment advice. It carries no
          score, fair value or verdict — and it is not a recommendation to buy, hold or
          sell. Prices are delayed ~15 min when live and are otherwise the{' '}
          {priceDate} close. Filing figures are from SEC EDGAR as cited; press items are
          attributed speculation, not our view. Data may be delayed or inaccurate. See the{' '}
          <a href="/legal">Legal</a> page.
        </p>
      </Card>
    </main>
  )
}
