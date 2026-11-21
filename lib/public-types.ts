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
    strip; the rest are the stored filter fields). Quality is the
    Quality pillar score (0–100) — a display value only, used by the
    /screener as a filter and a column. */
export interface PublicRow extends PublicStockRow {
  sector: string
  beta: number | null
  pe: number | null
  debt_fcf: number | null
  market_cap: number | null
  rel_vol: number | null
  indexes: string[]
  quality: number
}

/** Header search entry: what one dropdown row shows. */
export interface PublicSearchEntry {
  symbol: string
  name: string
  verdict: Verdict
  overall_score: number
  fv: number
}

/** ETF board row: symbol, name, type, category, the two reads. */
export interface PublicEtfRow {
  symbol: string
  name: string
  type: 'equity' | 'bond' | 'commodity' | 'leveraged'
  category: string
  provider: string
  index: string
  price: number
  change_pct: number
  technical_score: number
  technical_read: 'Strong' | 'Mixed' | 'Weak'
  momentum_score: number
  momentum_read: 'Building' | 'Flat' | 'Fading'
}

/** Header search entry for an ETF: no verdict, no score, no fair value —
    the two ETF reads instead, with an ETF pill. */
export interface PublicEtfSearchEntry {
  symbol: string
  name: string
  type: 'equity' | 'bond' | 'commodity' | 'leveraged'
  technical_score: number
  technical_read: 'Strong' | 'Mixed' | 'Weak'
  momentum_score: number
  momentum_read: 'Building' | 'Flat' | 'Fading'
}

/** Index board row: symbol, name, type, category, the two reads (price
    indexes) or the VIX regime block. VIX carries no technical or
    momentum score — its fields are null there. */
export interface PublicIndexRow {
  symbol: string
  name: string
  type: 'broad' | 'sector' | 'volatility'
  category: string
  provider: string
  index: string
  price: number
  change_pct: number
  technical_score: number | null
  technical_read: 'Strong' | 'Mixed' | 'Weak' | null
  momentum_score: number | null
  momentum_read: 'Building' | 'Flat' | 'Fading' | null
  vix3m: number | null
  vix_vix3m_ratio: number | null
  curve_state: 'Contango' | 'Backwardation' | null
  regime: 'Calm' | 'Normal' | 'Elevated' | 'High' | 'Extreme' | null
  expected_move_pct: number | null
  expected_move_points: number | null
}

/** Header search entry for an index: the two reads for price indexes,
    the regime for VIX — with an INDEX pill. No fair value, no verdict. */
export interface PublicIndexSearchEntry {
  symbol: string
  name: string
  type: 'broad' | 'sector' | 'volatility'
  technical_score: number | null
  technical_read: 'Strong' | 'Mixed' | 'Weak' | null
  momentum_score: number | null
  momentum_read: 'Building' | 'Flat' | 'Fading' | null
  regime: 'Calm' | 'Normal' | 'Elevated' | 'High' | 'Extreme' | null
}

/** IPO dossier board row: symbol, company, the tape (price, day
    change, volume, bars, market caps) and the path-to-a-check
    progress. No fair value, no verdict, no score — a dossier is not
    a check. */
export interface PublicIpoRow {
  symbol: string
  name: string
  company: string
  sector: string
  listing_date: string
  /** 'ipo' — a new listing with an offer price; 'resumed' — a
      heavily-searched name with no card that is not a new listing
      (NBIS). 'Vs offer' is never computed for a resumed row. */
  kind: 'ipo' | 'resumed'
  /** Null for a resumed row — there is no offer price. */
  offer_price: number | null
  price: number
  change_pct: number | null
  volume: number
  bars: number
  market_cap_outstanding_usd: number
  market_cap_fully_diluted_usd: number | null
  market_cap_float_usd: number
  quarters_filed: number
  quarters_needed: number
  unlock_eta: string
}

/** Header search entry for an IPO dossier: the tape in one line, with
    an IPO pill — never a verdict, a score or a fair value, because a
    dossier has none. */export interface PublicIpoSearchEntry {
  symbol: string
  name: string
  company: string
  listing_date: string
  kind: 'ipo' | 'resumed'
  offer_price: number | null
  price: number
  change_pct: number | null
}

/** Header search entry for a "Not scored — insufficient data" tier
    name (RULEBOOK §34). Carries the price only — never a score, a
    verdict or a fair value, because the tier has none. */
export interface PublicNotScoredSearchEntry {
  symbol: string
  name: string
  price: number
  change_pct: number | null
}

/** One row of the not-scored tier list shown under the scored tables
    on /stocks and /screener (RULEBOOK §34). Display values only; the
    short reason is the tier's reason title, never a score. */
export interface PublicNotScoredRow {
  symbol: string
  name: string
  sector: string
  price: number
  change_pct: number | null
  reason_title: string
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

/** Theme-board row (first theme: neo-cloud): the tape arithmetic only
    — baked close, YTD vs the last close of the prior calendar year,
    gain since the frozen first-trade close — plus the scored card's
    overall score and verdict where one exists (ORCL only). No score,
    fair value or verdict is ever computed or implied for a member
    without a card: overall_score and verdict are null there, and the
    page renders an em dash. has_card / has_dossier decide where the
    ticker links: /stock/ for a card, /ipo/ for a dossier, nowhere
    for neither. */
export interface PublicThemeRow {
  symbol: string
  name: string
  kind: 'neo-cloud' | 'hyperscaler'
  price: number
  ytd_base_date: string
  ytd_base_close: number
  ytd_pct: number
  first_trade_date: string
  first_close: number
  first_close_split_adjusted: boolean
  first_trade_note: string
  since_first_pct: number
  overall_score: number | null
  verdict: Verdict | null
  has_card: boolean
  has_dossier: boolean
}
