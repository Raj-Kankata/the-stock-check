import type { Metadata } from 'next'
import { Card, signedSpan } from '@/components/ui'
import SectorCalculator from '@/components/SectorCalculator'
import { ROTATION_FORMULAS } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Sector Rotation',
  description:
    'The sector rotation model: relative strength, momentum, acceleration and flow labels, with a live calculator. Formulas ported from colicoid’s TradingView Pine Script.'
}

export default function SectorsPage() {
  const f = ROTATION_FORMULAS
  const ex = f.workedExample

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
