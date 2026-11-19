// IPO dossier data access for The Stock Check (IPO dossiers, separate data
// product).
//
// SOURCE OF TRUTH: lib/data/ipo_results.json (nightly,
// scripts/ipo_refresh.py) + lib/data/ipo_universe.json (the IPO
// universe — share counts from the prospectuses) +
// lib/data/ipo_dossiers.json (hand-authored dossier content: filing
// financials, calendar, market-says, valuation context — see
// IPO_DOSSIER.md).
//
// IPO dossiers have NO fair value, NO verdict, NO overall score and
// NO pillar scores — see IPO_DOSSIER.md. What they have: the tape
// (live/baked price, change vs the offer price, volume, market caps),
// the IPO facts, the filing financials, the calendar, what the market
// is saying (attributed speculation, fenced), valuation context
// (arithmetic only), and the path to a full five-pillar check.
// This module is server-side only in the same sense as lib/data.ts:
// it imports the full results/dossier JSON. Server components project
// it into the browser-safe shapes in lib/public-types.ts
// (PublicIpoRow / PublicIpoSearchEntry); client components never
// import this module.

import universeJson from './data/ipo_universe.json'
import resultsJson from './data/ipo_results.json'
import dossiersJson from './data/ipo_dossiers.json'
import ipoUpcomingJson from './data/ipo_upcoming.json'
import ipoUpcomingStatusJson from './data/ipo_upcoming_status.json'

export interface IpoUniverseEntry {
  ticker: string
  name: string
  company: string
  sector: string
  exchange: string
  tv_symbol: string
  yahoo_symbol: string
  listing_date: string
  offer_price: number
  shares_sold: number
  shares_sold_company: number
  shares_sold_stockholders: number
  amount_raised_usd: number
  amount_raised_note?: string
  underwriters: string
  shares_outstanding: number
  shares_outstanding_note?: string
  shares_fully_diluted_approx: number | null
  shares_fully_diluted_note?: string
  shares_float: number
  shares_float_note?: string
}

export interface IpoResult {
  name: string
  company: string
  sector: string
  price: number
  /** Day change vs the previous close, as a fraction — null on a
      name's first trading day, when TradingView returns no change
      (there is no previous close). */
  change_pct: number | null
  volume: number
  bars: number
  high_52w: number
  low_52w: number
  market_cap_outstanding_usd: number
  market_cap_fully_diluted_usd: number | null
  market_cap_float_usd: number
}

export interface IpoRevenueRow {
  period: string
  revenue_usd: number
  note: string
}

export interface IpoFilingFact {
  label: string
  value: string
  note: string
}

export interface IpoCalendarEvent {
  date: string
  event: string
  source: string
  status: 'done' | 'upcoming'
}

export interface IpoMarketSays {
  text: string
  source: string
  date: string
}

export interface IpoValuationContext {
  basis: string
  numerator: 'outstanding' | 'fully_diluted'
  denominator_usd: number
  denominator_label: string
  note: string
}

export interface IpoPathToCheck {
  blocker: string
  quarters_filed: number
  quarters_needed: number
  quarters_note: string
  unlock_eta: string
}

export interface IpoDossier {
  what_it_does: string
  filing_source: string
  revenue_rows: IpoRevenueRow[]
  filing_facts: IpoFilingFact[]
  calendar: IpoCalendarEvent[]
  market_says: IpoMarketSays[]
  valuation_context: IpoValuationContext[]
  path_to_check: IpoPathToCheck
}

export const IPO_UNIVERSE = (universeJson as { universe: IpoUniverseEntry[] }).universe
export const IPO_RESULTS = resultsJson as {
  as_of: string
  price_date: string
  universe_count: number
  ipos: Record<string, IpoResult>
}
export const IPO_DOSSIERS = (dossiersJson as { as_of: string; dossiers: Record<string, IpoDossier> })
  .dossiers
export const IPO_DOSSIERS_AS_OF = (dossiersJson as { as_of: string }).as_of

// Upcoming IPO calendar — companies that have filed to go public but
// have NOT listed yet (plus priced-but-not-yet-trading names when they
// exist). Hand-authored, like the dossiers: see IPO_DOSSIER.md §28
// and lib/data/ipo_upcoming.json. The weekly check
// (scripts/ipo_upcoming_check.py) writes only the status file below;
// it never edits the entries. No score, no fair value, no verdict —
// a tracker, not a check.
export interface IpoUpcomingStatus {
  has_424b4: boolean
  latest_accession: string | null
  latest_filing_date: string | null
  latest_form: string | null
  listed: boolean
  notes: string
  withdrawn: boolean
}

export interface IpoUpcomingEntry {
  company: string
  edgar_cik: string | null
  exchange: string
  expected: string
  filing: string
  filing_url: string
  filing_url_note?: string
  id: string
  price_range: string | null
  price_range_note: string
  raise_target: string | null
  raise_target_note: string
  sector: string
  shares_offered: string | null
  shares_offered_note?: string
  sources: string[]
  status: 'confidential' | 'filed' | 'postponed' | 'priced' | 'terms-set'
  status_label: string
  ticker: string | null
  tv_symbol: string | null
  underwriters: string
  valuation_target: string | null
  valuation_target_note: string
  watch: string
  what_it_does: string
}

export interface IpoUpcoming {
  as_of: string
  entries: IpoUpcomingEntry[]
  note: string
}

export interface IpoUpcomingStatusFile {
  as_of: string
  checked_at: string
  checker: string
  entries: Record<string, IpoUpcomingStatus>
  note: string
}

export const IPO_UPCOMING: IpoUpcoming = ipoUpcomingJson as IpoUpcoming
export const IPO_UPCOMING_STATUS: IpoUpcomingStatusFile = ipoUpcomingStatusJson as IpoUpcomingStatusFile
export const IPO_UPCOMING_COUNT = IPO_UPCOMING.entries.length

export function getIpoUpcomingStatus(id: string): IpoUpcomingStatus | null {
  return IPO_UPCOMING_STATUS.entries[id] ?? null
}

export const IPO_SYMBOLS: string[] = IPO_UNIVERSE.map((u) => u.ticker)

export function getIpo(symbol: string): IpoResult | undefined {
  return IPO_RESULTS.ipos[symbol]
}

export function getIpoUniverse(symbol: string): IpoUniverseEntry | undefined {
  return IPO_UNIVERSE.find((u) => u.ticker === symbol)
}

export function getIpoDossier(symbol: string): IpoDossier | undefined {
  return IPO_DOSSIERS[symbol]
}

/** Price bars still needed for a full five-pillar check (200-bar gate). */
export const IPO_BARS_NEEDED = 200

/** Trading days from a listing date to the 200th bar, approx: 200
    trading days ≈ 9.5 calendar months. The dossier's unlock ETA is
    hand-set from the filing calendar; this is only the bar-count
    arithmetic shown beside it. */
export function barsRemaining(bars: number): number {
  return Math.max(0, IPO_BARS_NEEDED - bars)
}
