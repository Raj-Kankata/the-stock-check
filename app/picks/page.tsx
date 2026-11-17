import type { Metadata } from 'next'
import { getTicker, money, pct } from '@/lib/data'
import { PICKS, PICKS_ENTRY_DATE } from '@/lib/site'
import { Card, signedClass } from '@/components/ui'
import PicksFilter, { type PickRow } from '@/components/PicksFilter'

export const metadata: Metadata = {
  title: 'Top Picks',
  description:
    'The Stock Check Top Picks: the scored names, with entry prices and dates frozen at publication on 13 Nov 2026. The full picks list today — four names; a fifth pick, NVO, was removed when its card was unpublished.',
}

export default function PicksPage() {
  const rows: PickRow[] = []
  for (const { symbol, entryPrice } of PICKS) {
    const t = getTicker(symbol)
    if (!t) continue
    const upside = (t.triangulated_fv - entryPrice) / entryPrice
    rows.push({
      symbol,
      name: t.name,
      verdict: t.verdict,
      score: t.overall_score,
      entryPrice: money(entryPrice),
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

      <Card title="Current picks — entry 13 Nov 2026">
        <PicksFilter rows={rows} />
        <p className="footnote">
          Entry prices are the {PICKS_ENTRY_DATE} close — the same prices the scores were computed
          on. Upside vs entry is the fair value against the frozen entry price. Fair values and
          verdicts are from engine v1.3.
        </p>
      </Card>

      <Card title="What this list is — and what it is not">
        <p>
          The Top 20 is 20 value names and 20 growth names drawn from the S&amp;P 500 and S&amp;P
          400 universe — and it expands as more names are scored. These four are the picks as
          published on 13 Nov 2026. A fifth pick, NVO, was published with them and has since
          been removed: its card is unpublished now that the site covers only three-leg names
          (its fair value rested on two legs after its DCF leg was skipped). Its frozen entry
          price, $41.63 on 13 Nov 2026, is recorded here for the audit trail. The scored
          universe has since grown to 227 names, and this list grows toward the full Top 20 as
          more names are scored — but this is the full picks list today, not a teaser: there
          are no further picks held back behind a sign-in or a paywall.
        </p>
        <p>
          As more names are run through the engine, this list grows toward the full Top 20. A name
          appears here because it was scored by the published rules — the verdict, score, fair
          value and upside are all shown above, and the full workings are on each stock&apos;s card.
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
