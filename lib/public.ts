// Server-side projections of results.json into the browser-safe
// shapes in lib/public-types.ts.
//
// SERVER-ONLY: this module imports lib/data.ts (the full results.json,
// including every method string, grid note and locked-set value).
// It must NEVER be imported by a client component or by any module a
// client component imports — that would put the whole results.json
// back into the browser bundle. Server components call these
// functions at build time and pass only the returned plain values as
// props; the nightly refresh regenerates results.json (recipe text
// included) and the projection strips it again on the next build, so
// a refresh can never re-introduce recipe text into a client chunk.

import { RESULTS, TICKER_SYMBOLS, type TickerData } from './data'
import { ETF_RESULTS, ETF_SYMBOLS, type EtfResult } from './etf-data'
import { INDEX_RESULTS, INDEX_SYMBOLS, type IndexResult } from './index-data'
import type {
  PublicEtfRow,
  PublicEtfSearchEntry,
  PublicGrid,
  PublicIndexRow,
  PublicIndexSearchEntry,
  PublicRow,
  PublicSearchEntry,
  PublicStockRow,
} from './public-types'

export function toStockRow(symbol: string, t: TickerData): PublicStockRow {
  return {
    symbol,
    name: t.name,
    verdict: t.verdict,
    overall_score: t.overall_score,
    price: t.price,
    fv: t.triangulated_fv,
  }
}

export function toPublicRow(symbol: string, t: TickerData): PublicRow {
  const detail = t.pillars.valuation.detail
  return {
    ...toStockRow(symbol, t),
    sector: t.sector,
    beta: detail.dcf_capm_crosscheck?.beta_raw ?? null,
    pe: detail.legs?.pegy?.pe_used ?? null,
    debt_fcf: t.debt_fcf,
    market_cap: t.market_cap,
    rel_vol: t.rel_vol,
    indexes: t.indexes ?? [],
  }
}

export function toSearchEntry(symbol: string, t: TickerData): PublicSearchEntry {
  return {
    symbol,
    name: t.name,
    verdict: t.verdict,
    overall_score: t.overall_score,
    fv: t.triangulated_fv,
  }
}

export function toGrid(symbol: string, t: TickerData): PublicGrid {
  const detail = t.pillars.valuation.detail
  return {
    symbol,
    name: t.name,
    price: t.price,
    dcfLeg: detail.legs?.dcf.value ?? null,
    dcfGrowth: detail.legs?.dcf.growth_scenario ?? null,
    gridValues: detail.dcf_sensitivity_grid?.values ?? null,
  }
}

/** All 227 tickers, in results.json order. */
export function allPublicRows(): PublicRow[] {
  return TICKER_SYMBOLS.map((symbol) => toPublicRow(symbol, RESULTS.tickers[symbol]))
}

/** Header search index: one entry per scored ticker. */
export function searchIndex(): PublicSearchEntry[] {
  return TICKER_SYMBOLS.map((symbol) => toSearchEntry(symbol, RESULTS.tickers[symbol]))
}

/** All 382 tickers' sensitivity grids, for the homepage preview. */
export function allGrids(): PublicGrid[] {
  return TICKER_SYMBOLS.map((symbol) => toGrid(symbol, RESULTS.tickers[symbol]))
}

// ---------------------------------------------------------------------------
// ETF projections — same server-only pattern as the stock projections
// above. No fair value, no verdict, no overall score exists for ETFs,
// so the ETF shapes carry only the two reads (Technical + Momentum)
// plus the display facts.
// ---------------------------------------------------------------------------

export function toEtfRow(symbol: string, t: EtfResult): PublicEtfRow {
  return {
    symbol,
    name: t.name,
    type: t.type,
    category: t.category,
    provider: t.provider,
    index: t.index,
    price: t.price,
    change_pct: t.change_pct,
    technical_score: t.technical_score,
    technical_read: t.technical_read,
    momentum_score: t.momentum_score,
    momentum_read: t.momentum_read,
  }
}

export function toEtfSearchEntry(symbol: string, t: EtfResult): PublicEtfSearchEntry {
  return {
    symbol,
    name: t.name,
    type: t.type,
    technical_score: t.technical_score,
    technical_read: t.technical_read,
    momentum_score: t.momentum_score,
    momentum_read: t.momentum_read,
  }
}

/** All 55 ETF board rows, in universe order. */
export function allEtfRows(): PublicEtfRow[] {
  return ETF_SYMBOLS.map((symbol) => toEtfRow(symbol, ETF_RESULTS.etfs[symbol]))
}

/** Header search index for ETFs. */
export function etfSearchIndex(): PublicEtfSearchEntry[] {
  return ETF_SYMBOLS.map((symbol) => toEtfSearchEntry(symbol, ETF_RESULTS.etfs[symbol]))
}

// ---------------------------------------------------------------------------
// Index projections — same server-only pattern as the ETF projections
// above. No fair value, no verdict, no overall score exists for
// indexes, so the shapes carry only the two reads (Technical +
// Momentum) for price indexes, and the VIX regime block for VIX.
// ---------------------------------------------------------------------------

export function toIndexRow(symbol: string, t: IndexResult): PublicIndexRow {
  return {
    symbol,
    name: t.name,
    type: t.type,
    category: t.category,
    provider: t.provider,
    index: t.index,
    price: t.price,
    change_pct: t.change_pct,
    technical_score: t.technical_score ?? null,
    technical_read: t.technical_read ?? null,
    momentum_score: t.momentum_score ?? null,
    momentum_read: t.momentum_read ?? null,
    vix3m: t.vix3m ?? null,
    vix_vix3m_ratio: t.vix_vix3m_ratio ?? null,
    curve_state: t.curve_state ?? null,
    regime: t.regime ?? null,
    expected_move_pct: t.expected_move_pct ?? null,
    expected_move_points: t.expected_move_points ?? null,
  }
}

export function toIndexSearchEntry(symbol: string, t: IndexResult): PublicIndexSearchEntry {
  return {
    symbol,
    name: t.name,
    type: t.type,
    technical_score: t.technical_score ?? null,
    technical_read: t.technical_read ?? null,
    momentum_score: t.momentum_score ?? null,
    momentum_read: t.momentum_read ?? null,
    regime: t.regime ?? null,
  }
}

/** All 6 index board rows, in universe order. */
export function allIndexRows(): PublicIndexRow[] {
  return INDEX_SYMBOLS.map((symbol) => toIndexRow(symbol, INDEX_RESULTS.indexes[symbol]))
}

/** Header search index for indexes. */
export function indexSearchIndex(): PublicIndexSearchEntry[] {
  return INDEX_SYMBOLS.map((symbol) => toIndexSearchEntry(symbol, INDEX_RESULTS.indexes[symbol]))
}
