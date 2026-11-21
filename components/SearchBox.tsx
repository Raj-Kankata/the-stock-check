'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { money, pct } from '@/lib/format'
import type {
  PublicEtfSearchEntry,
  PublicIndexSearchEntry,
  PublicIpoSearchEntry,
  PublicSearchEntry,
} from '@/lib/public-types'
import { scoreSpan } from '@/components/ui'
import { logSearch } from '@/lib/analytics'

/**
 * Ticker search. Only the 382 scored tickers resolve to a stock card,
 * only the tracked ETFs resolve to an ETF card, and only the 6
 * tracked indexes resolve to an index card. Anything else says so
 * plainly — never a guessed score.
 * The search indexes (symbol, name, verdict/score/fair value for
 * stocks; symbol, name, type, Technical/Momentum reads for ETFs and
 * indexes) are passed in from the layout at build time; this component
 * never imports the full results data.
 *
 * ETF rows carry an ETF pill and the two ETF reads — never a verdict
 * or a fair value, because ETFs have neither. Index rows carry an
 * INDEX pill and the two reads (or the VIX regime) — never a verdict
 * or a fair value, because indexes have neither. IPO rows carry an
 * IPO pill, the price and the move vs the offer price — never a
 * verdict, a score or a fair value, because a dossier has none.
 */
export default function SearchBox({
  entries,
  etfEntries = [],
  indexEntries = [],
  ipoEntries = [],
}: {
  entries: PublicSearchEntry[]
  etfEntries?: PublicEtfSearchEntry[]
  indexEntries?: PublicIndexSearchEntry[]
  ipoEntries?: PublicIpoSearchEntry[]
}) {
  const [q, setQ] = useState('')
  const query = q.trim().toUpperCase()
  // Prefix match on the ticker AND on the company/fund name, so TESLA finds
  // TSLA and APPLE finds AAPL. Both sides are normalised the same way
  // (upper-cased, non-alphanumerics stripped), so "Tesla, Inc." matches
  // TESLA and "Advance Auto Parts" matches ADVANCEAUTO. Ticker-prefix
  // matches rank first, then name-only matches; each group sorts by
  // symbol, as before. ETFs match the same way and rank after stocks.
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const nqRaw = norm(query)
  // Typo aliases for the misspellings the search log actually shows
  // (APPL is AAPL with two letters swapped — it can never prefix-match
  // AAPL or APPLEINC). An alias applies ONLY when the typed query itself
  // matches nothing in any index, so it can never shadow a real result.
  const TYPO_ALIASES: Record<string, string> = { APPL: 'AAPL' }
  const aliasHit =
    nqRaw.length >= 3 &&
    TYPO_ALIASES[nqRaw] !== undefined &&
    ![...entries, ...etfEntries, ...indexEntries, ...ipoEntries].some(
      (e) =>
        norm(e.symbol).startsWith(nqRaw) || norm(e.name).startsWith(nqRaw),
    )
  const nq = aliasHit ? TYPO_ALIASES[nqRaw] : nqRaw
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
  const etfMatches =
    nq.length === 0
      ? []
      : etfEntries
          .filter((e) => norm(e.symbol).startsWith(nq) || norm(e.name).startsWith(nq))
          .sort((a, b) => {
            const aSym = norm(a.symbol).startsWith(nq) ? 0 : 1
            const bSym = norm(b.symbol).startsWith(nq) ? 0 : 1
            return aSym - bSym || a.symbol.localeCompare(b.symbol)
          })
  const indexMatches =
    nq.length === 0
      ? []
      : indexEntries
          .filter((e) => norm(e.symbol).startsWith(nq) || norm(e.name).startsWith(nq))
          .sort((a, b) => {
            const aSym = norm(a.symbol).startsWith(nq) ? 0 : 1
            const bSym = norm(b.symbol).startsWith(nq) ? 0 : 1
            return aSym - bSym || a.symbol.localeCompare(b.symbol)
          })
  // IPO dossiers match on the ticker AND the company name, the same
  // way — ANT finds Anthropic, COREWEAVE finds CRWV — and rank after
  // stocks, ETFs and indexes.
  const ipoMatches =
    nq.length === 0
      ? []
      : ipoEntries
          .filter(
            (e) =>
              norm(e.symbol).startsWith(nq) ||
              norm(e.name).startsWith(nq) ||
              norm(e.company).startsWith(nq),
          )
          .sort((a, b) => {
            const aSym = norm(a.symbol).startsWith(nq) ? 0 : 1
            const bSym = norm(b.symbol).startsWith(nq) ? 0 : 1
            return aSym - bSym || a.symbol.localeCompare(b.symbol)
          })
  const firstHref =
    matches.length > 0
      ? `/stock/${matches[0].symbol}`
      : etfMatches.length > 0
        ? `/etf/${etfMatches[0].symbol}`
        : indexMatches.length > 0
          ? `/index/${indexMatches[0].symbol}`
          : ipoMatches.length > 0
            ? `/ipo/${ipoMatches[0].symbol}`
            : null
  const firstTicker =
    matches.length > 0
      ? matches[0].symbol
      : etfMatches.length > 0
        ? etfMatches[0].symbol
        : indexMatches.length > 0
          ? indexMatches[0].symbol
          : ipoMatches.length > 0
            ? ipoMatches[0].symbol
            : null
  const showNotCovered =
    query.length > 0 &&
    matches.length === 0 &&
    etfMatches.length === 0 &&
    indexMatches.length === 0 &&
    ipoMatches.length === 0

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
            if (firstHref && firstTicker) {
              logSearch({ query, ticker: firstTicker })
              window.location.href = firstHref
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
      {etfMatches.length > 0 && (
        <ul className="search-results">
          {etfMatches.map((t) => (
            <li key={t.symbol}>
              <Link
                href={`/etf/${t.symbol}`}
                onClick={() => {
                  setQ('')
                  logSearch({ query, ticker: t.symbol })
                }}
              >
                <span>
                  <strong>{t.symbol}</strong> — {t.name}{' '}
                  <span className="pill etf">ETF</span>
                </span>
                <span>
                  Technical {t.technical_score.toFixed(1)} · Mom {pct(t.momentum_score, 1)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {indexMatches.length > 0 && (
        <ul className="search-results">
          {indexMatches.map((t) => (
            <li key={t.symbol}>
              <Link
                href={`/index/${t.symbol}`}
                onClick={() => {
                  setQ('')
                  logSearch({ query, ticker: t.symbol })
                }}
              >
                <span>
                  <strong>{t.symbol}</strong> — {t.name}{' '}
                  <span className="pill index">INDEX</span>
                </span>
                <span>
                  {t.regime !== null
                    ? `VIX regime ${t.regime}`
                    : `Technical ${t.technical_score!.toFixed(1)} · Mom ${pct(t.momentum_score!, 1)}`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {ipoMatches.length > 0 && (
        <ul className="search-results">
          {ipoMatches.map((t) => (
            <li key={t.symbol}>
              <Link
                href={`/ipo/${t.symbol}`}
                onClick={() => {
                  setQ('')
                  logSearch({ query, ticker: t.symbol })
                }}
              >
                <span>
                  <strong>{t.symbol}</strong> — {t.name}{' '}
                  <span className="pill ipo">IPO</span>
                </span>
                <span>
                  {money(t.price)}
                  {t.offer_price !== null
                    ? ` · ${pct(t.price / t.offer_price - 1, 1)} vs offer $${t.offer_price}`
                    : ' · no offer price — resumed listing'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {showNotCovered && (
        <p className="footnote">
          “{q.trim()}” is not covered yet. {entries.length} tickers are scored,{' '}
          {etfEntries.length} ETFs are tracked, {indexEntries.length} indexes are
          tracked and {ipoEntries.length} IPO dossiers are published — AAPL, AMZN, AVGO,
          META, MSFT and NVDA among the stocks, SPY, QQQ and GLD among the ETFs, SPX, NDX
          and VIX among the indexes, ANT, SPCX, CRWV and NBIS among the IPOs — use the search
          above to find a covered name. No score is ever guessed for an unscored ticker,
          and ETFs, indexes and IPOs never carry a fair value or a verdict.
        </p>
      )}
    </div>
  )
}
