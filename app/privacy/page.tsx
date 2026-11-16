import type { Metadata } from 'next'
import { Card } from '@/components/ui'
import { CONTACT_EMAIL } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Privacy policy for The Stock Check: no account, no sign-in, no tracking, no analytics, no cookies, no personal data collected.',
}

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p className="page-intro">
        Effective 16 November 2026. Short version: this site collects nothing about you.
      </p>

      <Card title="No account, no sign-in">
        <p>
          There is no account system and no sign-in. You can read every page without telling us
          who you are.
        </p>
      </Card>

      <Card title="No tracking, no analytics, no cookies">
        <p>
          The site runs no tracking, no analytics and no cookies. We do not count your visits,
          fingerprint your browser, or record which pages you read.
        </p>
      </Card>

      <Card title="No personal data collected">
        <p>
          The site is a set of static pages. It collects no personal data, stores nothing about
          its visitors, and has nothing to leak, sell or share. No data is sold or shared with
          anyone, because no data is collected in the first place.
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
          If anything on this page ever changes — if the site starts collecting anything, using
          analytics, or adding accounts — this policy will be updated here first, with a new
          effective date. Until then, the policy above is the whole of it.
        </p>
      </Card>
    </>
  )
}
