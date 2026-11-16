// Data access for The Stock Check.
//
// SOURCE OF TRUTH: lib/data/results.json — a verbatim copy (md5-verified)
// of scoring-engine-v1.3/results.json for the original five tickers, plus the
// eight batch-2 tickers scored with the same v1.3 logic (see
// scoring-engine-v1.3-batch2/). SPEC v1.1 FINAL, engine v1.3.
// NEVER hand-edit a number in results.json. If a number is wrong, the
// fix goes in the engine and results.json is re-copied.

import resultsJson from './data/results.json'

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
  stock_verdicts: {
    verdict: string
    signal: string
    price: number
    ladder: number[]
    scores: number[]
    trust: number
    ocf_pct_ni: number
  }
  vs_stock_verdicts: {
    verdict_agree: boolean
    our_fv_vs_their_fair: number
    ladder_diff: { heavy: number; buy: number; fair: number; exit: number }
  }
  flags: string[]
  analysts: Analysts
}

export interface EngineResults {
  as_of: string
  price_date: string
  engine: string
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

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function money(n: number | null | undefined, digits = 2): string {
  if (n === null || n === undefined) return '—'
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

export function pct(n: number | null | undefined, digits = 1, signed = true): string {
  if (n === null || n === undefined) return '—'
  const v = n * 100
  const sign = signed && v > 0 ? '+' : ''
  return `${sign}${v.toFixed(digits)}%`
}

export function score1(n: number): string {
  return n.toFixed(1)
}
