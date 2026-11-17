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
  MetricNote,
  LadderTable,
  scoreSpan,
  scoreClass,
  signedSpan,
  signedPctSpan,
} from '@/components/ui'
import SensitivityGrid from '@/components/SensitivityGrid'

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

const QUALITY_LABELS: Record<string, string> = {
  ocf_vs_ni: 'OCF vs net income',
  accruals: 'Accruals (Sloan)',
  receivables_trend: 'Receivables trend',
  fcf_conversion: 'FCF conversion',
  roa: 'Return on assets',
  leverage: 'Leverage',
}

const TECHNICAL_LABELS: Record<string, string> = {
  trend_ema: 'EMA trend',
  price_vs_200d: 'Price vs 200-day',
  rsi: 'RSI',
  macd: 'MACD',
}

const TRUST_LABELS: Record<string, string> = {
  completeness: 'Data completeness',
  analyst_coverage: 'Analyst coverage',
  target_dispersion: 'Target dispersion',
  insider: 'Insider activity',
}

function SubscoreTable({
  subscores,
  labels,
}: {
  subscores: Record<string, number> | undefined
  labels: Record<string, string>
}) {
  if (!subscores) return null
  return (
    <table>
      <thead>
        <tr>
          <th>Check</th>
          <th className="num">Score</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(subscores).map(([key, value]) => (
          <tr key={key}>
            <td>{labels[key] ?? key}</td>
            <td className="num">{scoreSpan(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
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
 * and an amber-tinted block; the leg that sources the triangulated fair
 * value — the median of three legs, or one of the two legs whose mean it
 * is — gets a green "Median → fair value" / "Mean of 2 legs → fair
 * value" badge and a green-tinted block.
 */
function LegBlock({
  title,
  value,
  badge,
  children,
}: {
  title: string
  value: number | null
  badge: 'median' | 'mean' | null
  children: ReactNode
}) {
  const skipped = value === null
  return (
    <div className={`leg${badge ? ' leg-median' : ''}${skipped ? ' leg-skipped' : ''}`}>
      <h3>{title}</h3>
      <p className="leg-value">
        <strong>{skipped ? '—' : money(value)}</strong>
        {skipped && <span className="pill skipped">Skipped</span>}
        {badge === 'median' && <span className="pill growth">Median → fair value</span>}
        {badge === 'mean' && <span className="pill growth">Mean of 2 legs → fair value</span>}
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
  /** What drives this leg, taken only from the stored leg data. */
  driver: string
}

/**
 * Which of our three valuation legs sits closest to the analyst consensus
 * mean target, and what drives it. Drivers come only from the stored legs:
 * the DCF base FCF/share is parsed out of the stored DCF method text, the
 * PEGY trailing P/E and growth used are stored fields, and the
 * Forward-sector next-year EPS is parsed out of the stored method text
 * with the sector multiple a stored field. Skipped (null) legs are not
 * candidates. Returns null only if no leg has a value.
 */
function closestLegToTarget(
  legs: { dcf: DcfLeg; pegy: PegLeg; forward_sector: ForwardLeg },
  targetMean: number,
): ClosestLeg | null {
  const candidates: ClosestLeg[] = []
  if (legs.dcf.value !== null) {
    const baseFcf = legs.dcf.method.match(/FCF\/share \$(-?[\d.]+)/)?.[1]
    candidates.push({
      name: 'DCF',
      value: legs.dcf.value,
      distancePct: Math.abs(legs.dcf.value - targetMean) / targetMean,
      driver:
        baseFcf !== undefined
          ? `base FCF/share $${baseFcf} at ${pct(legs.dcf.growth_scenario)} growth`
          : `growth scenario ${pct(legs.dcf.growth_scenario)}`,
    })
  }
  if (legs.pegy.value !== null) {
    candidates.push({
      name: 'PEGY',
      value: legs.pegy.value,
      distancePct: Math.abs(legs.pegy.value - targetMean) / targetMean,
      driver: `trailing P/E ${legs.pegy.pe_used !== null ? legs.pegy.pe_used.toFixed(2) : '—'} at ${pct(legs.pegy.growth_used)} growth`,
    })
  }
  if (legs.forward_sector.value !== null) {
    const fwdEps = legs.forward_sector.method.match(/next-year EPS \$([\d.]+)/)?.[1]
    candidates.push({
      name: 'Forward-sector',
      value: legs.forward_sector.value,
      distancePct: Math.abs(legs.forward_sector.value - targetMean) / targetMean,
      driver: `next-year EPS $${fwdEps ?? '—'} × sector forward P/E ${legs.forward_sector.sector_multiple !== null ? legs.forward_sector.sector_multiple.toFixed(1) : '—'}×`,
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

  // Which leg(s) source the triangulated fair value, computed from the
  // stored leg values — never hardcoded per ticker. With three legs the
  // fair value is the median leg; with two available legs it is their
  // mean. A leg is badged only if the computed value matches the stored
  // fair value (within rounding), so a data change can never badge the
  // wrong leg.
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
  const legBadge = (key: string): 'median' | 'mean' | null =>
    medianLegKey === key ? 'median' : meanLegKeys.includes(key) ? 'mean' : null
  const quality = pillars.quality.detail
  const technical = pillars.technical.detail
  const trust = pillars.trust.detail
  const priceDate = RESULTS.price_date

  // (9) The Stock Check vs Wall Street — all figures from the stored data only.
  // The analysts block is optional: a name that carries no consensus
  // target renders the section as "not published" (see below) instead of
  // crashing or showing a guessed target. All 227 names in this build do
  // carry a complete block; the guard is for a future refresh that drops
  // one.
  const analysts = t.analysts ?? null
  const ourUpside = (t.triangulated_fv - t.price) / t.price
  const vsWallStreet =
    analysts === null
      ? null
      : {
          targetMean: analysts.target_mean,
          targetLow: analysts.target_low,
          targetHigh: analysts.target_high,
          nOpinions: analysts.n_opinions,
          consensusUpside: (analysts.target_mean - t.price) / t.price,
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
          ? `Closest leg: ${vsWallStreet.closest.name} at ${money(vsWallStreet.closest.value)} (${vsWallStreet.closest.driver}) — within ${pct(vsWallStreet.closest.distancePct, 1, false)} of the ${money(vsWallStreet.targetMean)} consensus mean. The rest of the gap is triangulation: our fair value is the ${val.fv_method ?? 'triangulation of the legs'}.`
          : `No leg explains the gap: the closest leg, ${vsWallStreet.closest.name} at ${money(vsWallStreet.closest.value)} (${vsWallStreet.closest.driver}), is still ${pct(vsWallStreet.closest.distancePct, 1, false)} from the ${money(vsWallStreet.targetMean)} consensus mean, while our fair value is ${money(t.triangulated_fv)} — the gap is not explained by the legs.`

  return (
    <div>
      {/* (1) Header */}
      <h1>
        {t.name} ({symbol})
      </h1>
      <p className="page-intro">
        {t.sector} · Price {money(t.price)} (close, {priceDate}) · Engine{' '}
        {RESULTS.engine}
      </p>
      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <VerdictBadge verdict={t.verdict} />
          <span>
            Overall score <strong className={`score-${scoreClass(t.overall_score)}`}>{score1(t.overall_score)}</strong>
          </span>
        </div>
        <p style={{ marginTop: 10 }}>{t.verdict_reason}</p>
        <Kv k="Triangulated fair value" v={money(t.triangulated_fv)} />
        <Kv k="Price vs fair value" v={pct((t.triangulated_fv - t.price) / t.price)} />
      </Card>

      {/* (2) Five pillars */}
      <Card title="Score pillars">
        <PillarBar label="Conviction" score={pillars.conviction.score} weight={25} />
        <PillarBar label="Valuation" score={pillars.valuation.score} weight={30} />
        <PillarBar label="Quality" score={pillars.quality.score} weight={20} />
        <PillarBar label="Technical" score={pillars.technical.score} weight={10} />
        <PillarBar label="Trust" score={pillars.trust.score} weight={15} />

        <h3>Conviction</h3>
        <Kv k="Story" v={scoreSpan(pillars.conviction.detail.story ?? 0)} />
        <Kv k="Financials" v={scoreSpan(pillars.conviction.detail.financials ?? 0)} />
        <MetricNote
          anchor="conviction"
          what="How strong the company's story and financials look — a measure of business momentum, scored by our Story-Tracker across 749 names. It asks whether the business is growing and gaining ground, not whether the stock is cheap."
          how="The average of two sub-scores: Story (forward revenue growth, price leadership, estimate revisions and theme strength) and Financials (revenue growth, profitability, cash flow and acceleration). It is reused as published by the weekly Story-Tracker run and never recomputed inside the engine."
        />

        <h3>Quality</h3>
        <SubscoreTable subscores={quality.subscores} labels={QUALITY_LABELS} />
        {quality.inputs && (
          <div>
            <Kv k="OCF as % of net income" v={pct(quality.inputs.ocf_pct_ni_used as number)} />
            <Kv k="Accruals (Sloan)" v={(quality.inputs.accruals_sloan as number).toFixed(4)} />
            <Kv k="Receivables change" v={`${(quality.inputs.receivables_change_pp as number) > 0 ? '+' : ''}${(quality.inputs.receivables_change_pp as number).toFixed(2)} pp`} />
            <Kv k="FCF conversion" v={pct(quality.inputs.fcf_conversion_used as number)} />
            <Kv k="Return on assets" v={pct(quality.inputs.roa as number)} />
            <Kv k="Debt / equity" v={(quality.inputs.debt_to_equity as number).toFixed(2)} />
          </div>
        )}
        <MetricNote
          anchor="quality"
          what="Whether the reported profits are backed by real cash — a check for accounting flattery. It is built from the six sub-checks above, so no single line has to stand for the whole picture."
          how="Operating cash flow vs net income (25%), accruals (20%), receivables trend (15%), free-cash-flow conversion (20%), return on assets (10%) and leverage, or debt / equity (10%). Where a one-off item was removed from earnings, the cash-flow checks use the adjusted figure."
        />

        <h3>Technical</h3>
        <SubscoreTable subscores={technical.subscores} labels={TECHNICAL_LABELS} />
        {technical.inputs && (
          <div>
            <Kv k="EMA 20" v={money(technical.inputs.ema20 as number)} />
            <Kv k="EMA 50" v={money(technical.inputs.ema50 as number)} />
            <Kv k="EMA 200" v={money(technical.inputs.ema200 as number)} />
            <Kv k="RSI (14)" v={(technical.inputs.rsi14 as number).toFixed(1)} />
            <Kv k="MACD histogram" v={(technical.inputs.macd_hist as number).toFixed(2)} />
            <Kv k="Price vs 200-day" v={pct(technical.inputs.price_vs_200d_pct as number)} />
          </div>
        )}
        <MetricNote
          anchor="technical"
          what="Short-term timing — whether the price trend and momentum are with the stock right now. It is a timing read, not a judgement on the business itself."
          how="Trend from the 20-, 50- and 200-day moving averages (35%), price vs its 200-day average (25%), RSI (20%) and MACD (20%)."
        />

        <h3>Trust</h3>
        <SubscoreTable subscores={trust.subscores} labels={TRUST_LABELS} />
        {trust.inputs && (
          <div>
            <Kv k="Analysts covering" v={String(trust.inputs.n_analysts)} />
            <Kv k="Target spread ÷ mean" v={(trust.inputs.target_spread_div_mean as number).toFixed(3)} />
            <Kv k="Insider activity (90d)" v={String(trust.inputs.insider_note)} />
          </div>
        )}
        <MetricNote
          anchor="trust"
          what="How much we can trust the numbers behind the score — whether the data is complete, well covered by analysts, and not built on guesswork."
          how="Data completeness (30%), analyst coverage (25%), target dispersion — how far apart analysts' price targets are (25%) — and insider activity (20%). Missing data is scored as missing, never as a clean bill of health: with no insider feed, that check scores a neutral 50."
        />
      </Card>

      {/* (3) Valuation */}
      <Card title="Valuation">
        <Kv k="Triangulated fair value" v={money(t.triangulated_fv)} />
        <Kv k="Method" v={val.fv_method ?? '—'} />
        <Kv k="Price" v={money(t.price)} />
        <Kv k="Upside vs price" v={pct(val.upside_pct)} />
        <Kv k="Leg spread ÷ fair value" v={pct(val.leg_spread_div_fv)} />
        <MetricNote
          anchor="triangulated-fv"
          what="Our single fair-value estimate for the stock — the middle of the three legs below, so no one method dominates. When one leg is skipped, it is the average of the two that remain."
          how="Take the DCF, PEGY and Forward-sector legs and pick the median (the middle value). If a leg is skipped, the fair value is the mean of the two available legs. A wide spread between the legs means more uncertainty, and a very wide spread caps the valuation score."
        />
        <MetricNote
          anchor="valuation"
          what="How cheap or expensive the stock looks against our triangulated fair value — the bigger the upside to fair value, the higher the score. It carries the most weight of the five pillars (30%)."
          how="Scored from the upside (fair value ÷ price − 1) on a fixed scale: −40% upside scores 10, 0% scores 55 and +50% scores 100. If the three legs disagree widely, the score is capped — at 65 when the leg spread is over 75% of fair value, and at 55 when it is over 100%."
        />
        <LegBlock title="DCF leg" value={legs.dcf.value} badge={legBadge('dcf')}>
          <p>{legs.dcf.method}</p>
          {legs.dcf.growth_scenario !== null && (
            <p className="footnote">Growth scenario: {pct(legs.dcf.growth_scenario)}</p>
          )}
          <MetricNote
          anchor="dcf-leg"
            what="What the stock would be worth if you valued it purely on the cash the business is expected to throw off in the future — free cash flow, the cash left after the company pays to run and grow itself."
            how="Free cash flow per share is projected for 5 years (growth capped at 20% a year), a terminal value is added assuming 2.5% growth forever after, and the whole stream is discounted back to today at 10% a year — 12% for high-beta names (raw beta of 2.0 or more) — anchored on a 5.00% risk-free rate. Where the per-share cash-flow basis can't be verified in dollars, the leg is skipped instead of guessed."
          />
        </LegBlock>
        <LegBlock title="PEGY leg" value={legs.pegy.value} badge={legBadge('pegy')}>
          <p>{legs.pegy.method}</p>
          {legs.pegy.pegy !== null && (
            <p className="footnote">
              PEGY {legs.pegy.pegy.toFixed(3)} · growth used{' '}
              {legs.pegy.growth_used !== null ? pct(legs.pegy.growth_used) : '—'} · P/E used{' '}
              {legs.pegy.pe_used !== null ? legs.pegy.pe_used.toFixed(2) : '—'}
            </p>
          )}
          <MetricNote
          anchor="pegy-leg"
            what="A value based on the stock's earnings multiple and how fast earnings are expected to grow — the classic Peter Lynch idea that a fairly priced stock's P/E should roughly match its growth rate, with the dividend yield added in."
            how="PEGY is (expected earnings growth + dividend yield) ÷ the trailing P/E, and fair price = current price × PEGY — so a PEGY above 1 means the stock looks cheap on its growth, and below 1 means expensive. Growth is the implied 5-year earnings growth, capped at 30%, and earnings are on a non-GAAP basis, with one-off items removed where the one-off rule applies."
          />
        </LegBlock>
        <LegBlock
          title="Forward-sector leg"
          value={legs.forward_sector.value}
          badge={legBadge('forward')}
        >
          <p>{legs.forward_sector.method}</p>
          {legs.forward_sector.sector_multiple !== null && (
            <p className="footnote">
              Sector forward P/E {legs.forward_sector.sector_multiple.toFixed(1)}×
              {legs.forward_sector.sector_multiple_asof
                ? ` (FactSet, ${legs.forward_sector.sector_multiple_asof})`
                : ''}
            </p>
          )}
          <MetricNote
          anchor="forward-sector-leg"
            what="A value based on what analysts expect the company to earn next year, priced at the multiple the market currently pays for its sector — not at a fixed multiple for every stock."
            how="Next-year analyst earnings per share × the sector's forward P/E from FactSet (refreshed quarterly, capped at 35× and floored at 10×), then discounted 10% for one year. If the sector figure is missing, the fallback is the S&P 500 forward P/E, and then a legacy 22× as a flagged last resort."
          />
        </LegBlock>
      </Card>

      {/* (4) Ladder */}
      <Card title="Valuation ladder">
        <LadderTable fv={t.triangulated_fv} price={t.price} />
        <MetricNote
          anchor="ladder"
          what="Four price levels derived from our fair value — Heavy at 0.60×, Buy at 0.80×, Fair at 1.00× and Exit at 1.20× — showing where today's price sits against our estimate."
          how="Each level is a fixed ratio of the triangulated fair value, the same ratios for every ticker. The levels are reference points for judging how far the price is from our estimate; they are not instructions to trade."
        />
      </Card>

      {/* (5) CAPM cross-check */}
      <Card title="CAPM cross-check — display only">
        <p>
          <strong>CROSS-CHECK ONLY — does not change any fair value, score or verdict.</strong>
        </p>
        {capm.value === null ? (
          <p>
            <strong>Skipped.</strong> {capm.method}
          </p>
        ) : (
          <p>
            CAPM DCF value <strong>{money(capm.value)}</strong> at a CAPM discount of{' '}
            <strong>{capm.discount_capm !== null ? pct(capm.discount_capm) : '—'}</strong>,
            vs the decision DCF leg of {money(legs.dcf.value)}.
          </p>
        )}
        <Kv k="CAPM discount" v={capm.discount_capm !== null ? pct(capm.discount_capm) : '—'} />
        <Kv k="Raw beta (Yahoo)" v={capm.beta_raw !== null ? capm.beta_raw.toFixed(3) : '—'} />
        <Kv
          k="Adjusted beta (0.67 × raw + 0.33)"
          v={capm.beta_adjusted !== null ? capm.beta_adjusted.toFixed(3) : '—'}
        />
        <Kv k="10-year Treasury" v="5.10% as of 2026-11-12 (FRED DGS10)" />
        <Kv k="Damodaran implied ERP" v="4.41% as of 2026-11-01" />
        {capm.method && capm.value !== null && <p className="footnote">{capm.method}</p>}
        <p>
          Backtest v3 (full 749-name universe) measured the effect of the CAPM leg: 6-month
          correlations were about −0.06 vs −0.05 for flat discounts, and the buckets still
          do not separate forward returns — so the leg stays display-only.
        </p>
        <p className="footnote">
          Full detail: <Link href="/methodology#capm-cross-check">Methodology</Link>.
        </p>
      </Card>

      {/* (6) DCF sensitivity grid */}
      <Card title="DCF sensitivity grid">
        <SensitivityGrid
          values={grid.values}
          decisionLeg={legs.dcf.value}
          decisionGrowth={legs.dcf.growth_scenario}
          note={grid.note}
        />
        <MetricNote
          anchor="sensitivity-grid"
          what="The same DCF leg, shown across a range of assumptions instead of a single point — so you can see how much the answer moves if growth or interest rates turn out differently."
          how="Rows are free-cash-flow growth from 0% to 20% (the cap); columns are the risk-free rate from 4.0% to 6.0%. Each cell's discount is the risk-free rate plus a locked spread (5 points at the 10% discount tier, 7 points at the 12% tier), so the 5.0% column reproduces the decision DCF leg where the growth is a grid row. The grid shows how sensitive the leg is to its assumptions — it is not a second valuation."
        />
      </Card>

      {/* (7) Earnings-quality evidence */}
      <Card title="Earnings-quality evidence">
        <p>
          Quality score {scoreSpan(pillars.quality.score)} — OCF {pct(quality.inputs?.ocf_pct_ni_used as number)}{' '}
          of net income, FCF conversion {pct(quality.inputs?.fcf_conversion_used as number)} of net
          income, accruals (Sloan) {(quality.inputs?.accruals_sloan as number).toFixed(4)},
          receivables change{' '}
          {(quality.inputs?.receivables_change_pp as number) > 0 ? '+' : ''}
          {(quality.inputs?.receivables_change_pp as number).toFixed(2)} pp, return on assets{' '}
          {pct(quality.inputs?.roa as number)}, debt / equity{' '}
          {(quality.inputs?.debt_to_equity as number).toFixed(2)}.
        </p>
        {symbol === 'GOOGL' && (
          <div className="callout">
            <strong>ONEOFF-v1 adjustment — shown both ways.</strong> Reported TTM net income
            $235.7B includes equity-security marks in all three 2026 quarters: Q1 +$28.7B,
            Q2 +$77.1B, Q3 −$6.7B after tax (net +$99.1B removed). Adjusted net income
            $136.6B, adjusted EPS $11.10, adjusted trailing P/E 26.65 — the adjusted
            figures are the ones used for Quality and the PEGY leg.
          </div>
        )}
        {symbol !== 'GOOGL' && (() => {
          // Generic ONEOFF callout: a flag that records an applied
          // ONEOFF-v1 adjustment carries "Adjusted TTM NI" (flag-only
          // near-misses and no-adjustment notes do not). GOOGL keeps
          // its curated callout above.
          const oneoffFlag = t.flags?.find(
            (f) => f.includes('ONEOFF-v1') && /adjusted TTM NI/i.test(f),
          )
          return oneoffFlag ? (
            <div className="callout">
              <strong>ONEOFF-v1 adjustment — shown both ways.</strong> {oneoffFlag}
            </div>
          ) : (
            <p>No one-off earnings adjustment was applied to this name.</p>
          )
        })()}
      </Card>

      {/* (8) Pros and cons */}
      <div className="two-col">
        <Card title="Pros" accent="green">
          <ul className="pros">
            {t.pros.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </Card>
        <Card title="Cons" accent="red">
          <ul className="cons">
            {t.cons.map((c) => (
              <li key={c}>{c}</li>
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
                  <th>The Stock Check (ours)</th>
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
                  <td>{signedPctSpan(ourUpside)}</td>
                  <td>{signedPctSpan(vsWallStreet.consensusUpside)}</td>
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
                  <td>{vsWallStreet.nOpinions}</td>
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
                  <td>Gap, ours − consensus mean</td>
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
            <MetricNote
              anchor="us-vs-wall-street"
              what="Our fair value next to Wall Street's — the average (mean) of the price targets published by the analysts who cover the stock, with the range of their targets and how many of them there are."
              how="The consensus mean, low, high and analyst count come from Yahoo Finance analyst targets, fetched 15–16 Nov 2026 and carried through unchanged; the nightly refresh updates the price only. The gap is our fair value minus the consensus mean. The 'Why the gap?' line checks whether any of our three legs sits within 10% of the consensus mean — if one does, it names it; if none does, it says so plainly instead of inventing a reason."
            />
            <p className="footnote">
              Analyst consensus: Yahoo Finance analyst targets, fetched 15–16 Nov 2026.
              Targets are carried through unchanged from that frozen fetch; the nightly
              refresh updates price only.
            </p>
          </>
        )}
      </Card>

      {/* (10) Flags */}
      {t.flags.length > 0 && (
        <Card title="Flags">
          {t.flags.map((f) => (
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
            The Forward leg fell from $317.07 (22×) to $259.42 (sector 18.0×), narrowing
            the leg spread from 0.898 to 0.656 and releasing the cap that had bound the
            valuation score at 65.0.
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
          Price chart, financials table, news and dividends are not in this build&apos;s data yet. The {priceDate} close (
          {money(t.price)}) and the technicals above are the current snapshot; those
          sections arrive with the live-data feed.
        </p>
      </Card>

      <p className="footnote">
        Data as of {RESULTS.as_of} · {RESULTS.engine} · Prices are the {priceDate} close.
      </p>
    </div>
  )
}
