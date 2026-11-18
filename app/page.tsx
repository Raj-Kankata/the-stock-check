import type { Metadata } from 'next'
import Link from 'next/link'
import { RESULTS, TICKER_SYMBOLS, getTicker, money, pct } from '@/lib/data'
import { allGrids, toStockRow } from '@/lib/public'
import { ENGINE_VERSION } from '@/lib/site'
import {
  Card,
  StockTableHead,
  scoreSpan,
  signedPctSpan,
} from '@/components/ui'
import GridPreview from '@/components/GridPreview'
import HomeTiles from '@/components/HomeTiles'
import { LiveStatusLine, LiveStockRows } from '@/components/LivePrice'

export const metadata: Metadata = {
  title: 'Check any stock before you buy',
  description:
    'A free, deterministic, rules-based stock research tool. Five pillar scores, a fair value built from three angles, and the workings shown on every stock card. No sign-in. Anonymous usage stats only.',
}

type Verdict = 'Growth' | 'Value' | 'Watch' | 'Avoid'

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function upside(t: { triangulated_fv: number; price: number }): number {
  return (t.triangulated_fv - t.price) / t.price
}

export default function HomePage() {
  const nvda = getTicker('NVDA')
  const legs = nvda?.pillars.valuation.detail.legs
  const legSpread = nvda?.pillars.valuation.detail.leg_spread_div_fv

  const entries = TICKER_SYMBOLS.map((symbol) => ({ symbol, t: getTicker(symbol)! })).filter(
    (e) => e.t,
  )
  const total = entries.length

  const verdictCounts: Record<Verdict, number> = { Growth: 0, Value: 0, Watch: 0, Avoid: 0 }
  for (const { t } of entries) verdictCounts[t.verdict] += 1

  const belowFv = entries.filter(({ t }) => t.triangulated_fv > t.price).length
  const medianUpside = median(entries.map(({ t }) => upside(t)))

  const topByVerdict = (verdict: Verdict, n = 5) =>
    entries
      .filter(({ t }) => t.verdict === verdict)
      .sort((a, b) => b.t.overall_score - a.t.overall_score)
      .slice(0, n)

  const furthestBelowFv = [...entries]
    .sort((a, b) => upside(b.t) - upside(a.t))
    .slice(0, 5)

  // Spotlight: the single highest overall score across the whole
  // scored universe, computed live — the featured name.
  const spotlight = [...entries].sort((a, b) => b.t.overall_score - a.t.overall_score)[0]

  const sectorGroups = new Map<string, number[]>()
  for (const { t } of entries) {
    const scores = sectorGroups.get(t.sector) ?? []
    scores.push(t.overall_score)
    sectorGroups.set(t.sector, scores)
  }
  const sectors = [...sectorGroups.entries()]
    .map(([sector, scores]) => ({
      sector,
      count: scores.length,
      medianScore: median(scores),
    }))
    .sort((a, b) => b.count - a.count)

  // The Stock Check vs Wall Street: largest absolute gap between our triangulated fair
  // value and the analyst consensus mean target. GUARD: tickers with a
  // non-positive fair value are excluded — e.g. BYND's fair value is
  // negative, so its gap vs consensus (~-693%) is an artefact of dividing
  // by a small positive target from a negative fair value, not a signal.
  const usVsWallStreet = entries
    .filter(({ t }) => t.triangulated_fv > 0 && t.analysts && t.analysts.target_mean > 0)
    .map(({ symbol, t }) => ({
      symbol,
      t,
      gap: (t.triangulated_fv - t.analysts!.target_mean) / t.analysts!.target_mean,
    }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, 5)

  const mix: { verdict: Verdict; count: number; cls: string }[] = [
    { verdict: 'Growth', count: verdictCounts.Growth, cls: 'growth' },
    { verdict: 'Value', count: verdictCounts.Value, cls: 'value' },
    { verdict: 'Watch', count: verdictCounts.Watch, cls: 'watch' },
    { verdict: 'Avoid', count: verdictCounts.Avoid, cls: 'avoid' },
  ]

  // Compact per-ticker fair values for the live tile recompute (the
  // Below-fair-value and Median-upside tiles follow the live price).
  const tileFvs = entries.map(({ symbol, t }) => ({ symbol, fv: t.triangulated_fv }))

  return (
    <>
      <section className="hero-band">
        <p className="hero-eyebrow">Five pillars · Fair value</p>
        <h1>Check any stock before you buy.</h1>
        <p className="hero-tagline">Five pillars. One honest check.</p>
        <p className="hero-intro">
          A free research tool that scores {total} stocks on five pillars and works out a fair
          value for each. Every card shows the score, the verdict, the fair value against
          today&apos;s price, and how it compares with Wall Street&apos;s targets — with live
          prices during market hours, plus trending movers, sector rotation, and a market
          pulse.
        </p>
      </section>

      <Card title="Spotlight — highest overall score">
        <LiveStatusLine priceDateLabel={RESULTS.price_date} />
        <table>
          <thead>
            <StockTableHead />
          </thead>
          <tbody>
            <LiveStockRows rows={[toStockRow(spotlight.symbol, spotlight.t)]} />
          </tbody>
        </table>
        <p className="footnote">
          The highest overall score of the {total} scored names. The price is live during
          market hours and the {RESULTS.price_date} close after hours. One name, featured — the
          full ranked lists are below.
        </p>
      </Card>

      <HomeTiles
        total={total}
        verdictCounts={verdictCounts}
        belowFv={belowFv}
        medianUpside={medianUpside}
        priceDate={RESULTS.price_date}
        fvs={tileFvs}
        avCoverage={RESULTS.av_earnings_coverage}
      />

      <Card title="Verdict mix">
        <div className="mixbar" role="list">
          {mix.map((m) => (
            <Link
              key={m.verdict}
              href={`/stocks?verdict=${m.verdict}`}
              role="listitem"
              className={`mix-seg ${m.cls}`}
              style={{ width: `${(m.count / total) * 100}%` }}
              title={`${m.verdict}: ${m.count} of ${total}`}
            >
              {m.verdict} {m.count}
            </Link>
          ))}
        </div>
        <p className="footnote">
          {total} names scored so far; prices are the {RESULTS.price_date} close unless marked
          LIVE during market hours. The scored universe expands as more names are run through the
          engine; no score is ever guessed for an unscored ticker.
        </p>
      </Card>

      <Card title="Try the fair-value grid">
        <p>
          The grid shows what a stock&apos;s DCF fair value would be under different
          assumptions. Each row is a different growth assumption; each column is a
          different risk-free rate. Tap any cell to see its value —
          the headline above the grid follows your pick, and the highlighted cell is
          that stock&apos;s own published DCF value.
        </p>
        <GridPreview grids={allGrids()} />
      </Card>

      <div className="two-col">
        <Card title="Top Growth">
          <table>
            <thead>
              <StockTableHead />
            </thead>
            <tbody>
              <LiveStockRows
                rows={topByVerdict('Growth').map(({ symbol, t }) => toStockRow(symbol, t))}
              />
            </tbody>
          </table>
          <p>
            <Link href="/stocks?verdict=Growth&sort=score">See all Growth names →</Link>
          </p>
        </Card>

        <Card title="Top Value">
          <table>
            <thead>
              <StockTableHead />
            </thead>
            <tbody>
              <LiveStockRows
                rows={topByVerdict('Value').map(({ symbol, t }) => toStockRow(symbol, t))}
              />
            </tbody>
          </table>
          <p>
            <Link href="/stocks?verdict=Value&sort=score">See all Value names →</Link>
          </p>
        </Card>
      </div>

      <Card title="Furthest below fair value">
        <p>
          The names whose price sits furthest under our fair value. This is valuation context,
          not a buy signal: backtests on 5 tickers and on the full 749-name universe found the
          ladder does not separate forward returns (see Methodology). No level on this list is an
          instruction to buy or sell.
        </p>
        <table>
          <thead>
            <StockTableHead />
          </thead>
          <tbody>
            <LiveStockRows
              rows={furthestBelowFv.map(({ symbol, t }) => toStockRow(symbol, t))}
            />
          </tbody>
        </table>
        <p>
          <Link href="/stocks?sort=upside">See all names by upside →</Link>
        </p>
        <p className="footnote">
          Upside is (fair value − price) / price. The list is ranked on the {RESULTS.price_date}{' '}
          close; the prices shown are live during market hours.
        </p>
      </Card>

      <Card title="Sectors at a glance">
        <table>
          <thead>
            <tr>
              <th>Sector</th>
              <th className="num">Names</th>
              <th className="num">Median score</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((s) => (
              <tr key={s.sector}>
                <td>
                  <Link href={`/stocks?sector=${encodeURIComponent(s.sector)}`}>
                    <strong>{s.sector}</strong>
                  </Link>
                </td>
                <td className="num">{s.count}</td>
                <td className="num">{scoreSpan(s.medianScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">
          Median score is the median overall score of the scored names in that sector.
        </p>
        <p>
          <Link href="/sectors">Rotation formulas and calculator →</Link>
        </p>
      </Card>

      <Card title="The Stock Check vs Wall Street">
        <p>
          Our fair value against the analyst consensus mean target — the names
          where our number and Wall Street&apos;s disagree most.
        </p>
        <table>
          <thead>
            <tr>
              <th>Stock</th>
              <th className="num">Our fair value</th>
              <th className="num">Consensus mean</th>
              <th className="num">Gap</th>
            </tr>
          </thead>
          <tbody>
            {usVsWallStreet.map(({ symbol, t, gap }) => (
              <tr key={symbol}>
                <td>
                  <Link href={`/stock/${symbol}`}>
                    <strong>{symbol}</strong>
                  </Link>
                  <br />
                  <span className="footnote">{t.name}</span>
                </td>
                <td className="num">{money(t.triangulated_fv)}</td>
                <td className="num">{money(t.analysts!.target_mean)}</td>
                <td className="num">{signedPctSpan(gap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="footnote">
          Gap is (our fair value − consensus mean) / consensus mean. Names with a
          non-positive fair value are excluded. See each stock&apos;s card for the full
          comparison.
        </p>
      </Card>

      <Card title="What you get">
        <p>Every scored stock gets the same treatment:</p>
        <ul>
          <li>
            <strong>Conviction</strong> — whether the business itself is worth following: its
            story and its financials both getting better.
          </li>
          <li>
            <strong>Valuation</strong> — how the price compares with our fair value: the
            further the price sits below fair value, the higher the score.
          </li>
          <li>
            <strong>Quality / Forensics</strong> — whether reported profits are real: backed
            by cash actually coming in, customers paying what they owe, and borrowing kept
            in check.
          </li>
          <li>
            <strong>Technical / Timing</strong> — whether now looks like a good moment to act,
            from the price chart alone.
          </li>
          <li>
            <strong>Trust</strong> — how much we can rely on the numbers behind the other
            pillars: complete data, analysts broadly agreeing, and insiders not all selling.
          </li>
        </ul>
        <p>
          The five pillar scores combine into one overall score (0–100) and a verdict: Growth,
          Value, Watch or Avoid. The overall score is a summary, not a recommendation — read the
          pillars and the fair value before deciding anything.
        </p>
        <p>
          <strong>Fair value.</strong> The fair value combines three independent angles — a
          5-year DCF, a PEGY value, and a forward-sector value — not any single
          model&apos;s answer. The spread between the highest and lowest is published on every
          stock card, so you can see how much the three angles agree or disagree.
        </p>
        {legs && nvda && (
          <p>
            Example — NVDA: DCF {money(legs.dcf.value)}, PEGY {money(legs.pegy.value)},
            forward-sector {money(legs.forward_sector.value)}; fair value{' '}
            {money(nvda.triangulated_fv)}
            {legSpread !== undefined && legSpread !== null
              ? `, leg spread ${pct(legSpread, 1, false)} of fair value`
              : ''}
            .
          </p>
        )}
        <p>
          <strong>Ladder as valuation context.</strong> Each stock card also shows a ladder of
          price levels around the fair value — where the price sits against the fair-value
          estimate. The ladder is valuation context, not a buy or sell signal: backtests on 5
          tickers and on the full 749-name universe found the ladder does not separate forward
          returns.
        </p>
        <p>
          <Link href="/methodology">Full methodology →</Link>
        </p>
      </Card>

      <Card title="Disclaimer" accent="amber">
        <p>
          The Stock Check is a free research tool for research and education only. It is not
          investment advice, and nothing on this site is a recommendation to buy or sell any
          security.
        </p>
        <p>
          Prices are as of the {RESULTS.price_date} close unless marked LIVE during market hours
          (quotes delayed ~15 min, TradingView). Scores and fair values come from {ENGINE_VERSION}.
          Data may be delayed and can contain errors — verify before trading. Past performance does not guarantee future results.
        </p>
      </Card>

      <p className="footnote">
        Engine: {ENGINE_VERSION} · Prices as of {RESULTS.price_date} unless marked LIVE · Scores as of{' '}
        {RESULTS.as_of}
      </p>
    </>
  )
}
