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
}: {
  values: Record<string, Record<string, number>> | null
  decisionLeg: number | null
  decisionGrowth: number | null
  /** Current price, so the headline can show the cell value vs price.
      Optional: the stock page renders this grid without it and the
      headline then shows the leg value alone. */
  price?: number
}) {
  // Default selection is the decision cell (this stock's own DCF leg
  // inputs: its growth × rf 5.0%), when that cell exists on the grid —
  // so the page loads with a headline value, not an empty prompt.
  // Otherwise nothing is pre-selected and the headline shows the
  // decision leg itself.
  const decisionGrowthLabel0 =
    decisionGrowth !== null ? `${Math.round(decisionGrowth * 100)}%` : null
  const decisionCell0 =
    decisionGrowthLabel0 !== null && values && Object.keys(values).includes(decisionGrowthLabel0)
      ? { growth: decisionGrowthLabel0, rf: '5.0%' }
      : null
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
  // The two grid rows the decision growth sits between (else-branch only;
  // an exact row match is handled by the highlighted-cell branch below).
  const decisionGrowthPct = decisionGrowth !== null ? decisionGrowth * 100 : null
  const growthNums = growthRows.map((g) => parseFloat(g)).filter((n) => Number.isFinite(n))
  const belowRows = decisionGrowthPct !== null ? growthNums.filter((n) => n <= decisionGrowthPct) : []
  const aboveRows = decisionGrowthPct !== null ? growthNums.filter((n) => n > decisionGrowthPct) : []
  const betweenRows =
    belowRows.length > 0 && aboveRows.length > 0
      ? `${Math.max(...belowRows)}% and ${Math.min(...aboveRows)}%`
      : growthRows.join(' and ')
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
  const decisionGrowthLabel =
    decisionGrowth !== null ? `${Math.round(decisionGrowth * 100)}%` : null
  const isDecisionCell = (g: string, rf: string) =>
    decisionGrowthLabel !== null && g === decisionGrowthLabel && rf === '5.0%'

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
        {decisionGrowthLabel !== null && growthRows.includes(decisionGrowthLabel)
          ? `The highlighted cell is this stock's published DCF value: ${money(decisionLeg)}. `
          : `The published DCF value (${money(decisionLeg)}) sits between two grid rows — its growth is ${decisionGrowth !== null ? `${(decisionGrowth * 100).toFixed(2)}%` : 'n/a'}, between the ${betweenRows} rows. `}
        Click any cell to compare it with the decision leg. Cells are shaded by value
        across this grid&apos;s own range — greener is a higher DCF leg, redder is lower.
      </p>
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
