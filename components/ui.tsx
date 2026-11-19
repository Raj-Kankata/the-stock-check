import Link from 'next/link'
import type { ReactNode } from 'react'
import { money, pct, round2 } from '@/lib/format'
import type { PublicStockRow, Verdict } from '@/lib/public-types'

/** Score colour class: green >= 70, amber 40–69, red < 40. */
export function scoreClass(n: number): 'good' | 'mid' | 'bad' {
  if (n >= 70) return 'good'
  if (n >= 40) return 'mid'
  return 'bad'
}

export function scoreSpan(n: number): ReactNode {
  return <span className={`score-${scoreClass(n)}`}>{n.toFixed(1)}</span>
}

/**
 * Signed-number colour class: positive green, negative red, near-zero
 * (|n| <= zeroBand) muted. zeroBand is in the units of the value passed
 * (e.g. 0.001 for a fraction like an upside, 0.05 for a points figure).
 */
export function signedClass(n: number, zeroBand = 0.05): 'pos' | 'neg' | 'zero' {
  if (n > zeroBand) return 'pos'
  if (n < -zeroBand) return 'neg'
  return 'zero'
}

/** Signed number span, coloured by sign with the shared green/red logic. */
export function signedSpan(n: number, text?: string, zeroBand?: number): ReactNode {
  const display = text ?? `${n > 0 ? '+' : ''}${n.toFixed(1)}`
  return <span className={`num-${signedClass(n, zeroBand)}`}>{display}</span>
}

/** Signed percentage span: n is a fraction (0.05 = +5.0%). */
export function signedPctSpan(n: number, digits = 1, zeroBand = 0.001): ReactNode {
  return signedSpan(n, pct(n, digits), zeroBand)
}

export function VerdictBadge({ verdict }: { verdict: Verdict }) {
  const cls = verdict === 'Growth' || verdict === 'Value' ? 'growth' : verdict === 'Avoid' ? 'avoid' : 'watch'
  return <span className={`pill ${cls}`}>{verdict}</span>
}

/** ETF type badge — the visual-discretion axis of the ETF board:
    equity (green), bond (blue), commodity (amber), leveraged (red).
    The four types are never shown in the same colour. */
export type EtfType = 'equity' | 'bond' | 'commodity' | 'leveraged'

const ETF_TYPE_LABELS: Record<EtfType, string> = {
  equity: 'Equity',
  bond: 'Bond',
  commodity: 'Commodity',
  leveraged: 'Leveraged',
}

export function EtfTypeBadge({ type }: { type: EtfType }) {
  return <span className={`pill type-${type}`}>{ETF_TYPE_LABELS[type]}</span>
}

/** Index type badge — the visual-discretion axis of the index board:
    broad market (blue), sector (green), volatility (red). The three
    types are never shown in the same colour. */
export type IndexType = 'broad' | 'sector' | 'volatility'

const INDEX_TYPE_LABELS: Record<IndexType, string> = {
  broad: 'Broad market',
  sector: 'Sector',
  volatility: 'Volatility',
}

export function IndexTypeBadge({ type }: { type: IndexType }) {
  return <span className={`pill type-${type}`}>{INDEX_TYPE_LABELS[type]}</span>
}

/** ETF Technical read: Strong (green) / Mixed (amber) / Weak (red). */
export function TechnicalReadBadge({ read }: { read: 'Strong' | 'Mixed' | 'Weak' }) {
  const cls = read === 'Strong' ? 'growth' : read === 'Mixed' ? 'watch' : 'avoid'
  return <span className={`pill ${cls}`}>{read}</span>
}

/** ETF Momentum read: Building (green) / Flat (neutral) / Fading (red). */
export function MomentumReadBadge({ read }: { read: 'Building' | 'Flat' | 'Fading' }) {
  const cls = read === 'Building' ? 'growth' : read === 'Flat' ? 'neutral' : 'avoid'
  return <span className={`pill ${cls}`}>{read}</span>
}

export function Card({
  title,
  accent,
  id,
  children,
}: {
  title?: string
  accent?: 'green' | 'red' | 'amber'
  id?: string
  children: ReactNode
}) {
  return (
    <section id={id} className={`card${accent ? ` ${accent}` : ''}`}>
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  )
}

export function PillarBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="scorebar">
      <span className="label">{label}</span>
      <span className="track">
        <span className={`fill ${scoreClass(score)}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </span>
      <span className={`value score-${scoreClass(score)}`}>{score.toFixed(1)}</span>
    </div>
  )
}


/**
 * Price ladder. The ladder is VALUATION CONTEXT, not Buy/Exit
 * instructions. That framing is printed with the ladder on every page
 * that shows it — never omit the note.
 */
export function LadderTable({
  fv,
  price,
  livePrice,
}: {
  fv: number
  price: number
  /**
   * Live close when the caller has one (market hours, scan succeeded).
   * The footnote price and the position marker follow it; null/undefined
   * keeps the baked close. The ladder levels themselves are baked —
   * they come from the fair value, which is a nightly model output.
   */
  livePrice?: number | null
}) {
  const shownPrice = livePrice ?? price
  const rungs = [
    { name: 'Heavy', ratio: 0.6, level: round2(fv * 0.6), cls: 'heavy' },
    { name: 'Buy', ratio: 0.8, level: round2(fv * 0.8), cls: 'buy' },
    { name: 'Fair', ratio: 1.0, level: round2(fv * 1.0), cls: 'fair' },
    { name: 'Exit', ratio: 1.2, level: round2(fv * 1.2), cls: 'exit' },
  ]
  // Position marker: the rung nearest the shown price, plus the band the
  // price sits in. Both follow the live price when one is passed.
  const nearest = rungs.reduce((best, r) =>
    Math.abs(r.level - shownPrice) < Math.abs(best.level - shownPrice) ? r : best,
  )
  const band =
    shownPrice < rungs[0].level
      ? 'below the Heavy rung'
      : shownPrice < rungs[1].level
        ? 'between the Heavy and Buy rungs'
        : shownPrice < rungs[2].level
          ? 'between the Buy and Fair rungs'
          : shownPrice < rungs[3].level
            ? 'between the Fair and Exit rungs'
            : 'above the Exit rung'
  return (
    <div>
      <div className="ladder">
        {rungs.map((r) => (
          <div key={r.name} className={`rung ${r.cls}${r === nearest ? ' here' : ''}`}>
            <div className="name">{r.name}</div>
            <div className="level">{money(r.level)}</div>
            {r === nearest && <div className="here-label">← price here</div>}
          </div>
        ))}
      </div>
      <p className="footnote">
        Price {money(shownPrice)}
        {livePrice !== null && livePrice !== undefined ? ' (live)' : ''} vs fair value{' '}
        {money(fv)} — the price sits {band}. The ladder is valuation context — where the
        price sits against our fair-value estimate — not a buy or sell signal. Backtests on 5
        tickers and on the full 749-name universe found the ladder does not separate forward
        returns (see Methodology). No level on this ladder is an instruction to buy or sell.
      </p>
    </div>
  )
}

/** Compact stock row used on Home / Picks / Trending / Performance.
    `livePrice` (when non-null) replaces the baked close in the Price
    cell and the upside is recomputed from it; the fair value, score and
    verdict stay baked — they are nightly model outputs. */
export function StockRow({
  t,
  livePrice,
}: {
  t: PublicStockRow
  livePrice?: number | null
}) {
  const price = livePrice ?? t.price
  const upside =
    t.fv > 0 && price > 0 ? (t.fv - price) / price : null
  return (
    <tr>
      <td>
        <Link href={`/stock/${t.symbol}`}>
          <strong>{t.symbol}</strong>
        </Link>
        <br />
        <span className="footnote">{t.name}</span>
      </td>
      <td>
        <VerdictBadge verdict={t.verdict} />
      </td>
      <td className="num">{scoreSpan(t.overall_score)}</td>
      <td className="num">{money(price)}</td>
      <td className="num">{money(t.fv)}</td>
      <td className="num">{upside === null ? '—' : signedPctSpan(upside)}</td>
    </tr>
  )
}

export function StockTableHead() {
  return (
    <tr>
      <th>Stock</th>
      <th>Verdict</th>
      <th className="num">Score</th>
      <th className="num">Price</th>
      <th className="num">Fair value</th>
      <th className="num">Upside</th>
    </tr>
  )
}
