// Browser-safe public shapes.
//
// These are the ONLY shapes that may cross the server/client boundary
// as props. They carry display values only — ticker, name, price,
// score, verdict, fair value, leg VALUES, ladder $ levels are derived
// from the fair value at render time, analyst targets, sector, beta,
// P/E, debt/FCF, market cap, rel. vol, index membership, upside.
//
// They deliberately carry NO method/recipe text: no leg method
// strings, no sensitivity-grid notes, no flags text, no pillar
// detail, no locked-set values, no sector-multiple values, no
// triangulation metadata. This module imports nothing, so importing
// these types (or their runtime shape) can never pull results.json
// into the client bundle.

export type Verdict = 'Growth' | 'Value' | 'Avoid' | 'Watch'

/** The row every list on the site renders: symbol, name, verdict,
    overall score, baked price, fair value. */
export interface PublicStockRow {
  symbol: string
  name: string
  verdict: Verdict
  overall_score: number
  price: number
  fv: number
}

/** /stocks browser row: the list row plus the six filter values
    (beta and trailing P/E are display values from the card facts
    strip; the rest are the stored filter fields). */
export interface PublicRow extends PublicStockRow {
  sector: string
  beta: number | null
  pe: number | null
  debt_fcf: number | null
  market_cap: number | null
  rel_vol: number | null
  indexes: string[]
}

/** Header search entry: what one dropdown row shows. */
export interface PublicSearchEntry {
  symbol: string
  name: string
  verdict: Verdict
  overall_score: number
  fv: number
}

/** Homepage grid preview: one ticker's DCF sensitivity grid — the
    grid VALUES only (numbers), the decision leg value, the decision
    growth, and the price. The grid note is never included: it
    describes how the numbers combine and stays server-side. */
export interface PublicGrid {
  symbol: string
  name: string
  price: number
  dcfLeg: number | null
  dcfGrowth: number | null
  gridValues: Record<string, Record<string, number>> | null
}
