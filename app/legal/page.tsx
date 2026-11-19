import type { Metadata } from 'next'
import Link from 'next/link'
import { Card } from '@/components/ui'
import { CONTACT_EMAIL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Legal — Copyright & Disclaimers',
  description:
    'Legal notice for The Stock Check: copyright and reproduction restrictions, plus the standard disclaimers — research and education only, not investment advice, valuation context only, data may be delayed or contain errors.',
}

export default function LegalPage() {
  return (
    <>
      <h1>Legal — Copyright &amp; Disclaimers</h1>
      <p className="page-intro">Effective 19 November 2026.</p>

      <Card title="Copyright notice">
        <p>
          © 2026 The Stock Check. All rights reserved. All content on this site — including
          scores, verdicts, fair values, methodology, text, and design — is owned by The Stock
          Check and protected by copyright. Copyright exists from the moment content is
          created; this notice is the site&rsquo;s copyright statement, not a claim of formal
          registration.
        </p>
      </Card>

      <Card title="Reproduction restrictions">
        <p>
          You may not copy, reproduce, republish, scrape, or redistribute any content from
          this site, in whole or in part, in any form, without prior written permission from
          The Stock Check. To request permission, contact{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Card>

      <Card title="Research and education only — not investment advice">
        <p>
          The Stock Check publishes stock research for research and education only. Nothing on
          this site is investment, trading, or financial advice, and nothing here is a
          recommendation, offer, or solicitation to buy or sell any security.
        </p>
      </Card>

      <Card title="Not a stock promotion">
        <p>
          Nothing on this site is a stock promotion. No stock or fund is featured, ranked, or
          highlighted here to encourage buying or selling it.
        </p>
      </Card>

      <Card title="Valuation context only">
        <p>
          Scores, verdicts, fair values and ladder levels — including the words Growth, Value,
          Watch and Avoid — describe our model&rsquo;s read of a stock. They are not instructions
          to trade. The ladder is valuation context, not a buy or sell signal, and no level on
          it tells you to transact.
        </p>
      </Card>

      <Card title="Data may be delayed, incomplete, or inaccurate">
        <p>
          The site is provided as-is, with no warranty of any kind. Data may be delayed,
          incomplete, or inaccurate, and can contain errors. Sources are named on the
          Methodology page so you can check them, and you should verify any figure before
          trading on it. Do your own research and consult a licensed financial advisor before
          making any investment decision.
        </p>
      </Card>

      <Card title="Past performance does not guarantee future results">
        <p>
          Backtests on this site, including the ladder and CAPM-variant backtests in the
          Methodology, describe what happened in the past over the periods tested. Past
          performance does not guarantee future results.
        </p>
      </Card>

      <Card title="No liability">
        <p>
          You use this site at your own risk. We are not liable for any loss arising from use
          of the information here. If you need advice about your own investments, speak to a
          licensed adviser.
        </p>
      </Card>

      <Card title="ETFs — no fair value, no verdict">
        <p>
          ETFs on this site have no fair value and no verdict. An ETF holds a basket of
          securities, not a business, so there are no earnings to value. The Technical and
          Momentum reads shown on ETF cards are informational only — they are not a
          recommendation to buy or sell any fund.
        </p>
      </Card>

      <Card title="Terms of use">
        <p>
          These notices sit alongside the site&rsquo;s <Link href="/terms">Terms</Link>, which
          carry the same position in full. Questions about this page:{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Card>
    </>
  )
}
