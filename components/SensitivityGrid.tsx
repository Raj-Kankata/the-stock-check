'use client'

import { useState } from 'react'
import { money } from '@/lib/data'

/**
 * Interactive DCF sensitivity grid (SPEC v1.1 §3(a3)).
 * Rows: FCF growth 0–20% (the 20% cap). Columns: risk-free rate 4.0–6.0%.
 * Discount = rf + locked spread, so the rf 5.0% column reproduces the
 * decision DCF leg exactly where the base growth is a grid row (NVDA,
 * 20%); for other names the decision leg sits between two grid rows.
 * Click a cell to compare it with the decision DCF leg. The grid is a
 * display of the decision leg's assumption-dependence, not a second
 * valuation. Growth is capped at 20% — no 40% rows.
 */
export default function SensitivityGrid({
  values,
  decisionLeg,
  decisionGrowth,
  note,
}: {
  values: Record<string, Record<string, number>> | null
  decisionLeg: number | null
  decisionGrowth: number | null
  note: string
}) {
  const [sel, setSel] = useState<{ growth: string; rf: string } | null>(null)

  if (!values || decisionLeg === null) {
    return (
      <div>
        <p>
          <strong>DCF sensitivity grid: skipped.</strong> {note}
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

  // The decision-leg cell: growth row matching the decision growth, rf 5.0%.
  const decisionGrowthLabel =
    decisionGrowth !== null ? `${Math.round(decisionGrowth * 100)}%` : null
  const isDecisionCell = (g: string, rf: string) =>
    decisionGrowthLabel !== null && g === decisionGrowthLabel && rf === '5.0%'

  return (
    <div>
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
                  className={`cell num${isDecisionCell(g, rf) ? ' decision' : ''}${sel?.growth === g && sel?.rf === rf ? ' selected' : ''}`}
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
          ? `Highlighted cell (growth ${decisionGrowthLabel} × rf 5.0%) is the decision DCF leg: ${money(decisionLeg)}. `
          : `The decision DCF leg (${money(decisionLeg)}) sits between two grid rows — its growth is ${decisionGrowth !== null ? `${(decisionGrowth * 100).toFixed(2)}%` : 'n/a'}, between the ${betweenRows} rows at rf 5.0%. `}
        Click any cell to compare it with the decision leg.
      </p>
      {sel && selectedValue !== undefined && (
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
      <p className="footnote">{note}</p>
    </div>
  )
}
