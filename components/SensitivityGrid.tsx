'use client'

import { useState } from 'react'
import { money, pct } from '@/lib/format'

/**
 * Interactive DCF sensitivity grid.
 * Rows: FCF growth assumptions. Columns: risk-free rate assumptions.
 * Click a cell to compare it with this stock's published DCF value.
 * The grid shows how the value moves under different assumptions —
 * it is not a second valuation.
 */
export default function SensitivityGrid({
  values,
  decisionLeg,
  decisionGrowth,
  price,
  fvSource,
}: {
  values: Record<string, Record<string, number>> | null
  decisionLeg: number | null
  decisionGrowth: number | null
  /** Current price, so the headline can show the cell value vs price.
      Optional: the stock page renders this grid without it and the
      headline then shows the leg value alone. */
  price?: number
  /** When the card's fair value does not come from the DCF leg, the
      page passes the leg it does come from (with the fair value) so
      the grid can say so plainly. Null = the DCF leg is the fair
      value, so no note is shown. */
  fvSource?: { fairValue: number; legLabel: string } | null
}) {
  // The decision row is the grid row whose growth matches this stock's
  // own DCF growth (its growth_scenario) — the stored grid now carries
  // that growth as its own row when it is not already a fixed row
  // (RULEBOOK §13), so the published value always sits ON a row.
  // Matched numerically (closest row), never by rounding the label:
  // BA's 4.62% reads on the 5% row, ABBV's 11.75% on its own row.
  // The page loads with that cell selected, so the headline shows the
  // decision leg; otherwise nothing is pre-selected and the headline
  // shows the decision leg itself.
  const decisionGrowthPct = decisionGrowth !== null ? decisionGrowth * 100 : null
  const gridRowLabels = values ? Object.keys(values) : []
  const decisionRowLabel =
    decisionGrowthPct !== null && gridRowLabels.length > 0
      ? gridRowLabels.reduce((best, g) =>
          Math.abs(parseFloat(g) - decisionGrowthPct) <
          Math.abs(parseFloat(best) - decisionGrowthPct)
            ? g
            : best)
      : null
  const decisionCell0 =
    decisionRowLabel !== null ? { growth: decisionRowLabel, rf: '5.0%' } : null
  const [sel, setSel] = useState<{ growth: string; rf: string } | null>(decisionCell0)

  if (!values || decisionLeg === null) {
    return (
      <div>
        <p>
          <strong>DCF sensitivity grid: skipped.</strong>
        </p>
      </div>
    )
  }

  const growthRows = Object.keys(values)
  const rfCols = Object.keys(values[growthRows[0]])
  const selectedValue =
    sel !== null ? values[sel.growth]?.[sel.rf] : undefined

  // Heat shading, scaled to this grid's own min/max: the lowest fifth of
  // values is red-tinted, the highest fifth green-tinted, the middle fifth
  // unshaded. The decision-leg cell never takes a heat class — its green
  // .decision highlight (declared after the heat rules in globals.css)
  // always wins.
  const allValues = Object.values(values).flatMap((row) => Object.values(row))
  const gridMin = Math.min(...allValues)
  const gridMax = Math.max(...allValues)
  const heatClass = (v: number): string => {
    if (gridMax === gridMin) return ''
    const t = (v - gridMin) / (gridMax - gridMin)
    if (t < 0.2) return ' heat-l2'
    if (t < 0.4) return ' heat-l1'
    if (t < 0.6) return ''
    if (t < 0.8) return ' heat-h1'
    return ' heat-h2'
  }
  const isDecisionCell = (g: string, rf: string) =>
    decisionRowLabel !== null && g === decisionRowLabel && rf === '5.0%'

  // Headline value, USA Economy Now style: the selected cell's DCF leg
  // against today's price. Defaults to the decision leg (the highlighted
  // cell); tapping any other cell moves the headline to that assumption
  // pair. This is presentation only — every value comes from the
  // precomputed grid in results.json; nothing is recomputed here.
  const headlineValue = sel !== null && selectedValue !== undefined ? selectedValue : decisionLeg
  const headlineVsPrice = price !== undefined && price > 0 ? (headlineValue - price) / price : null
  const selIsDecision = sel !== null && isDecisionCell(sel.growth, sel.rf)

  return (
    <div>
      <p className="grid-headline">
        {sel !== null ? (
          <>
            At <strong>{sel.growth} growth</strong> × <strong>{sel.rf}</strong> risk-free rate,
            the DCF leg is <span className="headline-value">{money(headlineValue)}</span>
            {selIsDecision ? ' — the decision leg' : ''}{' '}
          </>
        ) : (
          <>
            Decision DCF leg{' '}
            <span className="headline-value">{money(headlineValue)}</span>{' '}
          </>
        )}
        {headlineVsPrice !== null && (
          <>
            — <strong>{pct(headlineVsPrice, 1)}</strong> vs the {money(price)} price
          </>
        )}
        .
      </p>
      <table className="grid-table">
        <thead>
          <tr>
            <th>FCF growth ↓ / rf →</th>
            {rfCols.map((rf) => (
              <th key={rf} className="num">
                {rf}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {growthRows.map((g) => (
            <tr key={g}>
              <th>{g}</th>
              {rfCols.map((rf) => (
                <td
                  key={rf}
                  className={`cell num${isDecisionCell(g, rf) ? ' decision' : heatClass(values[g][rf])}${sel?.growth === g && sel?.rf === rf ? ' selected' : ''}`}
                  onClick={() => setSel({ growth: g, rf })}
                  title={`DCF leg at ${g} growth, ${rf} risk-free rate`}
                >
                  {money(values[g][rf])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="footnote">
        {decisionRowLabel !== null
          ? `The highlighted cell is this stock's published DCF value: ${money(decisionLeg)}. `
          : `The published DCF value is ${money(decisionLeg)}. `}
        Click any cell to compare it with the decision leg. Cells are shaded by value
        across this grid&apos;s own range — greener is a higher DCF leg, redder is lower.
      </p>
      {fvSource !== undefined && fvSource !== null && (
        <p className="footnote">
          <strong>NOTE:</strong> These are DCF-leg values only. This card&apos;s fair value (
          {money(fvSource.fairValue)}) comes from the {fvSource.legLabel} leg, not this grid.
        </p>
      )}
      {sel && selectedValue !== undefined && !selIsDecision && (
        <p>
          At <strong>{sel.growth} growth</strong> and a <strong>{sel.rf}</strong> risk-free rate,
          the DCF leg would be <strong>{money(selectedValue)}</strong> —{' '}
          {selectedValue > decisionLeg
            ? `${money(selectedValue - decisionLeg)} above`
            : selectedValue < decisionLeg
              ? `${money(decisionLeg - selectedValue)} below`
              : 'equal to'}{' '}
          the decision DCF leg ({money(decisionLeg)}).
        </p>
      )}
      <p className="footnote">
        Each row is a different growth assumption; each column is a different risk-free rate. The
        highlighted cell is this stock&apos;s published DCF value.
      </p>
    </div>
  )
}
