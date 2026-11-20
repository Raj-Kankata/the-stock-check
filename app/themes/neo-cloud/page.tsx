import type { Metadata } from 'next'
import { Card } from '@/components/ui'
import { LiveThemeRows, ThemeLiveStatusLine } from '@/components/ThemeLive'
import { dateLabel } from '@/lib/format'
import { allThemeRows } from '@/lib/public'
import { THEME_RESULTS } from '@/lib/theme-data'

export const metadata: Metadata = {
  title: 'Neo-cloud theme · The Stock Check',
  description:
    'Eight neo-clouds renting out GPU compute for AI work, plus Oracle as the hyperscaler comparison — the price, the year so far, and the run since the first trade. A theme is a grouping, not a check.',
}

export default function NeoCloudPage() {
  const rows = allThemeRows()
  const priceDate = dateLabel(THEME_RESULTS.price_date)
  const scored = rows.filter((r) => r.has_card)
  const scoredNames = scored.map((r) => r.symbol).join(', ')
  return (
    <main>
      <header className="hero">
        <p className="eyebrow">Themes — the first theme board</p>
        <h1>Neo-cloud</h1>
        <p className="subhead">
          Eight companies renting out GPU compute for AI work, plus Oracle as the
          hyperscaler comparison — the price, the year so far, and the run since the
          first trade. A theme is a grouping, not a check: only {scoredNames} has a
          scored card.
        </p>
        <ThemeLiveStatusLine priceDateLabel={priceDate} />
      </header>

      <Card title={`Neo-cloud — ${rows.length} names`}>
        <table className="tabled">
          <thead>
            <tr>
              <th>Company</th>
              <th className="num">Price</th>
              <th className="num">YTD</th>
              <th className="num">Since first trade</th>
              <th>First trade</th>
              <th className="num">Score</th>
              <th>Verdict</th>
            </tr>
          </thead>
          <tbody>
            <LiveThemeRows rows={rows} />
          </tbody>
        </table>
        <p className="footnote">
          Prices as of the {priceDate} close (live in market hours). YTD is the move
          since the Dec 31, 2025 close; Since first trade is the move since the
          first-trade close in the First trade column — the baselines are frozen and
          listed there. Scores and verdicts appear only where a scored card exists
          ({scoredNames}); the other members have no score, fair value or verdict.
        </p>
      </Card>

      <Card title="What is a neo-cloud?">
        <p>
          A neo-cloud rents out GPU compute for AI work — data-centre capacity sold by
          the hour, mostly to AI labs and startups — instead of selling software. The
          eight names above are the pure-play group: Nebius, CoreWeave, IREN, Cipher
          Mining, Applied Digital, Hut 8, Core Scientific and TeraWulf. Oracle is
          the hyperscaler comparison — a full cloud vendor, labelled as such, not a
          neo-cloud.
        </p>
      </Card>

      <Card title="How to read this board">
        <ul>
          <li>
            &ldquo;YTD&rdquo; is the move from the last close of 2025 to the baked close —
            the 2026 year so far, not a twelve-month return.
          </li>
          <li>
            &ldquo;Since first trade&rdquo; is the move from the name&apos;s first-trade close
            to the baked close. The baselines are frozen in the First trade column and
            verified one by one: Nebius resumed trading Oct 21, 2024 at $20.00;
            CoreWeave&apos;s IPO Mar 28, 2025 at $40.00; IREN&apos;s IPO Nov 17, 2021;
            Cipher Mining&apos;s first day under the CIFR ticker Aug 30, 2021 (the
            GWAC merger closed Aug 27); Applied Digital&apos;s IPO Apr 13, 2022; Hut
            8&apos;s Nasdaq listing Jun 15, 2021 (it traded on the TSX before);
            Core Scientific&apos;s relisting Jan 24, 2024; TeraWulf&apos;s first day
            under the WULF ticker Dec 14, 2021 (the IKONICS merger closed Dec 13);
            Oracle&apos;s IPO Mar 12, 1986. No baseline is ever recomputed — only the
            price moves.
          </li>
          <li>
            Oracle&apos;s first close is split-adjusted ($0.06), so its since-first-trade
            figure is a 40-year split-adjusted return — not comparable to the
            neo-clouds&apos; short histories.
          </li>
          <li>
            A ticker links to its scored card where one exists ({scoredNames}), to its
            IPO dossier where only a dossier exists, and nowhere where there is
            neither — those rows say &ldquo;No scored card yet&rdquo;.
          </li>
          <li>
            A theme grouping is not a recommendation. The members were chosen because
            they rent out GPU compute; the board says nothing about whether any of
            them is a good business at today&apos;s price.
          </li>
        </ul>
      </Card>

      <Card title="Disclaimer">
        <p>
          This board is research and education only, not investment advice. It carries
          no score, fair value or verdict of its own — and it is not a recommendation
          to buy, hold or sell. Prices are delayed ~15 min when live and are otherwise
          the {priceDate} close. Data may be delayed or inaccurate. See the{' '}
          <a href="/legal">Legal</a> page.
        </p>
      </Card>
    </main>
  )
}
