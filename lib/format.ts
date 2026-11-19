// Pure number formatting helpers.
//
// Client-safe by construction: this module imports NOTHING — no data
// files, no site constants. Every client component formats numbers
// through here instead of lib/data.ts, so importing a formatter can
// never drag results.json (and its recipe text) into the browser
// bundle. lib/data.ts re-exports these for server-side use.

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

/** Big-dollar shorthand for market caps and raises: $1.88T, $81.34B,
    $5.13B, $846M. Two decimals — the same precision the dossiers
    quote from the filings. */
export function bigUsd(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  return `$${n.toLocaleString('en-US')}`
}

/** Integer with thousands separators: 13,219,642,276. */
export function int(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return Math.round(n).toLocaleString('en-US')
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** ISO date → readable label: "2026-11-19" → "Nov 19, 2026",
    "2027-11" → "Nov 2027". Anything that is not an ISO date
    (e.g. "early 2027", "after Q2 2027 results") passes through
    unchanged, so calendar entries can carry approximate dates. */
export function dateLabel(iso: string): string {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (full) return `${MONTHS[Number(full[2]) - 1]} ${Number(full[3])}, ${full[1]}`
  const monthOnly = /^(\d{4})-(\d{2})$/.exec(iso)
  if (monthOnly) return `${MONTHS[Number(monthOnly[2]) - 1]} ${monthOnly[1]}`
  return iso
}
