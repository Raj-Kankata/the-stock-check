// Market snapshot strip for the site header.
// Static data from lib/data/market.json (verified 13 Nov 2026 closes;
// 10Y Treasury from FRED DGS10, which lags a day — its own as-of date
// is shown honestly and it is never presented as the 13 Nov close).
// RULE: if market.json is missing an entry, that chip is hidden —
// never render a placeholder or a stale number as live.

import marketJson from '@/lib/data/market.json'

interface MarketIndex {
  symbol?: string
  label?: string
  close?: number
  change?: number
  change_pct?: number
}

interface MarketData {
  as_of?: string
  indices?: MarketIndex[]
  treasury_10y?: { value_pct?: number; as_of?: string }
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null
  const parts = iso.split('-').map(Number)
  const [y, m, d] = parts
  if (!y || !m || !d || m < 1 || m > 12) return null
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n)
}

export default function MarketStrip() {
  const data = marketJson as unknown as MarketData
  const indices = Array.isArray(data.indices) ? data.indices : []
  const chips = indices.filter(
    (i) =>
      typeof i.label === 'string' &&
      isFiniteNumber(i.close) &&
      isFiniteNumber(i.change) &&
      isFiniteNumber(i.change_pct),
  )
  const treasury = data.treasury_10y
  const showTreasury = treasury && isFiniteNumber(treasury.value_pct)

  const asOf = formatDate(data.as_of)
  const treasuryAsOf = formatDate(treasury?.as_of)

  return (
    <div className="market-strip">
      {asOf && (
        <p className="market-strip-date">
          Markets as of {asOf} close
          {showTreasury && treasuryAsOf ? ` · 10Y as of ${treasuryAsOf}` : ''}
        </p>
      )}
      <div className="market-strip-chips">
        {chips.map((i) => {
          const direction = i.change! > 0 ? 'up' : i.change! < 0 ? 'down' : 'flat'
          const sign = i.change! > 0 ? '+' : ''
          const pctSign = i.change_pct! > 0 ? '+' : ''
          return (
            <span key={i.label} className={`market-chip ${direction}`}>
              <span className="market-chip-label">{i.label}</span>
              <strong>
                {i.close!.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </strong>{' '}
              <span className="market-chip-change">
                {sign}
                {i.change!.toFixed(2)} ({pctSign}
                {(i.change_pct! * 100).toFixed(2)}%)
              </span>
            </span>
          )
        })}
        {showTreasury && (
          <span className="market-chip flat">
            <span className="market-chip-label">10Y Treasury</span>
            <strong>{treasury!.value_pct!.toFixed(2)}%</strong>
          </span>
        )}
      </div>
    </div>
  )
}
