// Congress-trading data access for The Stock Check (Congress board,
// per-card Congress panel, member pages — a separate data product).
//
// SOURCE OF TRUTH: lib/data/congress.json — written nightly by
// scripts/congress_refresh.py from the Bargo free Congress API, which
// is built from the official STOCK Act filings (House Clerk financial
// disclosures + Senate eFD periodic transaction reports). The file is
// a persistent store: each nightly run merges the newest filings into
// it and dedupes, so coverage grows from the capture start date.
// Party comes from the congress-legislators current file (last term),
// matched in the refresh script — never guessed; an unmatched member
// carries party null and displays as "—".
//
// Congress trading has NO fair value, NO verdict, NO overall score
// and NO pillar scores — see RULEBOOK.md §31. It is disclosed-filing
// context: amounts are the filings' dollar RANGES, filings lag trades
// by up to ~45 days, and a member's "portfolio" is a reconstruction
// from captured filings only.
//
// This module is server-side only in the same sense as lib/data.ts:
// it imports the full store JSON. Server components project it into
// browser-safe shapes; client components never import this module.

import congressJson from './data/congress.json'

export interface CongressStats {
  totals: { trades: number; members: number; tickers: number; buys: number; sells: number }
  latest_transaction: string
  latest_disclosure: string
  most_traded_90d: {
    ticker: string
    trades: number
    buys: number
    sells: number
    members: number
  }[]
}

export interface CongressTrade {
  member: string
  member_slug: string
  chamber: 'house' | 'senate' | string
  /** Bargo's state field: "CA31" for a House district, "KY" for a
      Senate state. Render through stateLabel(). */
  state: string
  ticker: string
  asset: string
  /** 'purchase' | 'sale' (other filing types pass through). */
  type: string
  amount_low: number
  amount_high: number
  amount_range: string
  transaction_date: string
  disclosure_date: string
  est_price: number | null
  recent_price: number | null
  recent_price_date: string | null
  perf_pct: number | null
  /** Bargo's outcome label for the trade; refreshed on merge like
      the other perf fields. May be absent on older stored rows. */
  outcome?: string | null
  filing_portal: string
  party: string | null
  lag_days: number | null
}

export interface CongressMember {
  slug: string
  name: string
  chamber: string
  state: string
  party: string | null
  /** Aggregates computed from the captured store — NOT the member's
      full filing history. */
  trades: number
  buys: number
  sells: number
  last_trade: string
  last_disclosure: string
  avg_lag_days: number | null
  late_filings: number
  /** Performance layer: mean perf_pct over this member's disclosed
      buys that carry one (return since the trade date, on Bargo's
      price estimates), and how many buys went into it. Null / 0
      when no captured buy carries a perf figure. */
  avg_buy_perf_pct: number | null
  buy_perf_count: number
}

export interface CongressPartyRow {
  ticker: string
  group: 'Democratic' | 'Bipartisan' | 'Republican'
  dem_buys: number
  dem_sells: number
  rep_buys: number
  rep_sells: number
  total: number
}

export interface CongressFile {
  as_of: string
  updated_at: string
  capture_start: string
  source: string
  source_url: string
  stats: CongressStats
  trades: CongressTrade[]
  members: CongressMember[]
  party_map: CongressPartyRow[]
  /** Performance layer, precomputed by the refresh from the store:
      the newest recent_price_date the perf figures carry, and the
      best / worst disclosed buys by perf_pct (full trade rows). */
  perf_as_of: string | null
  top_buys: CongressTrade[]
  worst_buys: CongressTrade[]
}

export const CONGRESS = congressJson as unknown as CongressFile
export const CONGRESS_AS_OF = CONGRESS.as_of
export const CONGRESS_CAPTURE_START = CONGRESS.capture_start
export const CONGRESS_STATS = CONGRESS.stats
export const CONGRESS_TRADES = CONGRESS.trades
export const CONGRESS_MEMBERS = CONGRESS.members
export const CONGRESS_PARTY_MAP = CONGRESS.party_map
export const CONGRESS_PERF_AS_OF = CONGRESS.perf_as_of
export const CONGRESS_TOP_BUYS = CONGRESS.top_buys
export const CONGRESS_WORST_BUYS = CONGRESS.worst_buys

export function getCongressMember(slug: string): CongressMember | undefined {
  return CONGRESS_MEMBERS.find((m) => m.slug === slug)
}

export function congressTradesForMember(slug: string): CongressTrade[] {
  return CONGRESS_TRADES.filter((t) => t.member_slug === slug)
}

export function congressTradesForTicker(ticker: string): CongressTrade[] {
  return CONGRESS_TRADES.filter((t) => t.ticker === ticker)
}

/** "CA31" → "CA-31" (House district); "KY" → "KY" (Senate state). */
export function congressStateLabel(state: string, chamber: string): string {
  if (chamber === 'house') {
    const m = /^([A-Z]{2})(\d+)$/.exec(state)
    if (m) return `${m[1]}-${m[2]}`
  }
  return state
}

export function congressChamberLabel(chamber: string): string {
  return chamber === 'senate' ? 'Senate' : chamber === 'house' ? 'House' : chamber
}

/** Filing type → display verb. Purchases are buys, sales are sells;
    anything else passes through title-cased. */
export function congressTypeLabel(type: string): string {
  if (type === 'purchase') return 'Buy'
  if (type === 'sale') return 'Sell'
  return type.charAt(0).toUpperCase() + type.slice(1)
}
