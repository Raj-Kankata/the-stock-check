/**
 * Anonymous usage stats for The Stock Check.
 *
 * Two counts, nothing else:
 * - Cloudflare Web Analytics (page views, cookieless) — enabled by the
 *   beacon token below, rendered by the root layout only when set.
 * - A custom search log (Cloudflare Worker + D1) — the search box POSTs
 *   only the query text and the ticker picked (or null for a no-result
 *   search). No IP, no user agent, no cookies, no personal data of any
 *   kind is sent or stored. See workers/search-log/ for the Worker.
 *
 * Both constants are EMPTY until the Cloudflare deploy is done: the
 * Worker's workers.dev URL and the Web Analytics beacon token come from
 * Raj's Cloudflare dashboard. While either is empty, that half of the
 * stats simply does not run — logSearch() no-ops and the layout renders
 * no beacon. Nothing is ever sent to a half-configured endpoint.
 */

export const SEARCH_LOG_URL: string = 'https://stockcheck-search-log.thestockcheck.workers.dev/log'

export const CF_BEACON_TOKEN: string = '25d44bebf2da4239ae5699937581f2d4'

/** True once either stats half has been configured. Drives the footer line. */
export const ANALYTICS_ENABLED = SEARCH_LOG_URL !== '' || CF_BEACON_TOKEN !== ''

const MAX_QUERY_LEN = 20

/**
 * Fire-and-forget search log. Never blocks navigation, never throws,
 * never retries. One call per selection / per no-result query — never
 * per keystroke (callers own that).
 */
export function logSearch(args: { query: string; ticker: string | null }): void {
  if (SEARCH_LOG_URL === '') return
  const query = args.query.trim().toUpperCase().slice(0, MAX_QUERY_LEN)
  if (query.length === 0) return
  const ticker = args.ticker === null ? null : args.ticker.trim().toUpperCase().slice(0, 12)
  try {
    const body = JSON.stringify({ query, ticker })
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(2000)
        : undefined
    void fetch(SEARCH_LOG_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      ...(signal === undefined ? {} : { signal }),
    }).catch(() => undefined)
  } catch {
    // Analytics must never break the page.
  }
}
