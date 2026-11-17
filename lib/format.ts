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
