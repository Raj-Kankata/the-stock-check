import type { Metadata } from 'next'
import Link from 'next/link'
import { RESULTS } from '@/lib/data'
import { ETF_RESULTS } from '@/lib/etf-data'
import { INDEX_RESULTS } from '@/lib/index-data'
import { allIndexRows } from '@/lib/public'
import { Card } from '@/components/ui'
import IndexBrowser from '@/components/IndexBrowser'

export function generateMetadata(): Metadata {
  return {
    title: 'Check any index before you trade',
    description: `${INDEX_RESULTS.universe_count} major indexes, two honest reads each: a Technical score and a Momentum Score — except the VIX, which is a regime, not a trend. No fair value, no verdict. Free, no sign-in.`,
  }
}

export default function IndexesPage() {
  const rows = allIndexRows()
  const priceDate = INDEX_RESULTS.price_date
  const counts = { broad: 0, sector: 0, volatility: 0 } as Record<string, number>
  for (const r of rows) counts[r.type] += 1

  return (
    <>
      <section className="hero-band">
        <p className="hero-eyebrow">Technical · Momentum · No fair value</p>
        <h1>Check any index before you trade.</h1>
        <p className="hero-tagline">Two reads. No invented value.</p>
        <p className="hero-intro">
          {rows.length} major indexes, each with two reads: a Technical score from the price
          chart and a Momentum Score from recent returns. An index is a benchmark, not a
          business — it has no earnings to value, so this board never shows a fair value, a
          verdict, or an overall score. What it shows is what can actually be measured. The
          VIX is the exception: it measures expected volatility, not a price, so it gets a
          regime read instead of scores. We also score{' '}
          {Object.keys(RESULTS.tickers).length} stocks on five pillars — see them on{' '}
          <Link href="/stocks">All Stocks</Link> — and track {ETF_RESULTS.universe_count}{' '}
          ETFs on <Link href="/etfs">the ETF board</Link>.
        </p>
      </section>

      <Card title="What carries over — and what does not">
        <p>
          <strong>Carries over from the stock cards:</strong> the Technical score (same
          math, same bands), live level and day change, 52-week high and low, and momentum
          returns.
        </p>
        <p>
          <strong>Does not apply to indexes:</strong> fair value, DCF / PEGY / forward-sector
          legs, the valuation ladder, upside, the Conviction, Quality and Trust pillars,
          analyst targets, holdings, expense ratio, assets, yield, and any Growth / Value /
          Avoid verdict. None of those exist for a benchmark, so none of them are shown —
          and no single score is invented to replace them.
        </p>
        <p>
          <strong>No fair value — indexes have no earnings to value.</strong> The two reads
          below are informational only: they describe where the level has been, not where
          it is going, and they are not a recommendation to buy or sell.
        </p>
      </Card>

      <Card title="The two reads — and the VIX exception">
        <p>
          <strong>Technical score (0–100)</strong> — the stock engine&apos;s Technical
          pillar, exactly: trend from the EMA 20 / 50 / 200 stack (35%), level vs the
          200-day average (25%), RSI (20%), MACD histogram (20%). Strong ≥ 70, Mixed
          40–69, Weak &lt; 40.
        </p>
        <p>
          <strong>Momentum Score</strong> — 0.5 × 13-week return + 0.3 × 4-week return +
          0.2 × 1-week return. Building ≥ +5%, Flat −5% to +5%, Fading &lt; −5%. The two
          reads are never combined into one number.
        </p>
        <p>
          <strong>VIX is not scored.</strong> Scored like a price, a spiking VIX would read
          &quot;Strong&quot; — exactly backwards. So the VIX gets a regime read instead:
          Calm below 15, Normal 15–20, Elevated 20–30, High 30–40, Extreme above 40 — the
          same bands as the Volatility panel on <Link href="/pulse">Market Pulse</Link> —
          plus VIX3M, the VIX/VIX3M ratio and curve state, and the expected daily S&amp;P
          500 move (VIX ÷ √252). It sits in its own Volatility section, never in the
          shared momentum sort.
        </p>
        <p>
          <strong>Types stay distinct.</strong> Broad market ({counts.broad}), sector (
          {counts.sector}) and volatility ({counts.volatility}) indexes are badged in
          different colours and filtered separately.
        </p>
      </Card>

      <Card title={`All ${rows.length} indexes`}>
        <IndexBrowser rows={rows} priceDate={priceDate} />
        <p className="footnote">
          Levels as of the {priceDate} close unless marked LIVE during market hours (levels
          delayed ~15 min, TradingView). Technical and Momentum reads are computed from
          that close. See <Link href="/methodology#indexes">Methodology — Indexes</Link>{' '}
          for the full method.
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
