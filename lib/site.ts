// Shared site constants — display values only.
//
// Client-safe by construction: this module contains NO model
// documentation — no pillar weights, no sector multiples, no backtest
// evidence, no triangulation decision, no rotation formulas. Those
// live in lib/site-server.ts, which client components must never
// import. What stays here is what the pages show: the site name and
// URL, the engine version label, the frozen pick list and entry
// prices, the frozen benchmark closes, and the navigation links.
// Do not add a recipe value or method string to this file.

export const SITE_NAME = 'The Stock Check'
export const SITE_URL = 'https://www.thestockcheck.com'
export const ENGINE_VERSION = 'scoring-engine-v1.8'
export const CONTACT_EMAIL = 'hello@thestockcheck.com'

/** Top Picks — frozen entry prices, two cohorts.
 * Launch cohort entered at the 13 Nov 2026 close.
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

export const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/stocks', label: 'All Stocks' },
  { href: '/etfs', label: 'ETFs' },
  { href: '/indexes', label: 'Indexes' },
  { href: '/ipos', label: 'IPOs' },
  { href: '/ipos/upcoming', label: 'IPO calendar' },
  { href: '/picks', label: 'Top Picks' },
  { href: '/trending', label: 'Trending' },
  { href: '/performance', label: 'Performance' },
  { href: '/sectors', label: 'Sector Rotation' },
  { href: '/pulse', label: 'Market Pulse' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/faq', label: 'FAQ' },
] as const
