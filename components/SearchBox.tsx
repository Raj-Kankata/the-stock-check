'use client'

import Link from 'next/link'
import { useState } from 'react'
import { RESULTS, TICKER_SYMBOLS, money } from '@/lib/data'

/**
 * Ticker search. Only the five scored tickers resolve to a card.
 * Anything else says so plainly — never a guessed score.
 */
export default function SearchBox() {
  const [q, setQ] = useState('')
  const query = q.trim().toUpperCase()
  const matches =
    query.length === 0
      ? []
      : TICKER_SYMBOLS.filter(
          (s) =>
            s.includes(query) ||
            RESULTS.tickers[s].name.toUpperCase().includes(query),
        )
  const showNotCovered = query.length > 0 && matches.length === 0

  return (
    <div>
      <div className="search-box">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a ticker — e.g. NVDA"
          aria-label="Search a ticker"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => {
            if (matches.length > 0) window.location.href = `/stock/${matches[0]}`
          }}
        >
          Check
        </button>
      </div>
      {matches.length > 0 && (
        <ul className="search-results">
          {matches.map((s) => {
            const t = RESULTS.tickers[s]
            return (
              <li key={s}>
                <Link href={`/stock/${s}`}>
                  <span>
                    <strong>{s}</strong> — {t.name}
                  </span>
                  <span>
                    {t.verdict} · {t.overall_score.toFixed(1)} · {money(t.triangulated_fv)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      {showNotCovered && (
        <p className="footnote">
          “{q.trim()}” is not covered yet. Only NVDA, AAPL, MSFT, GOOGL and NVO are scored so
          far — the universe expands as more names are run through the engine. No score is ever
          guessed for an unscored ticker.
        </p>
      )}
    </div>
  )
}
