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
        {badge === 'median' && <span className="pill growth">Fair value</span>}
        {badge === 'mean' && <span className="pill growth">Fair value</span>}
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
  const legBadge = (key: string): 'median' | 'mean' | null =>
    medianLegKey === key ? 'median' : meanLegKeys.includes(key) ? 'mean' : null
  // Leg range for the live pros/cons line (StockLiveProConLine): the
  // Cons tail claims the most generous leg sits below the price, so
  // the live rewrite needs the min/max of the available legs.
  const legValues = [legs.dcf.value, legs.pegy.value, legs.forward_sector.value].filter(
    (v): v is number => v !== null,
  )
  const legMin = legValues.length > 0 ? Math.min(...legValues) : null
  const legMax = legValues.length > 0 ? Math.max(...legValues) : null
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
        <Kv k="Story" v={scoreSpan(pillars.conviction.detail.story ?? 0)} />
        <Kv k="Financials" v={scoreSpan(pillars.conviction.detail.financials ?? 0)} />
        <MetricNote
          anchor="conviction"
          what="How strong the company's story and financials look — whether the business is growing and gaining ground."
          how="A higher score means a stronger business story. It says nothing about whether the stock is cheap."
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
          what="Whether the reported profits are backed by real cash, rather than accounting that flatters the numbers."
          how="A higher score means the earnings look more solid. A low score means you should trust the profit figures less."
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
          what="Whether the price trend and momentum are with the stock right now."
          how="A higher score means the short-term trend looks stronger. It says nothing about the business itself."
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
          what="How much we can rely on the numbers behind the score — whether the data is complete and well covered."
          how="A higher score means the figures rest on firmer ground. A lower score means more of the picture is missing or disputed."
        />
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
        <MetricNote
          anchor="triangulated-fv"
          label="What is this? — Fair value"
          what="Our single fair-value estimate for the stock, drawn from the three legs below."
          how="If the price is well below it, the stock looks cheap on our numbers. If it is well above it, the stock looks expensive — and a wide gap between the legs means more uncertainty."
        />
        <MetricNote
          anchor="valuation"
          label="What is this? — Valuation score"
          what="How cheap or expensive the stock looks against our fair value — the bigger the upside to fair value, the higher the score."
          how="A high score means the price sits well below our fair value. A low score means it sits at or above it."
        />
        <LegBlock title="DCF leg" value={legs.dcf.value} badge={legBadge('dcf')}>
          <MetricNote
          anchor="dcf-leg"
            what="What the stock could be worth based only on the cash the business is expected to generate in the years ahead."
            how="A higher number means that future cash looks more valuable. Compare it with the other two legs — if they disagree a lot, treat the fair value with more caution."
          />
        </LegBlock>
        <LegBlock title="PEGY leg" value={legs.pegy.value} badge={legBadge('pegy')}>
          {legs.pegy.pegy !== null && (
            <p className="footnote">PEGY {legs.pegy.pegy.toFixed(3)}</p>
          )}
          <MetricNote
          anchor="pegy-leg"
            what="What the stock could be worth based on its earnings, how fast those earnings are expected to grow, and the dividend it pays."
            how="A higher number means the stock looks cheaper against its growth. Compare it with the other two legs before judging the fair value."
          />
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
          <MetricNote
          anchor="forward-sector-leg"
            what="What the stock could be worth based on next year's expected earnings, priced the way the market currently prices its sector."
            how="A higher number means the stock looks cheaper against next year's earnings. Compare it with the other two legs before judging the fair value."
          />
        </LegBlock>
      </Card>

      {/* (4) Ladder */}
      <Card title="Valuation ladder">
        <StockLiveLadder symbol={symbol} fairValue={t.triangulated_fv} bakedPrice={t.price} />
        <MetricNote
          anchor="ladder"
          what="Four price levels around our fair value, showing where today's price sits against our estimate."
          how="Read them as reference points for judging how far the price is from our estimate. They are not instructions to trade."
        />
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
            vs the decision DCF leg of {money(legs.dcf.value)}.
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
        <MetricNote
          anchor="capm-cross-check"
          what="A second, independent check on the DCF leg, built from market inputs. It never changes the fair value, score or verdict."
          how="If it lands close to the DCF leg, the two views agree. If it lands far away, treat the DCF leg with more caution."
        />
      </Card>

      {/* (6) DCF sensitivity grid */}
      <Card title="DCF sensitivity grid">
        <SensitivityGrid
          values={grid.values}
          decisionLeg={legs.dcf.value}
          decisionGrowth={legs.dcf.growth_scenario}
        />
        <MetricNote
          anchor="sensitivity-grid"
          what="The same DCF leg, shown under different assumptions instead of a single point — so you can see how much the answer moves if the future turns out differently."
          how="The highlighted cell is this stock's own estimate. Cells further away show how the value would change if growth or rates came in higher or lower."
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
            <strong>One-off earnings adjustment — shown both ways.</strong> Reported TTM net income
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
              <strong>One-off earnings adjustment — shown both ways.</strong> {adjustmentFlag}
            </div>
          ) : (
            <p>No one-off earnings adjustment was applied to this name.</p>
          )
        })()}
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
            <MetricNote
              anchor="us-vs-wall-street"
              what="Our fair value next to Wall Street's — the average of the price targets published by the analysts who cover the stock."
              how="If our number is well above theirs, we are more optimistic than the average analyst. If it is well below, we are more cautious."
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

      <p className="footnote">
        Data as of {RESULTS.as_of} · {ENGINE_VERSION} · Prices are the {priceDate} close unless
        marked LIVE during market hours (quotes delayed ~15 min, TradingView).
      </p>
    </div>
  )
}
