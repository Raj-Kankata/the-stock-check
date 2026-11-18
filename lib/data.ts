// Data access for The Stock Check.
//
// SOURCE OF TRUTH: lib/data/results.json — 227 three-leg tickers (SPEC v1.2
// FINAL, engine v1.4). Phase 2 merge, 2026-11-16: the 11 continuing names
// verbatim from the 13-ticker live file, plus 216 names from the
// full-universe refresh; NVO and JPM (two-leg, DCF skipped) were removed,
// so every published fair value is now the median of three legs.
// NEVER hand-edit a number in results.json. If a number is wrong, the
// fix goes in the engine and results.json is re-copied.

import resultsJson from './data/results.json'
import { money, pct, round2, score1 } from './format'

export { money, pct, round2, score1 }

export interface DcfLeg {
  value: number | null
  method: string
  growth_scenario: number | null
}

export interface PegLeg {
  value: number | null
  method: string
  pegy: number | null
  growth_used: number | null
  pe_used: number | null
  uncapped_pegy: number | null
}

export interface ForwardLeg {
  value: number | null
  method: string
  sector_multiple: number | null
  sector_multiple_asof: string | null
  forward22_value: number | null
}

/** Lynch value (display only), written by nightly_refresh.py's merge
    step from the stored PEGY leg — the Lynch fair price IS the PEGY leg
    (price x PEGY). value/pegy/growth_used/pe_used are the leg's own
    numbers; eps = live price / P/E used (the EPS behind that P/E),
    eps_adjusted where the P/E used is the adjusted P/E; growth_cap is
    "30%" when the 30% cap binds, "guardrail" when the SPEC v1.2
    guardrail capped the growth, else null. available is False (with a
    reason) when the value cannot be computed — no live name triggers
    that today. */
export interface LynchValue {
  value: number | null
  pegy: number | null
  growth_used: number | null
  growth_cap: '30%' | 'guardrail' | null
  dividend_yield: number | null
  pe_used: number | null
  eps: number | null
  eps_adjusted: boolean
  available: boolean
  reason: string | null
}

export interface CapmCrosscheck {
  value: number | null
  discount_capm: number | null
  beta_raw: number | null
  beta_adjusted: number | null
  rf_live: number | null
  rf_live_asof: string | null
  erp: number | null
  erp_asof: string | null
  method: string
}

export interface SensitivityGrid {
  values: Record<string, Record<string, number>> | null
  note: string
}

export interface PillarDetail {
  score: number
  detail: {
    story?: number
    financials?: number
    legs?: {
      dcf: DcfLeg
      pegy: PegLeg
      forward_sector: ForwardLeg
    }
    triangulated_fv?: number
    fv_method?: string
    upside_pct?: number
    leg_spread_div_fv?: number
    ladder?: { heavy: number; buy: number; fair: number; exit: number }
    ladder_ratios?: { heavy: number; buy: number; fair: number; exit: number }
    dcf_capm_crosscheck?: CapmCrosscheck
    dcf_sensitivity_grid?: SensitivityGrid
    subscores?: Record<string, number>
    /** v1.6 degenerate flag (SPEC v1.4 §13): true when |NI used| is < 1%
        of TTM revenue — the OCF/NI and FCF-conversion ratios are
        meaningless and the card shows "not meaningful" instead. */
    degenerate_ni?: boolean
    inputs?: Record<string, number | string>
  }
}

export interface Analysts {
  n_opinions: number
  target_mean: number
  target_high: number
  target_low: number
  target_spread_div_mean: number
}

export interface TickerData {
  name: string
  sector: string
  price: number
  pillars: {
    conviction: PillarDetail
    valuation: PillarDetail
    quality: PillarDetail
    technical: PillarDetail
    trust: PillarDetail
  }
  overall_score: number
  verdict: 'Growth' | 'Value' | 'Avoid' | 'Watch'
  verdict_reason: string
  triangulated_fv: number
  ladder: { heavy: number; buy: number; fair: number; exit: number }
  pros: string[]
  cons: string[]
  flags: string[]
  /** Analyst consensus targets. Optional: a card must render without it
      (see app/stock/[ticker]/page.tsx) and never show a guessed target. */
  analysts?: Analysts
  /** Six-filter fields (data pass 2026-11-16). debt_fcf = total debt /
      TTM FCF (null if FCF <= 0 or either input missing); market_cap =
      2026-11-13 close x implied shares; rel_vol = 2026-11-16 volume /
      mean of prior 20 trading days' volumes; indexes from Wikipedia
      constituent lists as of 2026-11-16 (see scripts/engine/index_lists.json). */
  debt_fcf: number | null
  market_cap: number | null
  rel_vol: number | null
  indexes: string[]
  /** Lynch value panel (display only, see LynchValue). Optional: a card
      must render without it (see app/stock/[ticker]/page.tsx). */
  lynch?: LynchValue
}

export interface EngineResults {
  as_of: string
  price_date: string
  engine: string
  /** Alpha Vantage trailing-earnings pull coverage (display only, homepage
      tile). Written by nightly_refresh.py from lib/data/av_coverage.json
      (committed by the daily AV pull cron's snapshot step); the refresh
      never computes it, only carries it. Optional: the tile hides when
      the field is absent. as_of is the pull date (coverage.json mtime). */
  av_earnings_coverage?: {
    pulled: number
    universe: number
    remaining: number
    skipped_no_data: number
    total_quarterly_rows: number
    tickers_covering_all_12_quarters: number
    as_of: string
  }
  locked_set: Record<string, string | number>
  capm_crosscheck: {
    ten_year_treasury_pct: number
    ten_year_treasury_asof: string
    ten_year_treasury_source: string
    ten_year_treasury_url: string
    damodaran_implied_erp_pct: number
    damodaran_implied_erp_asof: string
    damodaran_implied_erp_variant: string
    damodaran_implied_erp_source: string
    damodaran_implied_erp_url: string
    beta_adjustment: string
    beta_source: string
    formula: string
    status: string
    sensitivity_grid: string
  }
  weights: Record<string, number>
  ladder_ratios: { heavy: number; buy: number; fair: number; exit: number }
  tickers: Record<string, TickerData>
}

export const RESULTS = resultsJson as unknown as EngineResults

export const TICKER_SYMBOLS = Object.keys(RESULTS.tickers)

export function getTicker(symbol: string): TickerData | null {
  return RESULTS.tickers[symbol.toUpperCase()] ?? null
}

/** Ladder levels recomputed from the fair value — must match results.json exactly. */
export function ladderFromFv(fv: number): { heavy: number; buy: number; fair: number; exit: number } {
  const r = RESULTS.ladder_ratios
  return {
    heavy: round2(fv * r.heavy),
    buy: round2(fv * r.buy),
    fair: round2(fv * r.fair),
    exit: round2(fv * r.exit),
  }
}
