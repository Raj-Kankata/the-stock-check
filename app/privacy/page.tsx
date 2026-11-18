import type { Metadata } from 'next'
import { Card } from '@/components/ui'
import { CONTACT_EMAIL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Privacy policy for The Stock Check: no account, no sign-in, no cookies, no personal data collected. Anonymous page-view stats (Cloudflare) and anonymous search counts only.',
}

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="page-intro">
        Effective 18 November 2026. Short version: this site collects nothing about you that
        can identify you.
      </p>

      <Card title="No account, no sign-in">
        <p>
          There is no account system and no sign-in. You can read every page without telling us
          who you are.
        </p>
      </Card>

      <Card title="Anonymous stats, no cookies">
        <p>
          Two anonymous counts run on this site, and nothing else. Cloudflare Web Analytics
          records page views — which pages are read, how many visitors, and roughly where they
          come from — with no cookies, no fingerprinting and no personal data. A small search
          log records the ticker searches typed into the search box — the query and the ticker
          picked, or that nothing matched — in aggregate only, so we can see what visitors
          look for. Neither count collects your name, email, IP address, device details or
          anything else about you, and neither is used to identify or follow any visitor.
          Your browser sends its usual technical headers with any web request; we do not store
          them.
        </p>
      </Card>

      <Card title="No personal data collected">
        <p>
          The site collects no personal data. The two anonymous counts above store no IP
          address, no user-agent string, no cookies and nothing that identifies a visitor;
          the search log stores only the query text and the ticker picked. No data is sold or
          shared with anyone.
        </p>
      </Card>

      <Card title="Contact">
        <p>
          The only personal data the site ever sees is what you choose to put in an email to{' '}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. If you write in, your email
          is used only to reply to you.
        </p>
      </Card>

      <Card title="Changes to this policy">
        <p>
          If anything on this page ever changes — if the site starts collecting anything more,
          using accounts, or adding anything that identifies visitors — this policy will be
          updated here first, with a new effective date. Last updated 18 November 2026, when
          the two anonymous counts above were added. Until then, the policy above is the whole
          of it.
        </p>
      </Card>
    </>
  )
}
