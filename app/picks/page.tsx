import type { Metadata } from 'next'
import { getTicker, money, pct } from '@/lib/data'
import { PICKS, PICKS_ENTRY_DATE, PICKS_NEW_ENTRY_DATE } from '@/lib/site'
import { Card, signedClass } from '@/components/ui'
import PicksFilter, { type PickRow } from '@/components/PicksFilter'

export function generateMetadata(): Metadata {
  const launch = PICKS.filter((p) => p.cohort === 'launch').length
  const fresh = PICKS.filter((p) => p.cohort === 'new').length
  return {
    title: 'Top Picks',
    description: `The Stock Check Top Picks: ${launch + fresh} scored names — ${launch} launch picks entered 13 Nov 2026 and ${fresh} new picks entered 16 Nov 2026 — with entry prices frozen at publication. A fifth pick, NVO, was removed when its card was unpublished.`,
  }
}

export default function PicksPage() {
  const rows: PickRow[] = []
  // Frozen cohorts only — the daily picks (cohort 'daily') are tracked
  // on /performance, never on this list.
  for (const { symbol, entryPrice, cohort, entryDate } of PICKS) {
    if (cohort === 'daily') continue
    const t = getTicker(symbol)
    if (!t) continue
    const upside = (t.triangulated_fv - entryPrice) / entryPrice
    rows.push({
      symbol,
      name: t.name,
      verdict: t.verdict,
      score: t.overall_score,
      entryPrice: money(entryPrice),
      cohort,
      entryDate,
      fairValue: money(t.triangulated_fv),
      upside: pct(upside),
      upsideClass: signedClass(upside, 0.001),
    })
  }

  return (
    <>
      <h1>Top Picks</h1>
      <p className="page-intro">
        Our picks, published monthly. Entry prices and dates are frozen at publication and never
        restated — so every pick can be tracked honestly against the price it was picked at.
      </p>

      <Card title="Current picks — entered 13 Nov and 16 Nov 2026">
        <PicksFilter rows={rows} />
        <p className="footnote">
          Entry prices are the close on each pick&apos;s entry date — {PICKS_ENTRY_DATE} for the
          launch cohort, {PICKS_NEW_ENTRY_DATE} for the new cohort — the same prices the scores
          were computed on. Upside vs entry is the fair value against the frozen entry price.
          Fair values and verdicts are from engine v1.5.
        </p>
      </Card>

      <Card title="What this list is — and what it is not">
        <p>
          The picks are the four launch names plus the top five Growth and top five Value names
          as of the 16 Nov 2026 close. The list is frozen at publication and changes only when
          a new decision is made — names are never rotated in automatically. A fifth pick, NVO,
          was published with the launch names and has since been removed: its card is
          unpublished now that the site covers only three-leg names (its fair value rested on
          two legs after its DCF leg was skipped). Its frozen entry price, $41.63 on 13 Nov
          2026, is recorded here for the audit trail. This is the full picks list today, not a
          teaser: there are no further picks held back behind a sign-in or a paywall.
        </p>
        <p>
          A name appears here because it was scored by the published rules — the verdict, score,
          fair value and upside are all shown above, and the full workings are on each
          stock&apos;s card.
        </p>
        <p className="footnote">
          Picks are research, not recommendations. Nothing on this page is investment advice — see
          the Performance page for how these picks are tracked, and the Methodology page for the
          scoring rules.
        </p>
      </Card>
    </>
  )
}
