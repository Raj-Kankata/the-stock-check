// Shared site constants — all values copied from the frozen SPEC v1.1
// (~/workspace/stock-verdicts-better/SPEC-v1.1.md) and the backtest
// reports. Do not change a number here without a new spec version.

export const SITE_NAME = 'The Stock Check'
export const SITE_URL = 'https://www.thestockcheck.com'
export const ENGINE_VERSION = 'scoring-engine-v1.3'
export const CONTACT_EMAIL = 'hello@thestockcheck.com'

/** Pillar weights (SPEC v1.1 §3, frozen). */
export const PILLAR_WEIGHTS = [
  { key: 'conviction', label: 'Conviction', weight: 25 },
  { key: 'valuation', label: 'Valuation', weight: 30 },
  { key: 'quality', label: 'Quality / Forensics', weight: 20 },
  { key: 'technical', label: 'Technical / Timing', weight: 10 },
  { key: 'trust', label: 'Trust', weight: 15 },
] as const

/** Sector forward P/E table (SPEC v1.1 Appendix A; FactSet Earnings Insight, 13 Nov 2026). */
export const SECTOR_MULTIPLES: { sector: string; forwardPE: number; avg5y: string; avg10y: string }[] = [
  { sector: 'Information Technology', forwardPE: 18.0, avg5y: '25.4', avg10y: '23.1' },
  { sector: 'Communication Services', forwardPE: 16.8, avg5y: '18.3', avg10y: '17.7' },
  { sector: 'Health Care', forwardPE: 20.0, avg5y: '17.4', avg10y: '16.7' },
  { sector: 'Consumer Discretionary', forwardPE: 25.1, avg5y: '—', avg10y: '—' },
  { sector: 'Consumer Staples', forwardPE: 23.7, avg5y: '—', avg10y: '—' },
  { sector: 'Energy', forwardPE: 12.2, avg5y: '—', avg10y: '—' },
  { sector: 'Financials', forwardPE: 15.1, avg5y: '—', avg10y: '—' },
  { sector: 'Industrials', forwardPE: 22.5, avg5y: '—', avg10y: '—' },
  { sector: 'Materials', forwardPE: 17.4, avg5y: '—', avg10y: '—' },
  { sector: 'Real Estate', forwardPE: 18.0, avg5y: '—', avg10y: '—' },
  { sector: 'Utilities', forwardPE: 17.0, avg5y: '—', avg10y: '—' },
  { sector: 'S&P 500 (fallback)', forwardPE: 18.3, avg5y: '19.8', avg10y: '19.1' },
]
export const SECTOR_TABLE_SOURCE = 'FactSet Earnings Insight, 13 Nov 2026'
export const SECTOR_TABLE_NOTE =
  'Cap 35×, floor 10× (neither binds at any date Dec 2023 – Nov 2026). Fallback chain: sector multiple → S&P 500 forward P/E → legacy 22× (flagged last resort). Refreshed quarterly, first Friday after quarter-end.'

/** Top Picks — frozen entry prices, two cohorts.
 * Launch cohort entered at the 13 Nov 2026 close (SPEC v1.1 §7).
 * New cohort entered at the 16 Nov 2026 close: the top 5 Growth and
 * top 5 Value names as of that close. NVDA is a launch pick only —
 * it appears once, in the launch cohort. The list is frozen at
 * publication and changes only when Raj decides — no automatic
 * rotation. DECK was replaced by GME on 17 Nov 2026 (Raj's decision):
 * GME overall 78.3 ranks above DECK 78.0 in Value as of the 16 Nov
 * close, so the top-5-Value rule now holds exactly. */
export const PICKS_ENTRY_DATE = '2026-11-13'
export const PICKS_NEW_ENTRY_DATE = '2026-11-16'
export const PICKS = [
  { symbol: 'NVDA', entryPrice: 162.85, cohort: 'launch' as const, entryDate: PICKS_ENTRY_DATE },
  { symbol: 'AAPL', entryPrice: 356.27, cohort: 'launch' as const, entryDate: PICKS_ENTRY_DATE },
  { symbol: 'MSFT', entryPrice: 523.88, cohort: 'launch' as const, entryDate: PICKS_ENTRY_DATE },
  { symbol: 'GOOGL', entryPrice: 295.77, cohort: 'launch' as const, entryDate: PICKS_ENTRY_DATE },
  { symbol: 'GEN', entryPrice: 30.4, cohort: 'new' as const, entryDate: PICKS_NEW_ENTRY_DATE },
  { symbol: 'PATH', entryPrice: 13.14, cohort: 'new' as const, entryDate: PICKS_NEW_ENTRY_DATE },
  { symbol: 'LYTS', entryPrice: 15.36, cohort: 'new' as const, entryDate: PICKS_NEW_ENTRY_DATE },
  { symbol: 'RDDT', entryPrice: 92.87, cohort: 'new' as const, entryDate: PICKS_NEW_ENTRY_DATE },
  { symbol: 'HPE', entryPrice: 46.57, cohort: 'new' as const, entryDate: PICKS_NEW_ENTRY_DATE },
  { symbol: 'NXPI', entryPrice: 254.19, cohort: 'new' as const, entryDate: PICKS_NEW_ENTRY_DATE },
  { symbol: 'GME', entryPrice: 25.6, cohort: 'new' as const, entryDate: PICKS_NEW_ENTRY_DATE },
  { symbol: 'LOVE', entryPrice: 14.94, cohort: 'new' as const, entryDate: PICKS_NEW_ENTRY_DATE },
  { symbol: 'DELL', entryPrice: 320.55, cohort: 'new' as const, entryDate: PICKS_NEW_ENTRY_DATE },
] as const

/** S&P 500 benchmark — frozen closes from Yahoo Finance (yfinance
 * ^GSPC history, cross-checked against market.json to the cent).
 * 13 Nov 2026 close 7561.67 matches the launch cohort's entry date;
 * 16 Nov 2026 close 7416.59 matches the new cohort's entry date.
 * Hand-check at the 16 Nov close: −1.92% since 13 Nov, 0.00% since
 * 16 Nov by construction. */
export const BENCHMARK = {
  label: 'S&P 500',
  source: 'Yahoo Finance',
  launchEntryDate: PICKS_ENTRY_DATE,
  launchEntryClose: 7561.67,
  newEntryDate: PICKS_NEW_ENTRY_DATE,
  newEntryClose: 7416.59,
} as const

/** Backtest evidence for the ladder-as-context framing (SPEC v1.1 §5, Appendices C–D). */
export const BACKTEST_V2 = {
  label: 'Backtest v2 — 12 quarter-ends, Dec 2023 – Sep 2026, 5 tickers (Variant A)',
  aboveExit: '38 of 50 observations above Exit',
  aboveExit6m: '+19.9%',
  aboveExitWin: '72%',
  aboveExitVsSpy: '+10.0% vs SPY',
  correlations: 'upside vs forward return: +0.03 (1M) / −0.11 (3M) / +0.00 (6M)',
}
export const BACKTEST_WIDE = {
  label: 'Full 749-name backtest — 2,498 fair-value observations, 748 names, 12 quarter-ends',
  belowBuy6m: '+6.5% (n=579, −4.1% vs SPY)',
  aboveExit6m: '+9.5% (n=1,048, −0.6% vs SPY)',
  correlations: '−0.013 (1M) / −0.011 (3M) / −0.054 (6M)',
}
export const BACKTEST_V3_CAPM = {
  label: 'Backtest v3 — CAPM-discount variant, full 749-name universe',
  belowBuy6m: '+6.0% (n=655)',
  aboveExit6m: '+9.8% (n=951)',
  correlations: '−0.01 (1M) / −0.01 (3M) / −0.06 (6M)',
  note: 'DCF legs rose a median +18.8% under CAPM discounts and 314 rows changed bucket, but the median triangulated fair value was unchanged (+0.0%) — the median-of-three blunts the discount exactly as it blunted the sector multiple in v2. The CAPM leg stays display-only.',
}
export const TRIANGULATION_DECISION = {
  label: 'Median vs weighted triangulation — measured 2026-11-16 on the 2,498-row backtest',
  median: 'Median: 6M below Buy +6.5% vs above Exit +9.5% (gap 2.9pp, wrong way)',
  bestWeighted: 'Best weighted variant (Forward-heavy 25/25/50): +6.9% vs +9.0% (gap 2.0pp)',
  verdict:
    'The best variant closes the gap by only 0.9pp against a ~1.7pp standard error — noise, and one of four pre-specified variants. Weighting buys churn, not signal: 47–62% of fair values move >5% and 273–379 buckets migrate. Decision (Raj, 2026-11-15): keep the median-of-three.',
}

/** Sector Rotation formulas (port of colicoid's TradingView Pine Script; teardown §8). */
export const ROTATION_FORMULAS = {
  rs: 'RS = sector 21-day return − SPY 21-day return',
  momentum: 'Momentum = weighted average (1W×3, 1M×2, 2M×1, 3M×0.5) ÷ 6.5',
  acceleration:
    'Acceleration = recent average (1W×2, 1M) − older average (3M, 6M), where each average is weighted by its weights',
  delta1m: 'Δ1M = this month’s 1M% vs the prior month’s 1M%',
  flow: 'Flow: IN (Mom > 5 & Acc > 2) · TURN (Mom > 0 & Acc > 5) · WATCH (6M < −10 & 1M > 0 & Acc > 0) · OUT (Mom < −5 & Acc < −2)',
  attribution: 'Exact port of the TradingView Pine Script by colicoid.',
  /** Worked example (our own), 15 Nov 2026: Health Care XLV. */
  workedExample: {
    sector: 'Health Care (XLV)',
    returns: { w1: 2.2, m1: 6.6, m2: 13.1, m3: 13.5, m6: 31.2 },
    momentum: 6.1,
    acceleration: -18.7,
    rs: 8.8,
  },
}

export const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/stocks', label: 'All Stocks' },
  { href: '/picks', label: 'Top Picks' },
  { href: '/trending', label: 'Trending' },
  { href: '/performance', label: 'Performance' },
  { href: '/sectors', label: 'Sector Rotation' },
  { href: '/pulse', label: 'Market Pulse' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/faq', label: 'FAQ' },
] as const
