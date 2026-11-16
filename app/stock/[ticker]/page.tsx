import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import {
  RESULTS,
  getTicker,
  money,
  pct,
  score1,
  type TickerData,
} from '@/lib/data'
import {
  Card,
  VerdictBadge,
  PillarBar,
  LadderTable,
  scoreSpan,
  scoreClass,
} from '@/components/ui'
import SensitivityGrid from '@/components/SensitivityGrid'

const SYMBOLS = ['NVDA', 'AAPL', 'MSFT', 'GOOGL', 'NVO', 'AMZN', 'META', 'TSLA', 'AVGO', 'BRK-B', 'LLY', 'JPM', 'V'] as const

export function generateStaticParams() {
  return SYMBOLS.map((ticker) => ({ ticker }))
}

// NOTE: `export const dynamicParams = false` was removed — it is not
// compatible with Next 16's Cache Components. With `output: 'export'`
// the static export only generates the thirteen generateStaticParams paths;
// any other /stock/<ticker> URL 404s, which is the same behaviour.

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

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  )
}

export default async function StockPage({ params }: PageProps<'/stock/[ticker]'>) {
  const { ticker } = await params
  const symbol = ticker.toUpperCase()
  const t: TickerData | null = getTicker(symbol)
  if (!t) notFound()

  const { pillars, stock_verdicts: sv, vs_stock_verdicts: vs } = t
  const val = pillars.valuation.detail
  const legs = val.legs!
  const capm = val.dcf_capm_crosscheck!
  const grid = val.dcf_sensitivity_grid!
  const quality = pillars.quality.detail
  const technical = pillars.technical.detail
  const trust = pillars.trust.detail
  const priceDate = RESULTS.price_date
  const theirFair = sv.ladder[2]

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
        <Kv k="Story" v={score1(pillars.conviction.detail.story ?? 0)} />
        <Kv k="Financials" v={score1(pillars.conviction.detail.financials ?? 0)} />

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

        <h3>Trust</h3>
        <SubscoreTable subscores={trust.subscores} labels={TRUST_LABELS} />
        {trust.inputs && (
          <div>
            <Kv k="Analysts covering" v={String(trust.inputs.n_analysts)} />
            <Kv k="Target spread ÷ mean" v={(trust.inputs.target_spread_div_mean as number).toFixed(3)} />
            <Kv k="Insider activity (90d)" v={String(trust.inputs.insider_note)} />
          </div>
        )}
      </Card>

      {/* (3) Valuation */}
      <Card title="Valuation">
        <Kv k="Triangulated fair value" v={money(t.triangulated_fv)} />
        <Kv k="Method" v={val.fv_method ?? '—'} />
        <Kv k="Price" v={money(t.price)} />
        <Kv k="Upside vs price" v={pct(val.upside_pct)} />
        <Kv k="Leg spread ÷ fair value" v={pct(val.leg_spread_div_fv)} />
        <h3>DCF leg</h3>
        <p>
          <strong>{legs.dcf.value === null ? 'Skipped' : money(legs.dcf.value)}</strong>
        </p>
        <p>{legs.dcf.method}</p>
        {legs.dcf.growth_scenario !== null && (
          <p className="footnote">Growth scenario: {pct(legs.dcf.growth_scenario)}</p>
        )}
        <h3>PEGY leg</h3>
        <p>
          <strong>{legs.pegy.value === null ? '—' : money(legs.pegy.value)}</strong>
        </p>
        <p>{legs.pegy.method}</p>
        {legs.pegy.pegy !== null && (
          <p className="footnote">
            PEGY {legs.pegy.pegy.toFixed(3)} · growth used{' '}
            {legs.pegy.growth_used !== null ? pct(legs.pegy.growth_used) : '—'} · P/E used{' '}
            {legs.pegy.pe_used !== null ? legs.pegy.pe_used.toFixed(2) : '—'}
          </p>
        )}
        <h3>Forward-sector leg</h3>
        <p>
          <strong>{legs.forward_sector.value === null ? '—' : money(legs.forward_sector.value)}</strong>
        </p>
        <p>{legs.forward_sector.method}</p>
        {legs.forward_sector.sector_multiple !== null && (
          <p className="footnote">
            Sector forward P/E {legs.forward_sector.sector_multiple.toFixed(1)}×
            {legs.forward_sector.sector_multiple_asof
              ? ` (FactSet, ${legs.forward_sector.sector_multiple_asof})`
              : ''}
          </p>
        )}
        {symbol === 'NVO' && (
          <div className="callout">
            <strong>DCF leg skipped — DKK basis unverified.</strong> The fair value is the
            mean of the two available legs (PEGY and Forward-sector), as flagged in the
            engine data. The valuation rests on fewer legs than the other names here.
          </div>
        )}
      </Card>

      {/* (4) Ladder */}
      <Card title="Valuation ladder">
        <LadderTable fv={t.triangulated_fv} price={t.price} />
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
      </Card>

      {/* (6) DCF sensitivity grid */}
      <Card title="DCF sensitivity grid">
        <SensitivityGrid
          values={grid.values}
          decisionLeg={legs.dcf.value}
          decisionGrowth={legs.dcf.growth_scenario}
          note={grid.note}
        />
      </Card>

      {/* (7) Earnings-quality evidence */}
      <Card title="Earnings-quality evidence">
        <p>
          Quality score {score1(pillars.quality.score)} — OCF {pct(quality.inputs?.ocf_pct_ni_used as number)}{' '}
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
        {symbol === 'NVO' && (
          <div className="callout">
            <strong>ONEOFF-v1 adjustment — shown both ways.</strong> Q1 2026 net profit
            DKK 48,557M includes a DKK 26,760M non-cash reversal of a provision for US
            340B sales rebates. Adjusted TTM net income DKK 94,099M, adjusted EPS $3.29,
            adjusted trailing P/E 12.64 — the adjusted figures are the ones used for
            Quality and the PEGY leg. ADR: financials are reported in DKK and the
            per-share USD free-cash-flow basis is not verified, which is why the DCF leg
            is skipped.
          </div>
        )}
        {symbol !== 'GOOGL' && symbol !== 'NVO' && (() => {
          // Generic ONEOFF callout: a flag that records an applied
          // ONEOFF-v1 adjustment carries "Adjusted TTM NI" (flag-only
          // near-misses and no-adjustment notes do not). GOOGL/NVO keep
          // their curated callouts above.
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

      {/* (9) Side-by-side vs Stock Verdicts */}
      <Card title="Side by side with Stock Verdicts">
        <table>
          <thead>
            <tr>
              <th></th>
              <th>The Stock Check (ours)</th>
              <th>Stock Verdicts (theirs)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Verdict</td>
              <td>
                <VerdictBadge verdict={t.verdict} />
              </td>
              <td>{sv.verdict}</td>
            </tr>
            <tr>
              <td>Signal</td>
              <td>—</td>
              <td>{sv.signal}</td>
            </tr>
            <tr>
              <td>Fair value</td>
              <td>{money(t.triangulated_fv)}</td>
              <td>{money(theirFair)}</td>
            </tr>
            <tr>
              <td>Our FV vs their fair</td>
              <td colSpan={2}>
                {money(vs.our_fv_vs_their_fair)} (ours minus theirs)
              </td>
            </tr>
            <tr>
              <td>Verdicts agree</td>
              <td colSpan={2}>{vs.verdict_agree ? 'Yes' : 'No'}</td>
            </tr>
            <tr>
              <td>Trust</td>
              <td>{score1(pillars.trust.score)}</td>
              <td>{sv.trust}</td>
            </tr>
            <tr>
              <td>OCF as % of net income</td>
              <td>{pct(quality.inputs?.ocf_pct_ni_used as number)}</td>
              <td>{sv.ocf_pct_ni}%</td>
            </tr>
          </tbody>
        </table>
        <h3>Their scores (Value / Growth / Quality / Technical)</h3>
        <Kv k="Value" v={String(sv.scores[0])} />
        <Kv k="Growth" v={String(sv.scores[1])} />
        <Kv k="Quality" v={String(sv.scores[2])} />
        <Kv k="Technical" v={String(sv.scores[3])} />
        <h3>Their ladder</h3>
        <table>
          <thead>
            <tr>
              <th>Level</th>
              <th className="num">Theirs</th>
              <th className="num">Ours</th>
              <th className="num">Difference</th>
            </tr>
          </thead>
          <tbody>
            {(['Heavy', 'Buy', 'Fair', 'Exit'] as const).map((name, i) => {
              const ours = [t.ladder.heavy, t.ladder.buy, t.ladder.fair, t.ladder.exit][i]
              const diff = [vs.ladder_diff.heavy, vs.ladder_diff.buy, vs.ladder_diff.fair, vs.ladder_diff.exit][i]
              return (
                <tr key={name}>
                  <td>{name}</td>
                  <td className="num">{money(sv.ladder[i])}</td>
                  <td className="num">{money(ours)}</td>
                  <td className="num">{money(diff)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <p className="footnote">
          Their ladder levels are shown at the same 0.6× / 0.8× / 1.0× / 1.2× ratios of
          their fair value; their fair value is the third level ({money(theirFair)}).
        </p>
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
          Price chart, financials table, analyst consensus and targets, news and
          dividends are not in this build&apos;s data yet. The {priceDate} close (
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
