// ETF data access for The Stock Check (ETF board, separate data product).
//
// SOURCE OF TRUTH: lib/data/etf_results.json (nightly, scripts/etf_refresh.py)
// + lib/data/etf_facts.json (weekly, scripts/etf_facts_refresh.py)
// + lib/data/etf_universe.json (the ETF universe).
//
// ETFs have NO fair value, NO verdict, NO overall score — see ETF_BOARD.md.
// What they have: a Technical score (the stock engine's Technical pillar
// math, exactly) and a Momentum Score (0.5*13W + 0.3*4W + 0.2*1W).
// This module is server-side only in the same sense as lib/data.ts: it
// imports the full results/facts JSON. Server components project it into
// the browser-safe shapes in lib/public-types.ts (PublicEtfRow /
// PublicEtfSearchEntry); client components never import this module.

import universeJson from './data/etf_universe.json'
import resultsJson from './data/etf_results.json'
import factsJson from './data/etf_facts.json'

export type EtfType = 'equity' | 'bond' | 'commodity' | 'leveraged'

export interface EtfUniverseEntry {
  ticker: string
  name: string
  provider: string
  category: string
  type: EtfType
  index: string
  tv_symbol: string
  former_ticker?: string
}

export interface EtfResult {
  name: string
  provider: string
  category: string
  type: EtfType
  index: string
  price: number
  change_pct: number
  volume: number
  rel_vol: number | null
  ema20: number
  ema50: number
  ema200: number
  rsi14: number
  macd_line: number
  macd_signal: number
  macd_hist: number
  beta: number | null
  high_52w: number
  low_52w: number
  price_vs_200d_pct: number
  dma50: number
  vs_50dma_pct: number
  ret_1w: number
  ret_4w: number
  ret_13w: number
  ret_1y_total: number
  technical_score: number
  technical_read: 'Strong' | 'Mixed' | 'Weak'
  technical_subscores: {
    trend_ema: number
    price_vs_200d: number
    rsi: number
    macd: number
  }
  momentum_score: number
  momentum_read: 'Building' | 'Flat' | 'Fading'
}

export interface EtfHolding {
  rank: number
  symbol: string
  name: string
  weight: number | null
}

export interface EtfFacts {
  expense_ratio: number | null
  aum_usd: number | null
  dividend_yield: number | null
  holdings_count: number | null
  inception: string | null
  top_holdings: EtfHolding[]
  note?: string
}

export const ETF_UNIVERSE = (universeJson as { universe: EtfUniverseEntry[] }).universe
export const ETF_RESULTS = resultsJson as {
  as_of: string
  price_date: string
  universe_count: number
  etfs: Record<string, EtfResult>
}
export const ETF_FACTS = factsJson as {
  as_of: string
  source: string
  facts: Record<string, EtfFacts>
}

export const ETF_SYMBOLS: string[] = ETF_UNIVERSE.map((u) => u.ticker)

export function getEtf(symbol: string): EtfResult | undefined {
  return ETF_RESULTS.etfs[symbol]
}

export function getEtfFacts(symbol: string): EtfFacts | undefined {
  return ETF_FACTS.facts[symbol]
}

export function getEtfUniverse(symbol: string): EtfUniverseEntry | undefined {
  return ETF_UNIVERSE.find((u) => u.ticker === symbol)
}

/** Type labels for badges and filters. */
export const ETF_TYPE_LABELS: Record<EtfType, string> = {
  equity: 'Equity',
  bond: 'Bond',
  commodity: 'Commodity',
  leveraged: 'Leveraged',
}
