import type { Metadata } from 'next'
import PulsePanels from '@/components/PulsePanels'

export const metadata: Metadata = {
  title: 'Market Pulse',
  description:
    'A macro brief — trend, breadth, volatility, credit, internals and macro regime. Market panels refresh live during market hours (09:30–16:00 ET) and show the last close after hours; credit and macro refresh nightly (~05:20 UTC) from FRED.',
}

export default function PulsePage() {
  return (
    <>
      <h1>Market Pulse</h1>
      <p className="page-intro">
        A macro brief in six panels — trend, breadth, volatility, credit,
        internals and macro regime. Every panel prints the rule behind its
        label, its source and its as-of date. Market panels go live during
        market hours and show the last close after hours; credit and macro
        refresh nightly from FRED.
      </p>

      <PulsePanels />

      <p className="footnote">
        Market Pulse is research, not a recommendation. Nothing on this
        page is investment advice.
      </p>
    </>
  )
}
