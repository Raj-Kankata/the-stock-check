'use client'

import { useState } from 'react'

/**
 * Sector Rotation calculator — live computation of the published formulas.
 *
 * Formulas (published by stockverdicts.com, reproduced exactly):
 *   RS = sector 21-day return − SPY 21-day return
 *   Momentum = weighted average (1W×3, 1M×2, 2M×1, 3M×0.5) ÷ 6.5
 *   Acceleration = recent average (1W×2, 1M) − older average (3M, 6M),
 *   each average weighted by its weights
 *   Δ1M = this month's 1M% vs the prior month's 1M%
 *
 * Flow (checked in this order, first match wins):
 *   IN (Mom > 5 & Acc > 2) · TURN (Mom > 0 & Acc > 5) ·
 *   WATCH (6M < −10 & 1M > 0 & Acc > 0) · OUT (Mom < −5 & Acc < −2)
 */

type Inputs = {
  w1: string
  m1: string
  m2: string
  m3: string
  m6: string
  sector21d: string
  spy21d: string
  priorM1: string
}

/**
 * Worked example: Health Care (XLV), published 15 Nov 2026.
 * The published example states the RS gap (+8.8 pts) but not the two
 * 21-day returns separately, so those fields are pre-filled as +8.8 vs
 * 0.0 to reproduce the published gap only — type real 21-day returns
 * to recompute RS.
 */
const EXAMPLE: Inputs = {
  w1: '2.2',
  m1: '6.6',
  m2: '13.1',
  m3: '13.5',
  m6: '31.2',
  sector21d: '8.8',
  spy21d: '0.0',
  priorM1: '',
}

const EMPTY: Inputs = {
  w1: '',
  m1: '',
  m2: '',
  m3: '',
  m6: '',
  sector21d: '',
  spy21d: '',
  priorM1: '',
}

function num(s: string): number | null {
  if (s.trim() === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function fmt(n: number | null, digits = 1): string {
  if (n === null) return '—'
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}`
}

function flowLabel(
  mom: number | null,
  acc: number | null,
  m1: number | null,
  m6: number | null,
): 'IN' | 'TURN' | 'WATCH' | 'OUT' | null {
  if (mom === null || acc === null) return null
  if (mom > 5 && acc > 2) return 'IN'
  if (mom > 0 && acc > 5) return 'TURN'
  if (m6 !== null && m1 !== null && m6 < -10 && m1 > 0 && acc > 0) return 'WATCH'
  if (mom < -5 && acc < -2) return 'OUT'
  return null
}

const FIELDS: { key: keyof Inputs; label: string; placeholder: string }[] = [
  { key: 'w1', label: '1-week return (%)', placeholder: 'e.g. 2.2' },
  { key: 'm1', label: '1-month return (%)', placeholder: 'e.g. 6.6' },
  { key: 'm2', label: '2-month return (%)', placeholder: 'e.g. 13.1' },
  { key: 'm3', label: '3-month return (%)', placeholder: 'e.g. 13.5' },
  { key: 'm6', label: '6-month return (%)', placeholder: 'e.g. 31.2' },
  { key: 'sector21d', label: 'Sector 21-day return (%)', placeholder: 'e.g. 8.8' },
  { key: 'spy21d', label: 'SPY 21-day return (%)', placeholder: 'e.g. 0.0' },
  { key: 'priorM1', label: 'Prior month\u2019s 1-month return (%)', placeholder: 'for \u03941M' },
]

export default function SectorCalculator() {
  const [inputs, setInputs] = useState<Inputs>(EXAMPLE)

  const set =
    (key: keyof Inputs) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setInputs((prev) => ({ ...prev, [key]: e.target.value }))

  const w1 = num(inputs.w1)
  const m1 = num(inputs.m1)
  const m2 = num(inputs.m2)
  const m3 = num(inputs.m3)
  const m6 = num(inputs.m6)
  const sector21d = num(inputs.sector21d)
  const spy21d = num(inputs.spy21d)
  const priorM1 = num(inputs.priorM1)

  const momentum =
    w1 !== null && m1 !== null && m2 !== null && m3 !== null
      ? (w1 * 3 + m1 * 2 + m2 * 1 + m3 * 0.5) / 6.5
      : null
  const acceleration =
    w1 !== null && m1 !== null && m3 !== null && m6 !== null
      ? (w1 * 2 + m1) / 3 - (m3 + m6) / 2
      : null
  const rs = sector21d !== null && spy21d !== null ? sector21d - spy21d : null
  const delta1m = m1 !== null && priorM1 !== null ? m1 - priorM1 : null
  const flow = flowLabel(momentum, acceleration, m1, m6)

  const flowPill =
    flow === 'IN' ? (
      <span className="pill growth">IN</span>
    ) : flow === 'OUT' ? (
      <span className="pill avoid">OUT</span>
    ) : flow === 'TURN' || flow === 'WATCH' ? (
      <span className="pill watch">{flow}</span>
    ) : (
      <span className="pill neutral">No flow signal</span>
    )

  return (
    <section className="card">
      <h2>Rotation calculator</h2>
      <p>
        Type a sector&rsquo;s returns (all in percent) and the outputs update live. Pre-filled
        with the published Health Care (XLV) worked example.
      </p>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '10px 16px',
          margin: '12px 0',
        }}
      >
        {FIELDS.map((f) => (
          <label key={f.key} style={{ fontSize: 15 }}>
            {f.label}
            <input
              type="number"
              step="0.1"
              inputMode="decimal"
              value={inputs[f.key]}
              onChange={set(f.key)}
              placeholder={f.placeholder}
              aria-label={f.label}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 4,
                fontSize: 16,
                fontFamily: 'Arial, Helvetica, sans-serif',
                padding: '10px 12px',
                border: '1px solid #d7dce3',
                borderRadius: 8,
              }}
            />
          </label>
        ))}
      </div>
      <p className="footnote">
        Note on the 21-day returns: the published example states the RS gap (+8.8 pts) but not
        the two 21-day returns separately, so those fields are pre-filled as +8.8 vs 0.0 to
        reproduce the published gap only. Type real 21-day returns and RS recomputes.
      </p>
      <div className="kv">
        <span className="k">Relative strength (RS)</span>
        <span className="v">{fmt(rs)} pts</span>
      </div>
      <div className="kv">
        <span className="k">Momentum</span>
        <span className="v">{fmt(momentum)}</span>
      </div>
      <div className="kv">
        <span className="k">Acceleration</span>
        <span className="v">{fmt(acceleration)}</span>
      </div>
      <div className="kv">
        <span className="k">&Delta;1M (vs prior month&rsquo;s 1M%)</span>
        <span className="v">{fmt(delta1m)} pts</span>
      </div>
      <div className="kv">
        <span className="k">Flow</span>
        <span className="v">{flowPill}</span>
      </div>
      <p className="footnote">
        Flow is checked in this order and the first match wins: IN, then TURN, then WATCH, then
        OUT. &ldquo;No flow signal&rdquo; means none of the four conditions is met — that is a
        normal outcome, not an error.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
        <button type="button" className="btn" onClick={() => setInputs(EXAMPLE)}>
          Reset to worked example
        </button>
        <button type="button" className="btn" onClick={() => setInputs(EMPTY)}>
          Clear all
        </button>
      </div>
    </section>
  )
}
