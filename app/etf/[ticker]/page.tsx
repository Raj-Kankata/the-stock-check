import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import {
  ETF_FACTS,
  ETF_RESULTS,
  ETF_SYMBOLS,
  getEtf,
  getEtfFacts,
  getEtfUniverse,
} from '@/lib/etf-data'
import { money, pct } from '@/lib/format'
import {
  Card,
  EtfTypeBadge,
  MomentumReadBadge,
  PillarBar,
  TechnicalReadBadge,
  scoreSpan,
  signedPctSpan,
} from '@/components/ui'
import { EtfLivePrice, EtfLiveStatusLine } from '@/components/EtfLive'

// Static export: one page per ETF in the universe, so the generated set
// can never drift from the data. Any other /etf/<ticker> URL 404s.
export function generateStaticParams() {
  return ETF_SYMBOLS.map((ticker) => ({ ticker }))
}

export async function generateMetadata({
  params,
}: PageProps<'/etf/[ticker]'>): Promise<Metadata> {
  const { ticker } = await params
  const t = getEtf(ticker)
  if (!t) return { title: 'Not found | The Stock Check' }
  return { title: `${ticker.toUpperCase()} — ${t.name} | The Stock Check` }
}

/** One row of a joined sub-score table: the check, the evidence that
    produced its score, and the score itself — the stock card's pattern,
    reused for the ETF Technical read. */
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
  if (price > ema20 && ema20 > ema50 && ema50 > ema200) return 'Price above EMA 20, 50 and 200'
  if (price > ema50 && ema50 > ema200) return 'Price above EMA 50 and 200'
  if (price > ema50 || price > ema200) return 'Price above EMA 50 or 200'
  if (price < ema20 && ema20 < ema50 && price < ema200) return 'Price below EMA 20, 50 and 200'
  return 'Mixed — price between the averages'
}

function aumText(aum: number | null): string {
  if (aum === null) return '—'
  if (aum >= 1e12) return `$${(aum / 1e12).toFixed(2)}T`
  if (aum >= 1e9) return `$${(aum / 1e9).toFixed(1)}B`
  return `$${(aum / 1e6).toFixed(0)}M`
}

export default async function EtfPage({ params }: PageProps<'/etf/[ticker]'>) {
  const { ticker } = await params
  const symbol = ticker.toUpperCase()
  const t = getEtf(symbol)
  if (!t) notFound()
  const facts = getEtfFacts(symbol)
  const uni = getEtfUniverse(symbol)
  const priceDate = ETF_RESULTS.price_date

  const technicalRows: JoinedRow[] = [
    {
      label: 'EMA trend',
      evidence: `${emaTrendText(t.price, t.ema20, t.ema50, t.ema200)} — price ${money(t.price)}, EMA 20 ${money(t.ema20)}, EMA 50 ${money(t.ema50)}, EMA 200 ${money(t.ema200)}`,
      score: t.technical_subscores.trend_ema,
    },
    {
      label: 'Price vs 200-day',
      evidence: `${pct(t.price_vs_200d_pct, 1)} vs the 200-day average (${money(t.ema200)})`,
      score: t.technical_subscores.price_vs_200d,
    },
    {
      label: 'RSI (14)',
      evidence: `RSI ${t.rsi14.toFixed(1)}`,
      score: t.technical_subscores.rsi,
    },
    {
      label: 'MACD histogram',
      evidence: `MACD ${t.macd_line.toFixed(2)} vs signal ${t.macd_signal.toFixed(2)} — histogram ${t.macd_hist >= 0 ? '+' : ''}${t.macd_hist.toFixed(2)}`,
      score: t.technical_subscores.macd,
    },
  ]

  return (
    <>
      <p>
        <Link href="/etfs">← All ETFs</Link>
      </p>
      <section className="hero-band">
        <p className="hero-eyebrow">
          ETF · {t.type === 'leveraged' ? 'Leveraged — compare only with leveraged' : t.category}
        </p>
        <h1>
          {symbol} — {t.name}
        </h1>
        <p className="hero-tagline">
          <EtfTypeBadge type={t.type} /> {t.provider} · {t.category} · tracks {t.index}
          {uni?.former_ticker ? ` · formerly ${uni.former_ticker}` : ''}
        </p>
        <p className="hero-intro">
          <EtfLivePrice symbol={symbol} price={t.price} changePct={t.change_pct} /> · as of the{' '}
          {priceDate} close unless marked LIVE.
        </p>
      </section>

      <EtfLiveStatusLine priceDateLabel={priceDate} />

      {t.type === 'leveraged' && (
        <Card title="Leveraged fund — read with care" accent="amber">
          <p>
            {symbol} resets its leverage daily ({t.index}). Its returns compound differently
            from an unleveraged fund, so a large negative Momentum Score here does not mean
            the same thing as the same number on an equity ETF. Compare it only with other
            leveraged funds.
          </p>
        </Card>
      )}

      <Card title="The two reads — no fair value, no verdict">
        <p>
          <strong>No fair value — ETFs have no earnings to value.</strong> This card never
          shows a fair value, a verdict, or an overall score. It shows two reads, each with
          its own evidence, and they are never combined into one number.
        </p>
        <PillarBar label="Technical" score={t.technical_score} />
        <p>
          Technical <TechnicalReadBadge read={t.technical_read} /> · Momentum{' '}
          <MomentumReadBadge read={t.momentum_read} />
        </p>
        <h3>Technical — from the price chart alone</h3>
        <JoinedSubscoreTable rows={technicalRows} />
        <p className="footnote">
          The Technical score is the stock engine&apos;s Technical pillar, exactly: trend
          35%, price vs 200-day 25%, RSI 20%, MACD 20%. Strong ≥ 70, Mixed 40–69, Weak
          &lt; 40.
        </p>
        <h3>Momentum — recent total returns</h3>
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
              <td className="num">{signedPctSpan(t.ret_1w, 1, 0.001)}</td>
            </tr>
            <tr>
              <td>4 weeks</td>
              <td className="num">{signedPctSpan(t.ret_4w, 1, 0.001)}</td>
            </tr>
            <tr>
              <td>13 weeks</td>
              <td className="num">{signedPctSpan(t.ret_13w, 1, 0.001)}</td>
            </tr>
            <tr>
              <td>
                <strong>Momentum Score</strong> (0.5 × 13W + 0.3 × 4W + 0.2 × 1W)
              </td>
              <td className="num">
                <strong>{signedPctSpan(t.momentum_score, 1, 0.001)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
        <p className="footnote">
          Momentum Score {signedPctSpan(t.momentum_score, 1, 0.001)} —{' '}
          {t.momentum_read}. Building ≥ +5%, Flat −5% to +5%, Fading &lt; −5%. Returns are
          total returns (dividends included) from Yahoo adjusted closes.
        </p>
      </Card>

      <Card title="Price and trend facts">
        <table>
          <tbody>
            <tr>
              <td>Price ({priceDate} close)</td>
              <td className="num">{money(t.price)}</td>
            </tr>
            <tr>
              <td>Day change</td>
              <td className="num">{signedPctSpan(t.change_pct, 1, 0.001)}</td>
            </tr>
            <tr>
              <td>Volume</td>
              <td className="num">{t.volume.toLocaleString('en-US')}</td>
            </tr>
            <tr>
              <td>Relative volume</td>
              <td className="num">{t.rel_vol === null ? '—' : t.rel_vol.toFixed(2)}</td>
            </tr>
            <tr>
              <td>52-week high / low</td>
              <td className="num">
                {money(t.high_52w)} / {money(t.low_52w)} ({pct(t.price / t.high_52w - 1, 1)}{' '}
                off high)
              </td>
            </tr>
            <tr>
              <td>50-day average</td>
              <td className="num">
                {money(t.dma50)} ({pct(t.vs_50dma_pct, 1)} vs 50DMA)
              </td>
            </tr>
            <tr>
              <td>Beta (1y vs S&amp;P 500)</td>
              <td className="num">{t.beta === null ? '—' : t.beta.toFixed(2)}</td>
            </tr>
            <tr>
              <td>1-year total return</td>
              <td className="num">{signedPctSpan(t.ret_1y_total, 1, 0.001)}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      {facts && (
        <Card title="Fund facts">
          <table>
            <tbody>
              <tr>
                <td>Expense ratio</td>
                <td className="num">
                  {facts.expense_ratio === null ? '—' : pct(facts.expense_ratio, 2, false)}
                </td>
              </tr>
              <tr>
                <td>Assets under management</td>
                <td className="num">{aumText(facts.aum_usd)}</td>
              </tr>
              <tr>
                <td>Dividend yield</td>
                <td className="num">
                  {facts.dividend_yield === null ? '—' : pct(facts.dividend_yield, 2, false)}
                </td>
              </tr>
              <tr>
                <td>Holdings</td>
                <td className="num">
                  {facts.holdings_count === null
                    ? '—'
                    : facts.holdings_count.toLocaleString('en-US')}
                </td>
              </tr>
              <tr>
                <td>Inception</td>
                <td className="num">{facts.inception ?? '—'}</td>
              </tr>
            </tbody>
          </table>
          <p className="footnote">Fund facts as of {ETF_FACTS.as_of} (stockanalysis.com).</p>
          {facts.note === 'physical_gold' ? (
            <p>
              <strong>Physical gold bullion — no stock holdings.</strong> {symbol} holds
              gold bars in a vault, not shares of companies, so there is no holdings table
              for this fund.
            </p>
          ) : (
            facts.top_holdings.length > 0 && (
              <>
                <h3>Top 10 holdings</h3>
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Holding</th>
                      <th className="num">Weight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facts.top_holdings.map((h) => (
                      <tr key={h.rank}>
                        <td>{h.rank}</td>
                        <td>
                          <strong>{h.symbol}</strong> — {h.name}
                        </td>
                        <td className="num">
                          {h.weight === null ? '—' : pct(h.weight, 2, false)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )
          )}
        </Card>
      )}

      <Card title="How to read this card">
        <p>
          An ETF is a basket, not a business. There is no fair value here because there are
          no earnings to value — and no verdict, because a verdict would need one. Read the
          two reads for what they are: the Technical score says whether the price trend is
          with the fund, the Momentum Score says how the last thirteen weeks have run.
          Neither is a recommendation. Bond and commodity funds move for different reasons
          than equity funds, and leveraged funds compound differently again — the type
          badge at the top tells you which kind you are looking at.
        </p>
        <p>
          <Link href="/methodology#etfs">Full ETF methodology →</Link>
        </p>
      </Card>

      <Card title="Disclaimer" accent="amber">
        <p>
          ETF content is for research and education only. It is not investment advice, and
          nothing here is a recommendation to buy or sell any security. ETFs have no fair
          value and no verdict on this site; the Technical and Momentum reads are
          informational only. Data may be delayed and can contain errors — verify before
          trading. Past performance does not guarantee future results.
        </p>
      </Card>
    </>
  )
}
