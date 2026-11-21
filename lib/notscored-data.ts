// Data access for the "Not scored — insufficient data" tier
// (RULEBOOK §34, 2026-11-21, Raj approved).
//
// SOURCE OF TRUTH: lib/data/notscored_universe.json (hand-authored:
// the reason each name cannot be scored, which of the three valuation
// methods can be computed and why the others cannot, the fundamentals
// snapshot from the Nov 2026 pipeline data build, and the
// Story×Financials tracker readings) + lib/data/notscored_results.json
// (the nightly price snapshot, written ONLY by
// scripts/notscored_refresh.py — never hand-edit a price).
//
// These names have NO score, NO verdict and NO fair value, on any
// surface. A name that graduates through the normal engine publish
// path appears in lib/data/results.json; the /stock route renders the
// scored card in preference and the refresh drops it from this tier.

import universeJson from './data/notscored_universe.json'
import resultsJson from './data/notscored_results.json'
import { money, pct, bigUsd, int, score1 } from './format'

export { money, pct, bigUsd, int, score1 }

export type NotScoredReasonCode = 'NEGATIVE_FV' | 'ONE_LEG' | 'NO_GROWTH'

export interface NotScoredMethod {
  key: 'dcf' | 'pegy' | 'forward'
  label: string
  available: boolean
  note: string
}

export interface NotScoredFundamentals {
  revenue_ttm: number | null
  net_income_ttm: number | null
  ocf_ttm: number | null
  fcf_ttm: number | null
  trailing_eps: number | null
  forward_eps: number | null
  revenue_cagr_3y: number | null
  beta: number | null
}

export interface NotScoredEntry {
  ticker: string
  name: string
  sector: string
  tv_symbol: string
  yahoo_symbol: string
  reason_code: NotScoredReasonCode
  reason_title: string
  reason_text: string
  methods: NotScoredMethod[]
  fundamentals: NotScoredFundamentals
  story: { story: number; financials: number; quadrant: string }
  ipo_dossier: string | null
}

export interface NotScoredResult {
  name: string
  price: number
  change_pct: number | null
  volume: number | null
  bars: number
  high_52w: number
  low_52w: number
}

export const NOTSCORED_UNIVERSE = universeJson as unknown as {
  as_of: string
  fundamentals_asof: string
  tickers: NotScoredEntry[]
}

export const NOTSCORED_RESULTS = resultsJson as unknown as {
  as_of: string
  price_date: string
  universe_count: number
  tickers: Record<string, NotScoredResult>
}

export const NOTSCORED_FUNDAMENTALS_ASOF = NOTSCORED_UNIVERSE.fundamentals_asof

const BY_TICKER = new Map(NOTSCORED_UNIVERSE.tickers.map((e) => [e.ticker, e] as [string, NotScoredEntry]))

export const NOTSCORED_SYMBOLS = NOTSCORED_UNIVERSE.tickers.map((e) => e.ticker)

/** The tier entry for a ticker, or null. A ticker with a scored card
    is never returned here — graduation (RULEBOOK §34) is checked by
    the caller against lib/data results first. */
export function getNotScored(symbol: string): NotScoredEntry | null {
  return BY_TICKER.get(symbol.toUpperCase()) ?? null
}

export function getNotScoredResult(symbol: string): NotScoredResult | null {
  return NOTSCORED_RESULTS.tickers[symbol.toUpperCase()] ?? null
}
