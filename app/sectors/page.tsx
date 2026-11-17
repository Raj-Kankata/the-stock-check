import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, scoreSpan, signedSpan } from '@/components/ui'
import SectorCalculator from '@/components/SectorCalculator'
import { RESULTS } from '@/lib/data'
import { ROTATION_FORMULAS } from '@/lib/site-server'

export const metadata: Metadata = {
  title: 'Sector Rotation',
  description:
    'The sector rotation model: relative strength, momentum, acceleration and flow labels, with a live calculator. Formulas ported from colicoid’s TradingView Pine Script.'
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

export default function SectorsPage() {
  const f = ROTATION_FORMULAS
  const ex = f.workedExample

  // Scored names by Yahoo sector, computed live from results.json:
  // names count + median overall score per sector, most names first.
  const scoresBySector = new Map<string, number[]>()
  for (const t of Object.values(RESULTS.tickers)) {
    const list = scoresBySector.get(t.sector) ?? []
    list.push(t.overall_score)
    scoresBySector.set(t.sector, list)
  }
  const sectors = [...scoresBySector.entries()]
    .map(([sector, scores]) => ({
      sector,
      count: scores.length,
      medianScore: median(scores),
    }))
    .sort((a, b) => b.count - a.count)
  const healthcare = sectors.find((s) => s.sector === 'Healthcare')

  return (
    <>
      <h1>Sector Rotation</h1>
      <p className="page-intro">
        Which sectors are attracting money, which are turning, and which are losing it — scored
        from each sector&rsquo;s returns against the S&amp;P 500.
      </p>

      <div className="callout">
        <strong>No live sector table in this build.</strong> The formulas and the calculator
        below are here, but the live 42-ETF sector table is not — there is no market-data feed
        wired in this build yet. The live table arrives with the market-data feed. No sector
        return, ETF price or flow reading is shown here, because none has been computed from
        live data.
      </div>

      <Card title="Scored names by sector">
        <p>
          The scored universe, grouped by Yahoo sector — how many names are scored in each
          sector, and the median overall score of those names. This is a count of scored
          names, not a rotation reading: no sector return, ETF price or flow is shown here.
        </p>
        <table>
          <thead>
            <tr>
              <th>Sector</th>
              <th className="num">Names</th>
              <th className="num">Median score</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map(({ sector, count, medianScore }) => (
              <tr key={sector}>
                <td>
                  <Link href={`/stocks?sector=${encodeURIComponent(sector)}`}>
                    <strong>{sector}</strong>
                  </Link>
                </td>
                <td className="num">{count}</td>
                <td className="num">{scoreSpan(medianScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">
          {Object.keys(RESULTS.tickers).length} names scored so far. Counts and medians are
          computed live from the scored universe; the median is of the overall score. Tap a
          sector to open the All Stocks list for that sector.
        </p>
      </Card>

      <Card title="The formulas">
        <p>
          Attribution: {f.attribution}
        </p>
        <ul>
          <li>
            <strong>Relative strength:</strong> {f.rs}
          </li>
          <li>
            <strong>Momentum:</strong> {f.momentum}
          </li>
          <li>
            <strong>Acceleration:</strong> {f.acceleration}
          </li>
          <li>
            <strong>Change in 1-month return:</strong> {f.delta1m}
          </li>
          <li>
            <strong>Flow:</strong> {f.flow}
          </li>
        </ul>
        <p className="footnote">
          Momentum weights the most recent returns most heavily (1W &times;3, 1M &times;2, 2M
          &times;1, 3M &times;0.5, divided by 6.5). Acceleration compares the recent average
          (1W &times;2, 1M) with the older average (3M, 6M): a positive number means the
          sector is speeding up, a negative number means it is slowing down even if returns
          are still positive.
        </p>
      </Card>

      <SectorCalculator />

      <Card title="Worked example — Health Care (XLV)">
        <p>
          Published 15 Nov 2026. Inputs: 1W +{ex.returns.w1}, 1M +{ex.returns.m1}, 2M +
          {ex.returns.m2}, 3M +{ex.returns.m3}, 6M +{ex.returns.m6} (all percent).
        </p>
        <table>
          <thead>
            <tr>
              <th>Output</th>
              <th className="num">Value</th>
              <th>Arithmetic</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Momentum</td>
              <td className="num">{signedSpan(ex.momentum, `+${ex.momentum.toFixed(1)}`)}</td>
              <td>
                (2.2&times;3 + 6.6&times;2 + 13.1&times;1 + 13.5&times;0.5) &divide; 6.5 =
                39.65 &divide; 6.5 = +6.1
              </td>
            </tr>
            <tr>
              <td>Acceleration</td>
              <td className="num">{signedSpan(ex.acceleration, ex.acceleration.toFixed(1))}</td>
              <td>
                (2.2&times;2 + 6.6) &divide; 3 &minus; (13.5 + 31.2) &divide; 2 = 3.67 &minus;
                22.35 = &minus;18.7
              </td>
            </tr>
            <tr>
              <td>Relative strength (RS)</td>
              <td className="num">{signedSpan(ex.rs, `+${ex.rs.toFixed(1)} pts`)}</td>
              <td>
                Sector 21-day return minus SPY 21-day return — the published gap; the two
                21-day returns were not published separately.
              </td>
            </tr>
            <tr>
              <td>Flow</td>
              <td className="num">
                <span className="pill neutral">No flow signal</span>
              </td>
              <td>
                Momentum +6.1 clears the IN momentum bar, but Acceleration &minus;18.7 does
                not; TURN needs Acceleration &gt; +5; WATCH needs 6M &lt; &minus;10 (it is
                +31.2); OUT needs Momentum &lt; &minus;5.
              </td>
            </tr>
          </tbody>
        </table>
        <p className="footnote">
          The lesson of this example: Health Care had strong recent returns and was beating the
          market (RS +8.8), but its momentum was decelerating hard (Acceleration &minus;18.7)
          because the big gains were months ago, not now. A high Momentum alone does not make a
          sector an IN.
        </p>
        {healthcare ? (
          <p>
            <Link href="/stocks?sector=Healthcare">
              See the {healthcare.count} Healthcare names &rarr;
            </Link>
          </p>
        ) : null}
      </Card>

      <Card title="How to read the flow labels">
        <ul>
          <li>
            <strong>IN</strong> — Momentum above +5 and Acceleration above +2: the sector is
            strong and speeding up.
          </li>
          <li>
            <strong>TURN</strong> — Momentum above 0 and Acceleration above +5: the sector is
            turning up fast from a weak base.
          </li>
          <li>
            <strong>WATCH</strong> — 6-month return below &minus;10%, 1-month return above 0
            and Acceleration above 0: a beaten-down sector starting to stabilise.
          </li>
          <li>
            <strong>OUT</strong> — Momentum below &minus;5 and Acceleration below &minus;2: the
            sector is weak and slowing further.
          </li>
          <li>
            <strong>No flow signal</strong> — none of the four conditions is met. Most sectors,
            most of the time, sit here.
          </li>
        </ul>
        <p className="footnote">
          Flow labels are a rotation read, not a recommendation to buy or sell any security.
          See Methodology for what this site&rsquo;s scores are — and are not.
        </p>
      </Card>
    </>
  )
}
