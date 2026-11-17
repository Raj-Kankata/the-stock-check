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
import type {
  PublicGrid,
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

/** All 227 tickers' sensitivity grids, for the homepage preview. */
export function allGrids(): PublicGrid[] {
  return TICKER_SYMBOLS.map((symbol) => toGrid(symbol, RESULTS.tickers[symbol]))
}
