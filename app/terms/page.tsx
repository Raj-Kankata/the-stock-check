import type { Metadata } from 'next'
import { Card } from '@/components/ui'
import { CONTACT_EMAIL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Terms',
  description:
    'Terms for The Stock Check: research and education only, not investment advice, no warranty, fair values are model estimates, use at your own risk.',
}

export default function TermsPage() {
  return (
    <>
      <h1>Terms</h1>
      <p className="page-intro">Effective 16 November 2026.</p>

      <Card title="Research and education only">
        <p>
          The Stock Check publishes stock research for research and education only. Nothing on
          this site is investment advice, and nothing here is a recommendation to buy or sell any
          security.
        </p>
      </Card>

      <Card title="Not a recommendation">
        <p>
          Scores, verdicts, fair values and ladder levels — including the words Growth, Value,
          Watch and Avoid — describe our model&rsquo;s read of a stock. They are not instructions
          to trade. The ladder is valuation context, not a buy or sell signal, and no level on
          it tells you to transact.
        </p>
      </Card>

      <Card title="No warranty — data may be delayed or contain errors">
        <p>
          The site is provided as-is, with no warranty of any kind. Data may be delayed and can
          contain errors. Sources are named on the Methodology page so you can check them, and
          you should verify any figure before trading on it.
        </p>
      </Card>

      <Card title="Fair values are model estimates, not predictions">
        <p>
          Every fair value is a model estimate built from stated assumptions — a discount rate,
          a growth cap, a sector multiple — not a prediction of where a price will go. The
          assumptions are published in the Methodology; the estimate is only as good as them.
        </p>
      </Card>

      <Card title="Past performance does not guarantee future results">
        <p>
          Backtests on this site, including the ladder and CAPM-variant backtests in the
          Methodology, describe what happened in the past over the periods tested. Past
          performance does not guarantee future results.
        </p>
      </Card>

      <Card title="Use at your own risk">
        <p>
          You use this site at your own risk. We are not liable for any loss arising from use of
          the information here. If you need advice about your own investments, speak to a
          licensed adviser.
        </p>
      </Card>

      <Card title="Contact">
        <p>
          Questions about these terms: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Card>
    </>
  )
}
