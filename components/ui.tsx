import Link from 'next/link'
import type { ReactNode } from 'react'
import { money, round2, type TickerData } from '@/lib/data'

/** Score colour class: green >= 70, amber 40–69, red < 40. */
export function scoreClass(n: number): 'good' | 'mid' | 'bad' {
  if (n >= 70) return 'good'
  if (n >= 40) return 'mid'
  return 'bad'
}

export function scoreSpan(n: number): ReactNode {
  return <span className={`score-${scoreClass(n)}`}>{n.toFixed(1)}</span>
}

export function VerdictBadge({ verdict }: { verdict: TickerData['verdict'] }) {
  const cls = verdict === 'Growth' || verdict === 'Value' ? 'growth' : verdict === 'Avoid' ? 'avoid' : 'watch'
  return <span className={`pill ${cls}`}>{verdict}</span>
}

export function Card({
  title,
  accent,
  children,
}: {
  title?: string
  accent?: 'green' | 'red' | 'amber'
  children: ReactNode
}) {
  return (
    <section className={`card${accent ? ` ${accent}` : ''}`}>
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  )
}

export function PillarBar({ label, score, weight }: { label: string; score: number; weight: number }) {
  return (
    <div className="scorebar">
      <span className="label">
        {label} <span className="footnote">({weight}%)</span>
      </span>
      <span className="track">
        <span className={`fill ${scoreClass(score)}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </span>
      <span className="value">{score.toFixed(1)}</span>
    </div>
  )
}

/**
 * Price ladder. SPEC v1.1 §5: the ladder is VALUATION CONTEXT, not Buy/Exit
 * instructions. That framing is printed with the ladder on every page
 * that shows it — never omit the note.
 */
export function LadderTable({ fv, price }: { fv: number; price: number }) {
  const rungs = [
    { name: 'Heavy', ratio: 0.6, level: round2(fv * 0.6), cls: 'heavy' },
    { name: 'Buy', ratio: 0.8, level: round2(fv * 0.8), cls: 'buy' },
    { name: 'Fair', ratio: 1.0, level: round2(fv * 1.0), cls: 'fair' },
    { name: 'Exit', ratio: 1.2, level: round2(fv * 1.2), cls: 'exit' },
  ]
  return (
    <div>
      <div className="ladder">
        {rungs.map((r) => (
          <div key={r.name} className={`rung ${r.cls}`}>
            <div className="name">{r.name}</div>
            <div className="level">{money(r.level)}</div>
            <div className="ratio">{r.ratio.toFixed(2)}× fair value</div>
          </div>
        ))}
      </div>
      <p className="footnote">
        Price {money(price)} vs fair value {money(fv)}. The ladder is valuation context — where the
        price sits against our fair-value estimate — not a buy or sell signal. Backtests on 5
        tickers and on the full 749-name universe found the ladder does not separate forward
        returns (see Methodology). No level on this ladder is an instruction to buy or sell.
      </p>
    </div>
  )
}

/** Compact stock row used on Home / Picks / Trending / Performance. */
export function StockRow({ t }: { t: TickerData & { symbol: string } }) {
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
      <td className="num">{money(t.price)}</td>
      <td className="num">{money(t.triangulated_fv)}</td>
      <td className="num">
        {t.triangulated_fv > 0 && t.price > 0
          ? `${(((t.triangulated_fv - t.price) / t.price) * 100).toFixed(1)}%`
          : '—'}
      </td>
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
