import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import {
  RESULTS,
  TICKER_SYMBOLS,
  getTicker,
  money,
  pct,
  score1,
  type DcfLeg,
  type ForwardLeg,
  type PegLeg,
  type TickerData,
} from '@/lib/data'
import {
  Card,
  VerdictBadge,
  PillarBar,
  scoreSpan,
  scoreClass,
  signedSpan,
} from '@/components/ui'
import SensitivityGrid from '@/components/SensitivityGrid'
import {
  StockLiveIntro,
  StockLiveLadder,
  StockLivePrice,
  StockLiveProConLine,
  StockLiveUpside,
  StockLiveWallStreetUpsides,
} from '@/components/StockLive'
import { ENGINE_VERSION } from '@/lib/site'

// Static export: one page per scored ticker, taken from results.json so
// the generated set can never drift from the data. With `output: 'export'`
// only these paths are generated; any other /stock/<ticker> URL 404s,
// which is the same behaviour as before.
export function generateStaticParams() {
  return TICKER_SYMBOLS.map((ticker) => ({ ticker }))
}

// NOTE: `export const dynamicParams = false` was removed — it is not
// compatible with Next 16's Cache Components.

export async function generateMetadata({
  params,
}: PageProps<'/stock/[ticker]'>): Promise<Metadata> {
  const { ticker } = await params
  const t = getTicker(ticker)
  if (!t) return { title: 'Not found | The Stock Check' }
  return { title: `${ticker.toUpperCase()} — ${t.name} | The Stock Check` }
}

/** One row of a joined sub-score table: the check, the evidence that
    produced its score, and the score itself — so a number is never shown
    without the reading behind it. Scores always come from the stored
    subscores; the evidence is formatted from the stored inputs only. */
interface JoinedRow {
  label: string
  evidence: ReactNode
  /** Null when the check contributes no score of its own — the Valuation
      leg-spread row, when no cap applies: the spread only ever caps the
      score, it never adds one. Renders as '—'. */
  score: number | null
}

function JoinedSubscoreTable({ rows }: { rows: JoinedRow[] | null }) {
  if (!rows) return null
  return (
    <table className="subscores">
      <thead>
        <tr>
          <th>Check</th>
          <th>What we saw</th>
          <th className="num">Score</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td>{r.label}</td>
            <td>{r.evidence}</td>
            <td className="num">{r.score === null ? '—' : scoreSpan(r.score)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Stored input as a number, or null when absent — a missing input never
    crashes a row and is never invented. */
function storedNum(v: unknown): number | null {
  return typeof v === 'number' ? v : null
}

/** EMA-trend reading: the same five branches the engine scores on
    (pillar_technical), in plain words. Only the wording is derived here;
    the score always comes from the stored subscore. */
function emaTrendText(price: number, ema20: number, ema50: number, ema200: number): string {
  if (price > ema20 && ema20 > ema50 && ema50 > ema200) return 'Price above EMA 20, 50 and 200'
  if (price > ema50 && ema50 > ema200) return 'Price above EMA 50 and 200'
  if (price > ema50 || price > ema200) return 'Price above EMA 50 or 200'
  if (price < ema20 && ema20 < ema50 && price < ema200) return 'Price below EMA 20, 50 and 200'
  return 'Mixed — price between the averages'
}

/** Valuation upside → uncapped score: the engine's piecewise-linear
    scale (pillar_valuation), clamped at the ends. Only the display
    value is derived here; the final row always shows the stored pillar
    score, never a recompute. */
const VALUATION_SCALE: [number, number][] = [
  [-0.4, 10],
  [-0.25, 25],
  [-0.1, 40],
  [0, 55],
  [0.1, 70],
  [0.25, 85],
  [0.5, 100],
]

function valuationUncapped(upside: number): number {
  const pts = VALUATION_SCALE
  if (upside <= pts[0][0]) return pts[0][1]
  if (upside >= pts[pts.length - 1][0]) return pts[pts.length - 1][1]
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    if (x0 <= upside && upside <= x1) return y0 + ((y1 - y0) * (upside - x0)) / (x1 - x0)
  }
  return pts[pts.length - 1][1]
}

/** Valuation disagreement cap (pillar_valuation): the spread is
    (highest leg − lowest leg) ÷ fair value. Above the fair value itself
    the score caps at 55; above 75% of it, at 65. The 55 branch is
    checked first, so when both hold — a spread over the fair value is
    necessarily over 75% of it — 55 applies. Otherwise no cap. */
function valuationCap(spread: number | null): number | null {
  if (spread === null) return null
  if (spread > 1.0) return 55
  if (spread > 0.75) return 65
  return null
}

/** Story / Financials reading: both are 0–100 percentile ranks across
    the universe, so 50 is the universe median. The Story-Tracker quadrant
    (Full position / Speculative / Hold, don't add / Out) is NOT shown here
    — it needs the weekly top-third cuts, revenue growth and price vs the
    200-day, which are not stored on the card, so no quadrant is ever
    derived from these two numbers. */
function medianWord(v: number): string {
  if (v > 50) return 'Above the universe median (50)'
  if (v < 50) return 'Below the universe median (50)'
  return 'At the universe median (50)'
}

/** Data-completeness reading. 100 = all inputs present, no adjustment;
    80 = a one-off earnings adjustment was applied (the only two values in
    this build). Anything else states no reason — see Methodology. */
function completenessText(score: number): string {
  if (score === 100) return 'All inputs present, no adjustment'
  if (score === 80) return 'A one-off earnings adjustment was applied'
  return 'Some inputs adjusted or missing — see Methodology'
}

/** Compact market cap: $3.97T / $1.2B style. Null → '—'. */
function formatMarketCap(v: number | null): string {
  if (v === null) return '—'
  const trim = (n: number, digits: number) => {
    const s = n.toFixed(digits)
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s
  }
  if (v >= 1_000_000_000_000) return `$${trim(v / 1_000_000_000_000, 2)}T`
  if (v >= 1_000_000_000) return `$${trim(v / 1_000_000_000, 1)}B`
  if (v >= 1_000_000) return `$${trim(v / 1_000_000, 0)}M`
  return `$${trim(v / 1_000, 0)}K`
}

/** EPS for the Lynch panel: up to 3 decimals, trailing zeros trimmed,
    so EPS x fair P/E reproduces the Lynch value exactly ($1.243 x 10.00
    = $12.43; 2dp would read $1.24 x 10.00 = $12.40). */
function formatEps(v: number): string {
  const s = v.toFixed(3)
  return `$${s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s}`
}

function indexMembership(indexes: string[] | undefined): string {
  const names = (indexes ?? []).map((i) =>
    i === 'SP500' ? 'S&P 500' : i === 'NASDAQ100' ? 'Nasdaq-100' : i === 'DOW30' ? 'Dow Jones' : i,
  )
  return names.length > 0 ? names.join(' + ') : 'None'
}

function Kv({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  )
}

/**
 * One fair-value leg. A skipped (null) leg gets an amber "Skipped" pill
 * and an amber-tinted block; the leg(s) behind the fair value get a
 * green "Fair value" badge and a green-tinted block.
 */
function LegBlock({
  title,
  value,
  badge,
  children,
}: {
  title: string
  value: number | null
  badge: 'median' | 'mean' | 'forward' | null
  children?: ReactNode
}) {
  const skipped = value === null
  return (
    <div className={`leg${badge ? ' leg-median' : ''}${skipped ? ' leg-skipped' : ''}`}>
      <h3>{title}</h3>
      <p className="leg-value">
        <strong>{skipped ? '—' : money(value)}</strong>
        {skipped && <span className="pill skipped">Skipped</span>}
        {badge !== null && <span className="pill growth">Fair value</span>}
      </p>
      {children}
    </div>
  )
}

type ClosestLeg = {
  name: string
  value: number
  /** |leg − consensus mean| ÷ consensus mean. */
  distancePct: number
}

/**
 * Which of our three valuation legs sits closest to the analyst consensus
 * mean target. Skipped (null) legs are not candidates. Returns null only
 * if no leg has a value.
 */
function closestLegToTarget(
  legs: { dcf: DcfLeg; pegy: PegLeg; forward_sector: ForwardLeg },
  targetMean: number,
): ClosestLeg | null {
  const candidates: ClosestLeg[] = []
  if (legs.dcf.value !== null) {
    candidates.push({
      name: 'DCF',
      value: legs.dcf.value,
      distancePct: Math.abs(legs.dcf.value - targetMean) / targetMean,
    })
  }
  if (legs.pegy.value !== null) {
    candidates.push({
      name: 'PEGY',
      value: legs.pegy.value,
      distancePct: Math.abs(legs.pegy.value - targetMean) / targetMean,
    })
  }
  if (legs.forward_sector.value !== null) {
    candidates.push({
      name: 'Forward-sector',
      value: legs.forward_sector.value,
      distancePct: Math.abs(legs.forward_sector.value - targetMean) / targetMean,
    })
  }
  if (candidates.length === 0) return null
  return candidates.reduce((best, c) => (c.distancePct < best.distancePct ? c : best))
}

export default async function StockPage({ params }: PageProps<'/stock/[ticker]'>) {
  const { ticker } = await params
  const symbol = ticker.toUpperCase()
  const t: TickerData | null = getTicker(symbol)
  if (!t) notFound()

  const { pillars } = t
  const val = pillars.valuation.detail
  const legs = val.legs!
  const capm = val.dcf_capm_crosscheck!
  const grid = val.dcf_sensitivity_grid!

  // Which leg(s) match the stored fair value, computed from the stored
  // leg values — never hardcoded per ticker. A leg is badged only if the
  // computed value matches the stored fair value (within rounding), so a
  // data change can never badge the wrong leg.
  const legEntries = [
    { key: 'dcf', value: legs.dcf.value },
    { key: 'pegy', value: legs.pegy.value },
    { key: 'forward', value: legs.forward_sector.value },
  ]
  const availableLegs = legEntries.filter((l) => l.value !== null)
  let medianLegKey: string | null = null
  let meanLegKeys: string[] = []
  if (availableLegs.length === 3) {
    const sorted = [...availableLegs].sort((a, b) => (a.value as number) - (b.value as number))
    if (Math.abs((sorted[1].value as number) - t.triangulated_fv) < 0.02) {
      medianLegKey = sorted[1].key
    }
  } else if (availableLegs.length === 2) {
    const mean = ((availableLegs[0].value as number) + (availableLegs[1].value as number)) / 2
    if (Math.abs(mean - t.triangulated_fv) < 0.02) {
      meanLegKeys = availableLegs.map((l) => l.key)
    }
  }
  // v1.6: when the fair value is set explicitly to the Forward-sector leg
  // (trailing earnings dominated by a one-off), the median check above
  // cannot find it, so badge the Forward leg directly.
  const forwardLegKey: string | null =
    pillars.valuation.detail.fv_method?.startsWith('forward_sector_explicit') ? 'forward' : null
  const legBadge = (key: string): 'median' | 'mean' | 'forward' | null =>
    medianLegKey === key
      ? 'median'
      : meanLegKeys.includes(key)
        ? 'mean'
        : forwardLegKey === key
          ? 'forward'
          : null
  // Grid NOTE (RULEBOOK.md §13): the sensitivity grid shows DCF-leg
  // values only. When the card's fair value does not come from the DCF
  // leg, say so plainly under the grid and name the leg it does come
  // from — Forward for BA-shape names, the median leg otherwise.
  // Determined from the stored leg values, never hardcoded; when no
  // single decision leg can be determined, the line is omitted.
  const gridFvLegLabel: string | null =
    forwardLegKey !== null
      ? 'Forward'
      : medianLegKey === 'pegy'
        ? 'PEGY'
        : medianLegKey === 'forward'
          ? 'Forward'
          : null
  // Flags shown in §10: an applied one-off adjustment is already shown in
  // full in the §7 earnings-quality callout, so it is not repeated here.
  // GOOGL keeps its flag — its §7 callout is a curated summary, not the flag.
  const otherFlags =
    symbol === 'GOOGL' ? t.flags : t.flags.filter((f) => !/adjusted TTM NI/i.test(f))
  // Leg range for the live pros/cons line (StockLiveProConLine): the
  // Cons tail claims the most generous leg sits below the price, so
  // the live rewrite needs the min/max of the available legs.
  const legValues = [legs.dcf.value, legs.pegy.value, legs.forward_sector.value].filter(
    (v): v is number => v !== null,
  )
  const legMin = legValues.length > 0 ? Math.min(...legValues) : null
  const legMax = legValues.length > 0 ? Math.max(...legValues) : null
  // Explainer copy below ("How to read this card") counts the legs: a
  // 2-leg card has one other leg to compare against, not two.
  const otherLegsWord = availableLegs.length === 2 ? 'the other leg' : 'the other two legs'
  const quality = pillars.quality.detail
  const technical = pillars.technical.detail
  const trust = pillars.trust.detail
  const priceDate = RESULTS.price_date

  // Degenerate display rule (RULEBOOK.md §13): when adjusted net income
  // is near zero (|NI| < 1% of TTM revenue), the OCF/NI and FCF-conversion
  // ratios are meaningless — the engine already scores those subscores
  // neutral-50, and the card shows "not meaningful" instead of numbers.
  const degenerateNi = quality.degenerate_ni === true
  const ocfVsNiText = degenerateNi
    ? 'not meaningful — adjusted earnings are near zero'
    : pct(quality.inputs?.ocf_pct_ni_used as number)
  const fcfConversionText = degenerateNi
    ? 'not meaningful — adjusted earnings are near zero'
    : pct(quality.inputs?.fcf_conversion_used as number)

  // Receivables trend (SPEC v1.5 R1): when the receivables trend is
  // unreadable the engine scores that Quality subscore neutral-50 and
  // records receivables_change_pp null — the card shows "—" instead of
  // crashing on .toFixed. 68 of the 382 names are null here.
  const recvPp = quality.inputs?.receivables_change_pp as number | null
  const recvText =
    recvPp === null || recvPp === undefined
      ? '—'
      : `${recvPp > 0 ? '+' : ''}${recvPp.toFixed(2)} pp`

  // (9) The Stock Check vs Wall Street — all figures from the stored data only.
  // The analysts block is optional: a name that carries no consensus
  // target renders the section as "not published" (see below) instead of
  // crashing or showing a guessed target. All 382 names in this build do
  // carry a complete block; the guard is for a future refresh that drops
  // one.
  const analysts = t.analysts ?? null
  const vsWallStreet =
    analysts === null
      ? null
      : {
          targetMean: analysts.target_mean,
          targetLow: analysts.target_low,
          targetHigh: analysts.target_high,
          nOpinions: analysts.n_opinions,
          gap: t.triangulated_fv - analysts.target_mean,
          gapPct: (t.triangulated_fv - analysts.target_mean) / analysts.target_mean,
          closest: closestLegToTarget(legs, analysts.target_mean),
        }
  // Rule: a leg "explains" the gap only if it sits within 10% of the
  // consensus mean. Otherwise the gap is not explained by the legs — the
  // line says so and names the two numbers instead of inventing a reason.
  const gapExplained =
    vsWallStreet !== null &&
    vsWallStreet.closest !== null &&
    vsWallStreet.closest.distancePct <= 0.1
  const gapLine =
    vsWallStreet === null
      ? `No analyst consensus target is published for this name in this build, so there is no Wall Street figure to compare our ${money(t.triangulated_fv)} fair value against — and none is guessed.`
      : vsWallStreet.closest === null
        ? `No valuation leg is available, so the gap between our ${money(t.triangulated_fv)} fair value and the ${money(vsWallStreet.targetMean)} consensus mean is not explained by the legs.`
        : gapExplained
          ? `Closest leg: ${vsWallStreet.closest.name} at ${money(vsWallStreet.closest.value)} — within ${pct(vsWallStreet.closest.distancePct, 1, false)} of the ${money(vsWallStreet.targetMean)} consensus mean.`
          : `No leg sits close to the consensus mean: the closest leg, ${vsWallStreet.closest.name} at ${money(vsWallStreet.closest.value)}, is still ${pct(vsWallStreet.closest.distancePct, 1, false)} from the ${money(vsWallStreet.targetMean)} consensus mean, while our fair value is ${money(t.triangulated_fv)} — the gap is not explained by the legs.`

  // Joined sub-score rows (Score pillars card): one row per check — the
  // check, the evidence that produced its score, and the score itself.
  // Scores come from the stored subscores; evidence is formatted from the
  // stored inputs only. A missing input shows '—' and is never invented.
  const storyScore = pillars.conviction.detail.story ?? 0
  const financialsScore = pillars.conviction.detail.financials ?? 0
  const convictionRows: JoinedRow[] = [
    { label: 'Story (50%)', evidence: medianWord(storyScore), score: storyScore },
    { label: 'Financials (50%)', evidence: medianWord(financialsScore), score: financialsScore },
  ]
  // Valuation joined rows: the upside and the score it maps to, the leg
  // spread and the cap it triggers, and the final score after the cap.
  // The uncapped score and the cap are derived from the stored upside
  // and spread with the engine's exact formulas (pillar_valuation); the
  // final row always shows the stored pillar score, never a recompute.
  // The upside is recomputed as FV ÷ price − 1, not read from the stored
  // upside_pct: FV and price are stored to 2dp, so that ratio is exactly
  // the upside the engine scored on, while upside_pct is rounded to 3dp
  // in results.json and would shift the interpolated score by 0.1 on
  // 19 of the 382 names. The spread row has no score of its own when no
  // cap applies — the spread only ever caps, it never adds. When the
  // fair value is the Forward-sector leg explicitly (BA-shape, SPEC
  // v1.4 §1), the upside row says so; the full explanation stays in the
  // Valuation card below.
  const upsidePct =
    t.triangulated_fv != null && t.price > 0
      ? t.triangulated_fv / t.price - 1
      : storedNum(val.upside_pct)
  const legSpread = storedNum(val.leg_spread_div_fv)
  const uncappedVal = upsidePct === null ? null : valuationUncapped(upsidePct)
  const valCap = valuationCap(legSpread)
  const valuationRows: JoinedRow[] | null =
    upsidePct === null || uncappedVal === null
      ? null
      : [
          {
            label: 'Upside vs fair value',
            evidence:
              `Fair value ${money(t.triangulated_fv)}${forwardLegKey !== null ? ' (Forward-sector leg, explicit)' : ''} is ` +
              `${pct(Math.abs(upsidePct), 1, false)} ${upsidePct >= 0 ? 'above' : 'below'} the ${money(t.price)} price`,
            score: Math.round(uncappedVal * 10) / 10,
          },
          {
            label: 'Leg spread',
            evidence:
              legMin === null || legMax === null || legSpread === null
                ? '—'
                : `Legs span ${money(legMin)} to ${money(legMax)} — spread ${pct(legSpread)} of fair value, ` +
                  (valCap === null ? 'no cap' : `capped at ${valCap}`),
            score: valCap,
          },
          {
            label: 'Valuation score',
            evidence:
              valCap === null
                ? `No cap — upside score ${score1(uncappedVal)} stands`
                : uncappedVal <= valCap
                  ? `Upside score ${score1(uncappedVal)} — cap ${valCap} does not bind`
                  : `Upside score ${score1(uncappedVal)}, capped at ${valCap}`,
            score: pillars.valuation.score,
          },
        ]
  const qi = quality.inputs ?? {}
  const qs = quality.subscores
  const ocfInput = storedNum(qi.ocf_pct_ni_used)
  const accrualsInput = storedNum(qi.accruals_sloan)
  const recvInput = storedNum(qi.receivables_change_pp)
  const fcfInput = storedNum(qi.fcf_conversion_used)
  const roaInput = storedNum(qi.roa)
  const debtEqInput = storedNum(qi.debt_to_equity)
  const qualityRows: JoinedRow[] | null = qs
    ? [
        {
          label: 'OCF vs net income (25%)',
          evidence: degenerateNi
            ? 'not meaningful — adjusted earnings are near zero'
            : ocfInput === null
              ? '—'
              : `OCF ${pct(ocfInput)} of net income`,
          score: qs.ocf_vs_ni ?? 0,
        },
        {
          label: 'Accruals (Sloan) (20%)',
          evidence: accrualsInput === null ? '—' : accrualsInput.toFixed(4),
          score: qs.accruals ?? 0,
        },
        {
          label: 'Receivables trend (15%)',
          evidence:
            recvInput === null ? '—' : `${recvInput > 0 ? '+' : ''}${recvInput.toFixed(2)} pp`,
          score: qs.receivables_trend ?? 0,
        },
        {
          label: 'FCF conversion (20%)',
          evidence: degenerateNi
            ? 'not meaningful — adjusted earnings are near zero'
            : fcfInput === null
              ? '—'
              : `FCF ${pct(fcfInput)} of net income`,
          score: qs.fcf_conversion ?? 0,
        },
        {
          label: 'Return on assets (10%)',
          evidence: roaInput === null ? '—' : pct(roaInput),
          score: qs.roa ?? 0,
        },
        {
          label: 'Leverage (10%)',
          evidence: debtEqInput === null ? '—' : `Debt / equity ${debtEqInput.toFixed(2)}`,
          score: qs.leverage ?? 0,
        },
      ]
    : null
  const ti = technical.inputs ?? {}
  const ts = technical.subscores
  const ema20 = storedNum(ti.ema20)
  const ema50 = storedNum(ti.ema50)
  const ema200 = storedNum(ti.ema200)
  const vs200 = storedNum(ti.price_vs_200d_pct)
  const rsi14 = storedNum(ti.rsi14)
  const macdHist = storedNum(ti.macd_hist)
  const technicalRows: JoinedRow[] | null = ts
    ? [
        {
          label: 'EMA trend (35%)',
          evidence:
            ema20 !== null && ema50 !== null && ema200 !== null
              ? emaTrendText(t.price, ema20, ema50, ema200)
              : '—',
          score: ts.trend_ema ?? 0,
        },
        {
          label: 'Price vs 200-day (25%)',
          evidence: vs200 === null ? '—' : pct(vs200),
          score: ts.price_vs_200d ?? 0,
        },
        {
          label: 'RSI (20%)',
          evidence: rsi14 === null ? '—' : `RSI (14) ${rsi14.toFixed(1)}`,
          score: ts.rsi ?? 0,
        },
        {
          label: 'MACD (20%)',
          evidence:
            macdHist === null
              ? '—'
              : `MACD histogram ${macdHist > 0 ? '+' : ''}${macdHist.toFixed(2)} (${
                  macdHist > 0 ? 'above zero' : macdHist < 0 ? 'below zero' : 'at zero'
                })`,
          score: ts.macd ?? 0,
        },
      ]
    : null
  const tri = trust.inputs ?? {}
  const trs = trust.subscores
  const nAnalysts = storedNum(tri.n_analysts)
  const dispInput = storedNum(tri.target_spread_div_mean)
  const insiderNote = typeof tri.insider_note === 'string' ? tri.insider_note : null
  const trustRows: JoinedRow[] | null = trs
    ? [
        {
          label: 'Data completeness (30%)',
          evidence: completenessText(trs.completeness ?? 0),
          score: trs.completeness ?? 0,
        },
        {
          label: 'Analyst coverage (25%)',
          evidence: nAnalysts === null ? '—' : `${nAnalysts} analyst${nAnalysts === 1 ? '' : 's'}`,
          score: trs.analyst_coverage ?? 0,
        },
        {
          label: 'Target dispersion (25%)',
          evidence: dispInput === null ? '—' : `Spread ÷ mean ${pct(dispInput)}`,
          score: trs.target_dispersion ?? 0,
        },
        {
          label: 'Insider activity (20%)',
          evidence: insiderNote ?? '—',
          score: trs.insider ?? 0,
        },
      ]
    : null

  return (
    <div>
      {/* (1) Header */}
      <h1>
        {t.name} ({symbol})
      </h1>
      <p className="page-intro">
        {t.sector} · <StockLiveIntro symbol={symbol} bakedPrice={t.price} priceDate={priceDate} /> · Engine{' '}
        {ENGINE_VERSION}
      </p>
      {/* Facts strip — one compact line: beta, trailing P/E, market cap,
          debt/FCF, relative volume, index membership. '—' for nulls. */}
      <p className="footnote">
        Beta {capm.beta_raw !== null ? capm.beta_raw.toFixed(2) : '—'} · P/E (trailing){' '}
        {legs.pegy.pe_used !== null ? legs.pegy.pe_used.toFixed(2) : '—'} · Market cap{' '}
        {formatMarketCap(t.market_cap)} · Debt/FCF{' '}
        {t.debt_fcf !== null ? `${t.debt_fcf.toFixed(2)}×` : '—'} · Rel. vol{' '}
        {t.rel_vol !== null ? `${t.rel_vol.toFixed(2)}×` : '—'} · Index{' '}
        {indexMembership(t.indexes)}
      </p>
      <p className="footnote">
        <a href="#how-to-read">How to read this card ↓</a>
      </p>
      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <VerdictBadge verdict={t.verdict} />
          <span>
            Overall score <strong className={`score-${scoreClass(t.overall_score)}`}>{score1(t.overall_score)}</strong>
          </span>
        </div>
        <p style={{ marginTop: 10 }}>{t.verdict_reason}</p>
        <Kv k="Fair value" v={money(t.triangulated_fv)} />
        <Kv
          k="Price vs fair value"
          v={
            <StockLiveUpside
              symbol={symbol}
              fairValue={t.triangulated_fv}
              bakedPrice={t.price}
            />
          }
        />
      </Card>

      {/* (2) Five pillars */}
      <Card title="Score pillars">
        <PillarBar label="Conviction" score={pillars.conviction.score} />
        <PillarBar label="Valuation" score={pillars.valuation.score} />
        <PillarBar label="Quality" score={pillars.quality.score} />
        <PillarBar label="Technical" score={pillars.technical.score} />
        <PillarBar label="Trust" score={pillars.trust.score} />

        <h3>Conviction</h3>
        <JoinedSubscoreTable rows={convictionRows} />

        <h3>Valuation</h3>
        <JoinedSubscoreTable rows={valuationRows} />

        <h3>Quality</h3>
        <JoinedSubscoreTable rows={qualityRows} />

        <h3>Technical</h3>
        <JoinedSubscoreTable rows={technicalRows} />

        <h3>Trust</h3>
        <JoinedSubscoreTable rows={trustRows} />
        <p className="footnote">
          How every score is worked out —{' '}
          <Link href="/methodology#how-scoring-works">Methodology: How scoring works</Link>.
        </p>
      </Card>

      {/* (3) Valuation */}
      <Card title="Valuation">
        <Kv k="Fair value" v={money(t.triangulated_fv)} />
        <Kv k="Price" v={<StockLivePrice symbol={symbol} bakedPrice={t.price} />} />
        <Kv
          k="Upside vs price"
          v={
            <StockLiveUpside
              symbol={symbol}
              fairValue={t.triangulated_fv}
              bakedPrice={t.price}
            />
          }
        />
        <Kv k="Leg spread ÷ fair value" v={pct(val.leg_spread_div_fv)} />
        <LegBlock title="DCF leg" value={legs.dcf.value} badge={legBadge('dcf')}>
        </LegBlock>
        <LegBlock title="PEGY leg" value={legs.pegy.value} badge={legBadge('pegy')}>
          {legs.pegy.pegy !== null && (
            <p className="footnote">PEGY {legs.pegy.pegy.toFixed(3)}</p>
          )}
        </LegBlock>
        <LegBlock
          title="Forward-sector leg"
          value={legs.forward_sector.value}
          badge={legBadge('forward')}
        >
          {legs.forward_sector.sector_multiple !== null && (
            <p className="footnote">
              Sector forward P/E {legs.forward_sector.sector_multiple.toFixed(1)}×
              {legs.forward_sector.sector_multiple_asof
                ? ` (as of ${legs.forward_sector.sector_multiple_asof})`
                : ''}
            </p>
          )}
        </LegBlock>
      </Card>

      {/* (4) Ladder */}
      <Card title="Valuation ladder">
        <StockLiveLadder symbol={symbol} fairValue={t.triangulated_fv} bakedPrice={t.price} />
      </Card>

      {/* (5) CAPM cross-check */}
      <Card title="CAPM cross-check — display only">
        <p>
          <strong>CROSS-CHECK ONLY — does not change any fair value, score or verdict.</strong>
        </p>
        {capm.value === null ? (
          <p>
            <strong>Skipped.</strong> No cross-check value is available for this name.
          </p>
        ) : (
          <p>
            CAPM DCF value <strong>{money(capm.value)}</strong> at a CAPM discount of{' '}
            <strong>{capm.discount_capm !== null ? pct(capm.discount_capm) : '—'}</strong>,
            {legs.dcf.value !== null ? (
              <> vs the decision DCF leg of {money(legs.dcf.value)}.</>
            ) : (
              <> the decision DCF leg is skipped for this name.</>
            )}
          </p>
        )}
        <Kv k="CAPM discount" v={capm.discount_capm !== null ? pct(capm.discount_capm) : '—'} />
        <Kv k="Raw beta (Yahoo)" v={capm.beta_raw !== null ? capm.beta_raw.toFixed(3) : '—'} />
        <Kv
          k="Adjusted beta"
          v={capm.beta_adjusted !== null ? capm.beta_adjusted.toFixed(3) : '—'}
        />
        <Kv k="10-year Treasury" v="5.10% as of 2026-11-12 (FRED DGS10)" />
        <Kv k="Implied ERP" v="4.41% as of 2026-11-01" />
        <p>
          Backtest v3 (full 749-name universe) measured the effect of the CAPM leg: 6-month
          correlations were about −0.06 vs −0.05 for flat discounts, and the buckets still
          do not separate forward returns — so the leg stays display-only.
        </p>
      </Card>

      {/* (6) DCF sensitivity grid + (6b) Lynch value — side by side
          on desktop (two-col stacks on mobile). The Lynch fair price
          IS the PEGY leg (price x PEGY); the panel shows it with its
          inputs, so the two lenses sit together. Display only — it
          never changes the fair value, score or verdict. */}
      <div className="two-col">
        <Card title="DCF sensitivity grid">
          <SensitivityGrid
            values={grid.values}
            decisionLeg={legs.dcf.value}
            decisionGrowth={legs.dcf.growth_scenario}
            fvSource={
              gridFvLegLabel !== null
                ? { fairValue: t.triangulated_fv, legLabel: gridFvLegLabel }
                : null
            }
          />
          {/* 2-leg cards: the fair value is the mean of the two available
              legs, not any single leg, so the grid note above (fvSource)
              never fires for them — say so here, or the reader takes the
              DCF grid for the fair value. */}
          {meanLegKeys.length === 2 && (
            <p className="footnote">
              <strong>NOTE:</strong> These are DCF-leg values only. This card&apos;s fair value (
              {money(t.triangulated_fv)}) is the mean of the two available legs, not this grid.
            </p>
          )}
        </Card>

        <Card title="Lynch value — comparison">
          {t.lynch !== undefined && t.lynch.available && t.lynch.value !== null ? (
            <>
              <Kv k="Lynch fair price" v={money(t.lynch.value)} />
              <Kv
                k="EPS"
                v={
                  t.lynch.eps !== null
                    ? `${formatEps(t.lynch.eps)}${t.lynch.eps_adjusted ? ' (adjusted)' : ''}`
                    : '—'
                }
              />
              <Kv
                k="Growth used"
                v={t.lynch.growth_used !== null ? pct(t.lynch.growth_used, 1, false) : '—'}
              />
              <Kv
                k="Dividend yield"
                v={
                  t.lynch.dividend_yield !== null
                    ? pct(t.lynch.dividend_yield, 2, false)
                    : '—'
                }
              />
              <Kv
                k="P/E used"
                v={
                  t.lynch.pe_used !== null
                    ? t.lynch.pe_used.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })
                    : '—'
                }
              />
              <Kv
                k="Fair P/E (growth + yield)"
                v={
                  t.lynch.growth_used !== null && t.lynch.dividend_yield !== null
                    ? (t.lynch.growth_used * 100 + t.lynch.dividend_yield * 100).toFixed(2)
                    : '—'
                }
              />
              <Kv k="PEGY" v={t.lynch.pegy !== null ? t.lynch.pegy.toFixed(3) : '—'} />
              <Kv
                k="Lynch value vs price"
                v={pct((t.lynch.value - t.price) / t.price)}
              />
              <p>
                Peter Lynch&rsquo;s rule: a stock is fairly priced when its P/E equals its
                growth rate. Fair price = EPS &times; (growth + dividend yield).
                {t.lynch.growth_cap === '30%'
                  ? ' (Growth capped at 30%, same as the PEGY leg.)'
                  : t.lynch.growth_cap === 'guardrail'
                    ? ' (Growth capped by the guardrail — see Methodology.)'
                    : ''}
              </p>
              <p className="footnote">
                Comparison only — it does not change this card&rsquo;s fair value, score or
                verdict.
              </p>
            </>
          ) : (
            <p>
              <strong>Lynch value not available for this name.</strong>{' '}
              {t.lynch?.reason ?? 'The inputs needed to compute it are missing.'}
            </p>
          )}
        </Card>
      </div>

      {/* (7) Earnings-quality evidence — the one-off callout comes
          first, so a reader opening this section sees it without
          scrolling past the Quality line. */}
      <Card title="Earnings-quality evidence">
        {symbol === 'GOOGL' && (
          <div className="callout">
            <strong>NOTE: One-off earnings adjustment — shown both ways.</strong> Reported TTM net income
            $235.7B includes equity-security marks in all three 2026 quarters: Q1 +$28.7B,
            Q2 +$77.1B, Q3 −$6.7B after tax (net +$99.1B removed). Adjusted net income
            $136.6B, adjusted EPS $11.10, adjusted trailing P/E 26.65 — the adjusted
            figures are the ones used for Quality and the PEGY leg.
          </div>
        )}
        {symbol !== 'GOOGL' && (() => {
          // Generic one-off callout: a flag that records an applied
          // one-off adjustment carries "Adjusted TTM NI" (flag-only
          // near-misses and no-adjustment notes do not). GOOGL keeps
          // its curated callout above.
          const adjustmentFlag = t.flags?.find(
            (f) => /adjusted TTM NI/i.test(f),
          )
          return adjustmentFlag ? (
            <div className="callout">
              <strong>NOTE: One-off earnings adjustment — shown both ways.</strong> {adjustmentFlag}
            </div>
          ) : (
            <p>No one-off earnings adjustment was applied to this name.</p>
          )
        })()}
        <p>
          Quality score {scoreSpan(pillars.quality.score)} —{' '}
          {degenerateNi ? (
            <>
              OCF vs net income and FCF conversion: not meaningful — adjusted earnings are
              near zero; accruals (Sloan){' '}
              {(quality.inputs?.accruals_sloan as number).toFixed(4)}, receivables change{' '}
              {recvText}, return on
              assets {pct(quality.inputs?.roa as number)}, debt / equity{' '}
              {(quality.inputs?.debt_to_equity as number).toFixed(2)}.
            </>
          ) : (
            <>
              OCF {ocfVsNiText} of net income, FCF conversion {fcfConversionText} of net
              income, accruals (Sloan) {(quality.inputs?.accruals_sloan as number).toFixed(4)},
              receivables change {recvText}, return on
              assets {pct(quality.inputs?.roa as number)}, debt / equity{' '}
              {(quality.inputs?.debt_to_equity as number).toFixed(2)}.
            </>
          )}
        </p>
      </Card>

      {/* (8) Pros and cons — the fair-value first line is baked text
          in results.json; StockLiveProConLine recomputes its % and
          price from the live price during market hours. */}
      <div className="two-col">
        <Card title="Pros" accent="green">
          <ul className="pros">
            {t.pros.map((p) => (
              <li key={p}>
                <StockLiveProConLine
                  line={p}
                  symbol={symbol}
                  fairValue={t.triangulated_fv}
                  legMin={legMin}
                  legMax={legMax}
                />
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Cons" accent="red">
          <ul className="cons">
            {t.cons.map((c) => (
              <li key={c}>
                <StockLiveProConLine
                  line={c}
                  symbol={symbol}
                  fairValue={t.triangulated_fv}
                  legMin={legMin}
                  legMax={legMax}
                />
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* (9) The Stock Check vs Wall Street */}
      <Card title="The Stock Check vs Wall Street">
        {vsWallStreet === null ? (
          <p>{gapLine}</p>
        ) : (
          <>
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>The Stock Check</th>
                  <th>Wall Street (analyst consensus)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Fair value / mean target</td>
                  <td>{money(t.triangulated_fv)}</td>
                  <td>{money(vsWallStreet.targetMean)}</td>
                </tr>
                <tr>
                  <td>Implied upside vs price</td>
                  <StockLiveWallStreetUpsides
                    symbol={symbol}
                    fairValue={t.triangulated_fv}
                    targetMean={vsWallStreet.targetMean}
                    bakedPrice={t.price}
                  />
                </tr>
                <tr>
                  <td>Target range (low – high)</td>
                  <td>—</td>
                  <td>
                    {money(vsWallStreet.targetLow)} – {money(vsWallStreet.targetHigh)}
                  </td>
                </tr>
                <tr>
                  <td>Analysts covering</td>
                  <td>—</td>
                  <td>
                    {vsWallStreet.nOpinions}
                    {vsWallStreet.nOpinions === 1 ? ' — based on 1 analyst' : ''}
                  </td>
                </tr>
                <tr
                  className={
                    vsWallStreet.gap < 0
                      ? 'gap-below'
                      : vsWallStreet.gap > 0
                        ? 'gap-above'
                        : undefined
                  }
                >
                  <td>Gap vs consensus mean</td>
                  <td colSpan={2}>
                    {signedSpan(
                      vsWallStreet.gapPct,
                      `${vsWallStreet.gap < 0 ? '−' : '+'}${money(Math.abs(vsWallStreet.gap))} (${pct(vsWallStreet.gapPct)})`,
                      0.001,
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
            <h3>Why the gap?</h3>
            <p>{gapLine}</p>
            <p className="footnote">
              Analyst consensus: Yahoo Finance analyst targets, fetched 15–16 Nov 2026.
              Targets are carried through unchanged from that frozen fetch; the nightly
              refresh updates price only.
            </p>
          </>
        )}
      </Card>

      {/* (10) Flags */}
      {otherFlags.length > 0 && (
        <Card title="Flags">
          {otherFlags.map((f) => (
            <div className="callout" key={f}>
              {f}
            </div>
          ))}
        </Card>
      )}

      {/* (11) NVDA-only spread-cap-release note */}
      {symbol === 'NVDA' && (
        <Card title="Audit note: valuation score change, v1.1 → v1.2" accent="amber">
          <p>
            Between engine v1.1 and v1.2 the valuation score moved 65.0 → 97.9 and the
            overall score moved 65.6 → 75.5, while the fair value was unchanged at $238.62.
            The Forward leg fell from $317.07 to $259.42, narrowing the spread between
            the legs from 0.898 to 0.656.
          </p>
          <p>
            A score change with no change in fair value must never be presented as if the
            business got better. The business did not change here — the measurement did.
          </p>
        </Card>
      )}

      {/* (12) Honest note */}
      <Card title="What is not here yet">
        <p>
          Price chart, financials table, news and dividends are not in this build&apos;s data yet. The price (
          <StockLivePrice symbol={symbol} bakedPrice={t.price} />) and the technicals above are the
          current snapshot — the {priceDate} close after hours, live during market hours; those
          sections arrive with the live-data feed.
        </p>
      </Card>

      {/* (13) How to read this card - all the metric explainers in one
          place at the end of the card, instead of scattered through it. */}
      <Card title="How to read this card" id="how-to-read">
        <h3>Fair value and the {availableLegs.length === 2 ? 'two' : 'three'} legs</h3>
        <p>
          <strong>Fair value.</strong> Our single fair-value estimate for the stock, drawn from
          the {availableLegs.length === 2 ? 'two' : 'three'} legs below. If the price is well below it, the stock looks cheap on our
          numbers. If it is well above it, the stock looks expensive — and a wide gap between
          the legs means more uncertainty.
        </p>
        <p>
          <strong>DCF leg.</strong> What the stock could be worth based only on the cash the
          business is expected to generate in the years ahead. A higher number means that
          future cash looks more valuable. Compare it with {otherLegsWord} — if they
          disagree a lot, treat the fair value with more caution.
        </p>
        <p>
          <strong>PEGY leg.</strong> What the stock could be worth based on its earnings, how
          fast those earnings are expected to grow, and the dividend it pays. A higher number
          means the stock looks cheaper against its growth. Compare it with {otherLegsWord}{' '}
          before judging the fair value.
        </p>
        <p>
          <strong>Forward-sector leg.</strong> What the stock could be worth based on next
          year&apos;s expected earnings, priced the way the market currently prices its sector.
          A higher number means the stock looks cheaper against next year&apos;s earnings.
          Compare it with {otherLegsWord} before judging the fair value.
        </p>
        <h3>The five scores</h3>
        <p>
          <strong>Conviction.</strong> How strong the company&apos;s story and financials
          look — whether the business is growing and gaining ground. A higher score means a
          stronger business story. It says nothing about whether the stock is cheap.
        </p>
        <p>
          <strong>Quality.</strong> Whether the reported profits are backed by real cash,
          rather than accounting that flatters the numbers. A higher score means the earnings
          look more solid. A low score means you should trust the profit figures less.
        </p>
        <p>
          <strong>Technical.</strong> Whether the price trend and momentum are with the stock
          right now. A higher score means the short-term trend looks stronger. It says
          nothing about the business itself.
        </p>
        <p>
          <strong>Trust.</strong> How much we can rely on the numbers behind the score —
          whether the data is complete and well covered. A higher score means the figures rest
          on firmer ground. A lower score means more of the picture is missing or disputed.
        </p>
        <p>
          <strong>Valuation score.</strong> How cheap or expensive the stock looks against
          our fair value — the bigger the upside to fair value, the higher the score. A high
          score means the price sits well below our fair value. A low score means it sits at
          or above it.
        </p>
        <h3>The ladder and the grid</h3>
        <p>
          <strong>Valuation ladder.</strong> Four price levels around our fair value, showing
          where today&apos;s price sits against our estimate. Read them as reference points
          for judging how far the price is from our estimate. They are not instructions to
          trade.
        </p>
        <p>
          <strong>DCF sensitivity grid.</strong> The same DCF leg, shown under different
          assumptions instead of a single point — so you can see how much the answer moves if
          the future turns out differently. The highlighted cell is this stock&apos;s own
          estimate. Cells further away show how the value would change if growth or rates came
          in higher or lower.
        </p>
        <p>
          <strong>Lynch value.</strong> The PEGY leg shown the way Peter Lynch framed it —
          a fair price from earnings, growth and dividend, beside the DCF grid so the two
          views sit together. It is a comparison only and never changes the fair value.
          When the two disagree a lot, the cash-flow view and the earnings view are telling
          different stories, and the fair value deserves more caution.
        </p>
        <h3>The comparison and CAPM</h3>
        <p>
          <strong>The Stock Check vs Wall Street.</strong> Our fair value next to Wall
          Street&apos;s — the average of the price targets published by the analysts who
          cover the stock. If our number is well above theirs, we are more optimistic than
          the average analyst. If it is well below, we are more cautious.
        </p>
        <p>
          <strong>CAPM cross-check.</strong> A second, independent check on the DCF leg,
          built from market inputs. It never changes the fair value, score or verdict. If it
          lands close to the DCF leg, the two views agree. If it lands far away, treat the
          DCF leg with more caution.
        </p>
        <p className="footnote">
          Full detail: <Link href="/methodology">Methodology</Link>.
        </p>
      </Card>

      <p className="footnote">
        Data as of {RESULTS.as_of} · {ENGINE_VERSION} · Prices are the {priceDate} close unless
        marked LIVE during market hours (quotes delayed ~15 min, TradingView).
      </p>
    </div>
  )
}
