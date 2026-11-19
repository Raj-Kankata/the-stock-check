'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { money } from '@/lib/format'
import type { PublicSearchEntry } from '@/lib/public-types'
import { scoreSpan } from '@/components/ui'
import { logSearch } from '@/lib/analytics'

/**
 * Ticker search. Only the 382 scored tickers resolve to a card.
 * Anything else says so plainly — never a guessed score.
 * The search index (symbol, name, verdict, score, fair value) is
 * passed in from the layout at build time; this component never
 * imports the full results data.
 */
export default function SearchBox({ entries }: { entries: PublicSearchEntry[] }) {
  const [q, setQ] = useState('')
  const query = q.trim().toUpperCase()
  // Prefix match on the ticker AND on the company name, so TESLA finds
  // TSLA and APPLE finds AAPL. Both sides are normalised the same way
  // (upper-cased, non-alphanumerics stripped), so "Tesla, Inc." matches
  // TESLA and "Advance Auto Parts" matches ADVANCEAUTO. Ticker-prefix
  // matches rank first, then name-only matches; each group sorts by
  // symbol, as before.
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const nq = norm(query)
  const matches =
    nq.length === 0
      ? []
      : entries
          .filter((e) => norm(e.symbol).startsWith(nq) || norm(e.name).startsWith(nq))
          .sort((a, b) => {
            const aSym = norm(a.symbol).startsWith(nq) ? 0 : 1
            const bSym = norm(b.symbol).startsWith(nq) ? 0 : 1
            return aSym - bSym || a.symbol.localeCompare(b.symbol)
          })
  const showNotCovered = query.length > 0 && matches.length === 0

  // Anonymous search count (see lib/analytics.ts): one log per distinct
  // no-result query — never per keystroke, never with personal data.
  const loggedNoResult = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (showNotCovered && !loggedNoResult.current.has(query)) {
      loggedNoResult.current.add(query)
      logSearch({ query, ticker: null })
    }
  }, [showNotCovered, query])

  return (
    <div>
      <div className="search-box">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a ticker or company — e.g. NVDA or Tesla"
          aria-label="Search a ticker or company"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => {
            if (matches.length > 0) {
              logSearch({ query, ticker: matches[0].symbol })
              window.location.href = `/stock/${matches[0].symbol}`
            }
          }}
        >
          Check
        </button>
      </div>
      {matches.length > 0 && (
        <ul className="search-results">
          {matches.map((t) => (
            <li key={t.symbol}>
              <Link
                href={`/stock/${t.symbol}`}
                onClick={() => {
                  setQ('')
                  logSearch({ query, ticker: t.symbol })
                }}
              >
                <span>
                  <strong>{t.symbol}</strong> — {t.name}
                </span>
                <span>
                  {t.verdict} · {scoreSpan(t.overall_score)} · {money(t.fv)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {showNotCovered && (
        <p className="footnote">
          “{q.trim()}” is not covered yet. {entries.length} tickers are scored — AAPL,
          AMZN, AVGO, META, MSFT and NVDA among them — use the search above to find a covered
          name. No score is ever guessed for an unscored ticker.
        </p>
      )}
    </div>
  )
}
