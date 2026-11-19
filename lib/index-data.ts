// Index data access for The Stock Check (index board, separate data product).
//
// SOURCE OF TRUTH: lib/data/index_results.json (nightly,
// scripts/index_refresh.py) + lib/data/index_universe.json
// (the 6-index universe).
//
// Indexes have NO fair value, NO verdict, NO overall score — see
// INDEX_BOARD.md. Price indexes have a Technical score (the stock
// engine's Technical pillar math, exactly) and a Momentum Score
// (0.5*13W + 0.3*4W + 0.2*1W). VIX has NEITHER: it gets a regime
// read (5-band scale, VIX3M, ratio, curve state, expected daily
// SPX move) instead. This module is server-side only in the same
// sense as lib/data.ts: it imports the full results JSON. Server
// components project it into the browser-safe shapes in
// lib/public-types.ts (PublicIndexRow / PublicIndexSearchEntry);
// client components never import this module.

import universeJson from './data/index_universe.json'
import resultsJson from './data/index_results.json'

export type IndexType = 'broad' | 'sector' | 'volatility'

export interface IndexUniverseEntry {
  ticker: string
  name: string
  provider: string
  category: string
  type: IndexType
  index: string
  tv_symbol: string
  yahoo_symbol: string
}

export interface IndexResult {
  name: string
  provider: string
  category: string
  type: IndexType
  index: string
  price: number
  change_pct: number
  ema20?: number
  ema50?: number
  ema200?: number
  rsi14?: number
  macd_line?: number
  macd_signal?: number
  macd_hist?: number
  high_52w: number
  low_52w: number
  price_vs_200d_pct?: number
  dma50?: number
  vs_50dma_pct?: number
  ret_1w?: number
  ret_4w?: number
  ret_13w?: number
  ret_1y?: number
  technical_score?: number
  technical_read?: 'Strong' | 'Mixed' | 'Weak'
  technical_subscores?: {
    trend_ema: number
    price_vs_200d: number
    rsi: number
    macd: number
  }
  momentum_score?: number
  momentum_read?: 'Building' | 'Flat' | 'Fading'
  /** VIX only: the regime block. */
  vix3m?: number
  vix_vix3m_ratio?: number
  curve_state?: 'Contango' | 'Backwardation'
  regime?: 'Calm' | 'Normal' | 'Elevated' | 'High' | 'Extreme'
  expected_move_pct?: number
  expected_move_points?: number
}

export const INDEX_UNIVERSE = (universeJson as { universe: IndexUniverseEntry[] }).universe
export const INDEX_RESULTS = resultsJson as {
  as_of: string
  price_date: string
  universe_count: number
  indexes: Record<string, IndexResult>
}

export const INDEX_SYMBOLS: string[] = INDEX_UNIVERSE.map((u) => u.ticker)

export function getIndex(symbol: string): IndexResult | undefined {
  return INDEX_RESULTS.indexes[symbol]
}

export function getIndexUniverse(symbol: string): IndexUniverseEntry | undefined {
  return INDEX_UNIVERSE.find((u) => u.ticker === symbol)
}

/** Type labels for badges and filters. */
export const INDEX_TYPE_LABELS: Record<IndexType, string> = {
  broad: 'Broad market',
  sector: 'Sector',
  volatility: 'Volatility',
}

/** VIX regime bands — the same 5-band scale as the /pulse Volatility
    panel: Calm <15, Normal 15–20, Elevated 20–30, High 30–40,
    Extreme >40. */
export function vixRegime(vix: number): 'Calm' | 'Normal' | 'Elevated' | 'High' | 'Extreme' {
  if (vix < 15) return 'Calm'
  if (vix < 20) return 'Normal'
  if (vix < 30) return 'Elevated'
  if (vix < 40) return 'High'
  return 'Extreme'
}
