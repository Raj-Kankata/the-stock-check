import type { Metadata } from 'next'
import Link from 'next/link'
import { RESULTS } from '@/lib/data'
import { ETF_FACTS, ETF_RESULTS } from '@/lib/etf-data'
import { allEtfRows } from '@/lib/public'
import { Card } from '@/components/ui'
import EtfBrowser from '@/components/EtfBrowser'

export function generateMetadata(): Metadata {
  return {
    title: 'Check any ETF before you buy',
    description: `${ETF_RESULTS.universe_count} ETFs, two honest reads each: a Technical score and a Momentum Score. No fair value, no verdict — an ETF has no earnings to value. Free, no sign-in.`,
  }
}

export default function EtfsPage() {
  const rows = allEtfRows()
  const priceDate = ETF_RESULTS.price_date
  const counts = { equity: 0, bond: 0, commodity: 0, leveraged: 0 } as Record<string, number>
  for (const r of rows) counts[r.type] += 1

  return (
    <>
      <section className="hero-band">
        <p className="hero-eyebrow">Technical · Momentum · No fair value</p>
        <h1>Check any ETF before you buy.</h1>
        <p className="hero-tagline">Two reads. No invented value.</p>
        <p className="hero-intro">
          {rows.length} ETFs, each with two reads: a Technical score from the price chart and
          a Momentum Score from recent returns. An ETF holds a basket, not a business — it has
          no earnings to value, so this board never shows a fair value, a verdict, or an
          overall score. What it shows is what can actually be measured. We also score{' '}
          {Object.keys(RESULTS.tickers).length} stocks on five pillars — see them on{' '}
          <Link href="/stocks">All Stocks</Link>.
        </p>
      </section>

      <Card title="What carries over — and what does not">
        <p>
          <strong>Carries over from the stock cards:</strong> the Technical score (same
          math, same bands), live price and day change, volume and relative volume, 52-week
          high and low, momentum returns, and fund facts — expense ratio, assets, yield,
          holdings, inception.
        </p>
        <p>
          <strong>Does not apply to ETFs:</strong> fair value, DCF / PEGY / forward-sector
          legs, the valuation ladder, upside, the Conviction, Quality and Trust pillars,
          analyst targets, and any Growth / Value / Avoid verdict. None of those exist for
          a basket of securities, so none of them are shown — and no single score is
          invented to replace them.
        </p>
        <p>
          <strong>No fair value — ETFs have no earnings to value.</strong> The two reads
          below are informational only: they describe where the price has been, not where
          it is going, and they are not a recommendation to buy or sell.
        </p>
      </Card>

      <Card title="The two reads">
        <p>
          <strong>Technical score (0–100)</strong> — the stock engine&apos;s Technical
          pillar, exactly: trend from the EMA 20 / 50 / 200 stack (35%), price vs the
          200-day average (25%), RSI (20%), MACD histogram (20%). Strong ≥ 70, Mixed
          40–69, Weak &lt; 40.
        </p>
        <p>
          <strong>Momentum Score</strong> — 0.5 × 13-week return + 0.3 × 4-week return +
          0.2 × 1-week return, dividends included. Building ≥ +5%, Flat −5% to +5%,
          Fading &lt; −5%. The two reads are never combined into one number.
        </p>
        <p>
          <strong>Types stay distinct.</strong> Equity ({counts.equity}), bond (
          {counts.bond}), commodity ({counts.commodity}) and leveraged ({counts.leveraged})
          funds are badged in different colours and filtered separately. Bond and
          commodity funds behave differently from equity funds, and leveraged funds reset
          their leverage daily — they are flagged and kept out of the shared sort, so a
          leveraged −50% never sits at the top of a list next to an equity −5%.
        </p>
      </Card>

      <Card title={`All ${rows.length} ETFs`}>
        <EtfBrowser rows={rows} priceDate={priceDate} />
        <p className="footnote">
          Prices as of the {priceDate} close unless marked LIVE during market hours (quotes
          delayed ~15 min, TradingView). Technical and Momentum reads are computed from
          that close. Fund facts as of {ETF_FACTS.as_of} (stockanalysis.com). See{' '}
          <Link href="/methodology#etfs">Methodology — ETFs</Link> for the full method.
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
