// Theme-board data access for The Stock Check (theme boards, separate
// data product; first theme: neo-cloud).
//
// SOURCE OF TRUTH: lib/data/themes/neo-cloud-universe.json (hand-
// verified members + frozen first-trade baselines — see RULEBOOK §29)
// + lib/data/themes/neo-cloud.json (nightly,
// scripts/theme_neo_cloud_refresh.py).
//
// Theme boards carry NO score, NO fair value and NO verdict of their
// own — the only score/verdict on a theme row is the scored card's,
// projected in lib/public.ts for the one member that has a card
// (ORCL). Everything else on the row is tape arithmetic: the baked
// close, YTD vs the last close of the prior calendar year, and the
// gain since the frozen first-trade close. This module is server-side
// only in the same sense as lib/data.ts: server components project it
// into the browser-safe shape in lib/public-types.ts
// (PublicThemeRow); client components never import this module.

import universeJson from './data/themes/neo-cloud-universe.json'
import resultsJson from './data/themes/neo-cloud.json'

export interface ThemeMember {
  ticker: string
  name: string
  /** 'neo-cloud' — rents out GPU compute for AI work. 'hyperscaler'
      — the comparison row (ORCL), labelled as such on the page, NOT
      a neo-cloud. */
  kind: 'neo-cloud' | 'hyperscaler'
  tv_symbol: string
  /** First trading day, hand-verified (see RULEBOOK §29). For the
      SPAC names this is the first day under the current ticker, not
      the SPAC's first trade; for HUT it is the Nasdaq listing. */
  first_trade_date: string
  /** First-trade close. ORCL's is split-adjusted (see
      first_close_split_adjusted); the rest are the prices as traded
      that day — no member has split since its first trade (verified
      2026-11-19). */
  first_close: number
  first_close_split_adjusted: boolean
  first_trade_note: string
}

export interface ThemeResultRow {
  price: number
  ytd_base_date: string
  ytd_base_close: number
  /** YTD as a fraction: price / last close of the prior calendar
      year − 1. */
  ytd_pct: number
  first_trade_date: string
  first_close: number
  first_close_split_adjusted: boolean
  /** Gain since first trade as a fraction: price / first_close − 1. */
  since_first_pct: number
}

export const THEME_MEMBERS = (universeJson as { members: ThemeMember[] }).members
export const THEME_RESULTS = resultsJson as {
  as_of: string
  price_date: string
  note: string
  rows: Record<string, ThemeResultRow>
}

export const THEME_SYMBOLS: string[] = THEME_MEMBERS.map((m) => m.ticker)

export function getThemeMember(symbol: string): ThemeMember | undefined {
  return THEME_MEMBERS.find((m) => m.ticker === symbol)
}

export function getThemeResult(symbol: string): ThemeResultRow | undefined {
  return THEME_RESULTS.rows[symbol]
}
