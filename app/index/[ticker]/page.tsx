import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import {
  INDEX_RESULTS,
  INDEX_SYMBOLS,
  getIndex,
  getIndexUniverse,
} from '@/lib/index-data'
import { money, pct } from '@/lib/format'
import {
  Card,
  IndexTypeBadge,
  MomentumReadBadge,
  PillarBar,
  TechnicalReadBadge,
  scoreSpan,
  signedPctSpan,
} from '@/components/ui'
import { IndexLivePrice, IndexLiveStatusLine } from '@/components/IndexLive'

// Static export: one page per index in the universe, so the generated set
// can never drift from the data. Any other /index/<ticker> URL 404s.
export function generateStaticParams() {
  return INDEX_SYMBOLS.map((ticker) => ({ ticker }))
}

export async function generateMetadata({
  params,
}: PageProps<'/index/[ticker]'>): Promise<Metadata> {
  const { ticker } = await params
  const t = getIndex(ticker)
  if (!t) return { title: 'Not found | The Stock Check' }
  return { title: `${ticker.toUpperCase()} — ${t.name} | The Stock Check` }
}

/** One row of a joined sub-score table: the check, the evidence that
    produced its score, and the score itself — the stock card's pattern,
    reused for the index Technical read. */
interface JoinedRow {
  label: string
  evidence: ReactNode
  score: number | null
}

function JoinedSubscoreTable({ rows }: { rows: JoinedRow[] }) {
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

/** EMA-trend reading: the same five branches the engine scores on
    (pillar_technical), in plain words. Only the wording is derived here;
    the score always comes from the stored subscore. */
function emaTrendText(price: number, ema20: number, ema50: number, ema200: number): string {
  if (price > ema20 && ema20 > ema50 && ema50 > ema200) return 'Level above EMA 20, 50 and 200'
  if (price > ema50 && ema50 > ema200) return 'Level above EMA 50 and 200'
  if (price > ema50 || price > ema200) return 'Level above EMA 50 or 200'
  if (price < ema20 && ema20 < ema50 && price < ema200) return 'Level below EMA 20, 50 and 200'
  return 'Mixed — level between the averages'
}

function vixRegimePill(regime: string) {
  const cls =
    regime === 'Calm' || regime === 'Normal'
      ? 'growth'
      : regime === 'Elevated'
        ? 'watch'
        : 'avoid'
  return <span className={`pill ${cls}`}>{regime}</span>
}

export default async function IndexPage({ params }: PageProps<'/index/[ticker]'>) {
  const { ticker } = await params
  const symbol = ticker.toUpperCase()
  const t = getIndex(symbol)
  if (!t) notFound()
  const uni = getIndexUniverse(symbol)
  const priceDate = INDEX_RESULTS.price_date
  const isVix = symbol === 'VIX'

  const technicalRows: JoinedRow[] = !isVix
    ? [
        {
          label: 'EMA trend',
          evidence: `${emaTrendText(t.price, t.ema20!, t.ema50!, t.ema200!)} — level ${money(t.price)}, EMA 20 ${money(t.ema20!)}, EMA 50 ${money(t.ema50!)}, EMA 200 ${money(t.ema200!)}`,
          score: t.technical_subscores!.trend_ema,
        },
        {
          label: 'Level vs 200-day',
          evidence: `${pct(t.price_vs_200d_pct!, 1)} vs the 200-day average (${money(t.ema200!)})`,
          score: t.technical_subscores!.price_vs_200d,
        },
        {
          label: 'RSI (14)',
          evidence: `RSI ${t.rsi14!.toFixed(1)}`,
          score: t.technical_subscores!.rsi,
        },
        {
          label: 'MACD histogram',
          evidence: `MACD ${t.macd_line!.toFixed(2)} vs signal ${t.macd_signal!.toFixed(2)} — histogram ${t.macd_hist! >= 0 ? '+' : ''}${t.macd_hist!.toFixed(2)}`,
          score: t.technical_subscores!.macd,
        },
      ]
    : []

  return (
    <>
      <p>
        <Link href="/indexes">← All indexes</Link>
      </p>
      <section className="hero-band">
        <p className="hero-eyebrow">
          Index · {t.type === 'volatility' ? 'Volatility — a regime, not a trend' : t.category}
        </p>
        <h1>
          {symbol} — {t.name}
        </h1>
        <p className="hero-tagline">
          <IndexTypeBadge type={t.type} /> {t.provider} · {t.category}
          {uni?.index && uni.index !== t.name ? ` · ${uni.index}` : ''}
        </p>
        <p className="hero-intro">
          <IndexLivePrice symbol={symbol} price={t.price} changePct={t.change_pct} /> · as of
          the {priceDate} close unless marked LIVE.
        </p>
      </section>

      <IndexLiveStatusLine priceDateLabel={priceDate} />

      {isVix ? (
        <>
          <Card title="Volatility regime — VIX is not scored" accent="amber">
            <p>
              <strong>
                VIX {t.price.toFixed(2)} — {vixRegimePill(t.regime!)}.
              </strong>{' '}
              The VIX measures expected volatility, not a price going up. A high VIX is fear,
              not strength — scored like a price, a spiking VIX would read &quot;Strong&quot;,
              exactly backwards. So this card carries no Technical or Momentum score. What it
              carries is the regime, the curve, and the expected daily move.
            </p>
          </Card>

          <Card title="The regime — and what it implies">
            <table>
              <tbody>
                <tr>
                  <td>VIX ({priceDate} close)</td>
                  <td className="num">{t.price.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>Regime</td>
                  <td className="num">{vixRegimePill(t.regime!)}</td>
                </tr>
                <tr>
                  <td>VIX3M (3-month VIX)</td>
                  <td className="num">{t.vix3m!.toFixed(2)}</td>
                </tr>
                <tr>
                  <td>VIX / VIX3M ratio</td>
                  <td className="num">
                    {t.vix_vix3m_ratio!.toFixed(3)} — {t.curve_state}
                  </td>
                </tr>
                <tr>
                  <td>Expected daily S&amp;P 500 move</td>
                  <td className="num">
                    ±{pct(t.expected_move_pct!, 2)} (±{t.expected_move_points!.toFixed(1)}{' '}
                    points)
                  </td>
                </tr>
                <tr>
                  <td>52-week high / low</td>
                  <td className="num">
                    {t.high_52w.toFixed(2)} / {t.low_52w.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
            <p className="footnote">
              Bands: Calm below 15 · Normal 15–20 · Elevated 20–30 · High 30–40 · Extreme
              above 40 — the same bands as the Volatility panel on{' '}
              <Link href="/pulse">Market Pulse</Link>. Curve: ratio below 1 is contango (the
              market expects volatility to fall); above 1 is backwardation (volatility is
              expected to stay high or rise). Expected daily move = VIX ÷ √252. VIX3M comes
              from Yahoo Finance (^VIX3M) — a single source, cross-checked against the
              morning briefing&apos;s verified closes.
            </p>
          </Card>
        </>
      ) : (
        <Card title="The two reads — no fair value, no verdict">
          <p>
            <strong>No fair value — indexes have no earnings to value.</strong> This card never
            shows a fair value, a verdict, or an overall score. It shows two reads, each with
            its own evidence, and they are never combined into one number.
          </p>
          <PillarBar label="Technical" score={t.technical_score!} />
          <p>
            Technical <TechnicalReadBadge read={t.technical_read!} /> · Momentum{' '}
            <MomentumReadBadge read={t.momentum_read!} />
          </p>
          <h3>Technical — from the price chart alone</h3>
          <JoinedSubscoreTable rows={technicalRows} />
          <p className="footnote">
            The Technical score is the stock engine&apos;s Technical pillar, exactly: trend
            35%, level vs 200-day 25%, RSI 20%, MACD 20%. Strong ≥ 70, Mixed 40–69, Weak
            &lt; 40.
          </p>
          <h3>Momentum — recent returns</h3>
          <table className="subscores">
            <thead>
              <tr>
                <th>Window</th>
                <th className="num">Return</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1 week</td>
                <td className="num">{signedPctSpan(t.ret_1w!, 1, 0.001)}</td>
              </tr>
              <tr>
                <td>4 weeks</td>
                <td className="num">{signedPctSpan(t.ret_4w!, 1, 0.001)}</td>
              </tr>
              <tr>
                <td>13 weeks</td>
                <td className="num">{signedPctSpan(t.ret_13w!, 1, 0.001)}</td>
              </tr>
              <tr>
                <td>
                  <strong>Momentum Score</strong> (0.5 × 13W + 0.3 × 4W + 0.2 × 1W)
                </td>
                <td className="num">
                  <strong>{signedPctSpan(t.momentum_score!, 1, 0.001)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <p className="footnote">
            Momentum Score {signedPctSpan(t.momentum_score!, 1, 0.001)} —{' '}
            {t.momentum_read}. Building ≥ +5%, Flat −5% to +5%, Fading &lt; −5%. Returns are
            price returns from Yahoo daily closes.
          </p>
        </Card>
      )}

      <Card title="Level and trend facts">
        <table>
          <tbody>
            <tr>
              <td>{isVix ? 'VIX' : 'Level'} ({priceDate} close)</td>
              <td className="num">{money(t.price)}</td>
            </tr>
            <tr>
              <td>Day change</td>
              <td className="num">{signedPctSpan(t.change_pct, 1, 0.001)}</td>
            </tr>
            <tr>
              <td>52-week high / low</td>
              <td className="num">
                {money(t.high_52w)} / {money(t.low_52w)} ({pct(t.price / t.high_52w - 1, 1)}{' '}
                off high)
              </td>
            </tr>
            {!isVix && (
              <>
                <tr>
                  <td>50-day average</td>
                  <td className="num">
                    {money(t.dma50!)} ({pct(t.vs_50dma_pct!, 1)} vs 50DMA)
                  </td>
                </tr>
                <tr>
                  <td>1-year return</td>
                  <td className="num">{signedPctSpan(t.ret_1y!, 1, 0.001)}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </Card>

      <Card title="How to read this card">
        <p>
          An index is a benchmark, not a business. There is no fair value here because there
          are no earnings to value — and no verdict, because a verdict would need one. Read
          the two reads for what they are: the Technical score says whether the trend is
          with the index, the Momentum Score says how the last thirteen weeks have run.
          Neither is a recommendation.
          {isVix
            ? ' The VIX is different again: it measures expected volatility, so read the regime, not a trend.'
            : ''}
        </p>
        <p>
          <Link href="/methodology#indexes">Full index methodology →</Link>
        </p>
      </Card>

      <Card title="Disclaimer" accent="amber">
        <p>
          Index content is for research and education only. It is not investment advice, and
          nothing here is a recommendation to buy or sell any security. Indexes have no fair
          value and no verdict on this site; the Technical and Momentum reads — and the VIX
          regime read — are informational only. Data may be delayed and can contain errors —
          verify before trading. Past performance does not guarantee future results.
        </p>
      </Card>
    </>
  )
}
