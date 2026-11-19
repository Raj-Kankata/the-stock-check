// CNN Fear & Greed dial gauge — a semicircular dial in CNN's own
// layout: five bands along the arc, a needle at the score, the score
// in the centre (medium only). Replaces the 5-segment bar gauge
// (2026-11-19): Raj shared CNN's own gauge and asked for the dial.
//
// Small: homepage tile (compact, no centre number — the tile already
// shows the value as its big number). Medium: /pulse panel (centre
// number, with the four reference rows beside it, like CNN's page).
//
// Geometry: score s maps to angle 180 − s×1.8 degrees (0 = far left,
// 100 = far right). Band labels sit on the arc, rotated to the
// tangent (rotation = 90 − angle), the way CNN lays them out:
// EXTREME FEAR reads bottom-to-top on the left, EXTREME GREED
// top-to-bottom on the right. Inactive bands are muted grey, like
// CNN's — only the active band is coloured (light tint fill, strong
// border), so the needle's position is the reading at a glance.

export const FG_BANDS = [
  { max: 25, label: 'Extreme Fear', color: '#dc2626', tint: '#fecaca' },
  { max: 45, label: 'Fear', color: '#ea580c', tint: '#fed7aa' },
  { max: 55, label: 'Neutral', color: '#eab308', tint: '#fef08a' },
  { max: 75, label: 'Greed', color: '#65a30d', tint: '#d9f99d' },
  { max: 100, label: 'Extreme Greed', color: '#15803d', tint: '#bbf7d0' },
] as const

export function fgBandFor(score: number): (typeof FG_BANDS)[number] {
  const s = Math.max(0, Math.min(100, score))
  return FG_BANDS.find((b) => s < b.max) ?? FG_BANDS[FG_BANDS.length - 1]
}

const CX = 100
const CY = 100
const R_OUT = 88
const R_IN = 62

function angleFor(score: number): number {
  return 180 - Math.max(0, Math.min(100, score)) * 1.8
}

function point(r: number, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) }
}

function sectorPath(a0: number, a1: number): string {
  // Annular sector from angle a0 to a1 (a0 > a1, clockwise on screen).
  const o0 = point(R_OUT, a0)
  const o1 = point(R_OUT, a1)
  const i1 = point(R_IN, a1)
  const i0 = point(R_IN, a0)
  const f = (n: number) => n.toFixed(2)
  return (
    `M ${f(o0.x)} ${f(o0.y)} ` +
    `A ${R_OUT} ${R_OUT} 0 0 1 ${f(o1.x)} ${f(o1.y)} ` +
    `L ${f(i1.x)} ${f(i1.y)} ` +
    `A ${R_IN} ${R_IN} 0 0 0 ${f(i0.x)} ${f(i0.y)} Z`
  )
}

export default function FearGreedDial({
  score,
  variant,
}: {
  score: number
  variant: 'small' | 'medium'
}) {
  const s = Math.max(0, Math.min(100, score))
  const active = fgBandFor(s)
  const medium = variant === 'medium'
  const labelSize = medium ? 8.5 : 7
  const tickSize = medium ? 8 : 7

  // Band edges in score order; the active band is coloured, the rest
  // are muted grey (CNN's look).
  const edges = [0, 25, 45, 55, 75, 100]
  const needleAngle = angleFor(s)
  const tip = point(70, needleAngle)

  return (
    <svg
      className={`fg-dial fg-dial-${variant}`}
      viewBox={medium ? '0 0 200 134' : '0 0 200 110'}
      role="img"
      aria-label={`Fear & Greed index ${Math.round(s)}, ${active.label}`}
    >
      {/* Faint outer/inner arc outlines so the dial has an edge. */}
      <path
        d={`M ${CX - R_OUT} ${CY} A ${R_OUT} ${R_OUT} 0 0 1 ${CX + R_OUT} ${CY}`}
        fill="none"
        stroke="var(--muted)"
        strokeOpacity={0.35}
        strokeWidth={1}
      />
      <path
        d={`M ${CX - R_IN} ${CY} A ${R_IN} ${R_IN} 0 0 1 ${CX + R_IN} ${CY}`}
        fill="none"
        stroke="var(--muted)"
        strokeOpacity={0.35}
        strokeWidth={1}
      />
      {FG_BANDS.map((b, i) => {
        const lo = edges[i]
        const hi = edges[i + 1]
        const isActive = b.label === active.label
        return (
          <path
            key={b.label}
            d={sectorPath(angleFor(lo), angleFor(hi))}
            fill={isActive ? b.tint : 'var(--muted)'}
            fillOpacity={isActive ? 1 : 0.22}
            stroke={isActive ? b.color : 'none'}
            strokeWidth={isActive ? 1.5 : 0}
          />
        )
      })}
      {/* Band labels on the arc, rotated to the tangent. */}
      {FG_BANDS.map((b, i) => {
        const mid = (edges[i] + edges[i + 1]) / 2
        const ang = angleFor(mid)
        const p = point(75, ang)
        const rot = 90 - ang
        const words = b.label.toUpperCase().split(' ')
        const f = (n: number) => n.toFixed(2)
        return (
          <text
            key={b.label}
            x={p.x}
            y={p.y}
            fontSize={labelSize}
            fontWeight={700}
            fill="var(--muted)"
            textAnchor="middle"
            transform={`rotate(${f(rot)} ${f(p.x)} ${f(p.y)})`}
          >
            {words.length > 1 ? (
              <>
                <tspan x={p.x} dy={-1}>
                  {words[0]}
                </tspan>
                <tspan x={p.x} dy={labelSize + 1.5}>
                  {words.slice(1).join(' ')}
                </tspan>
              </>
            ) : (
              <tspan x={p.x} dy={labelSize * 0.35}>
                {words[0]}
              </tspan>
            )}
          </text>
        )
      })}
      {/* Tick marks and numbers at 0 / 25 / 50 / 75 / 100. */}
      {[0, 25, 50, 75, 100].map((t) => {
        const a = angleFor(t)
        const p0 = point(60, a)
        const p1 = point(54, a)
        const pn = point(45, a)
        const f = (n: number) => n.toFixed(2)
        return (
          <g key={t}>
            <line
              x1={f(p0.x)}
              y1={f(p0.y)}
              x2={f(p1.x)}
              y2={f(p1.y)}
              stroke="var(--muted)"
              strokeWidth={1}
            />
            <text
              x={pn.x}
              y={pn.y}
              fontSize={tickSize}
              fill="var(--muted)"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {t}
            </text>
          </g>
        )
      })}
      {/* Needle + hub. */}
      <line
        x1={CX}
        y1={CY}
        x2={tip.x.toFixed(2)}
        y2={tip.y.toFixed(2)}
        stroke="var(--ink)"
        strokeWidth={2.5}
        strokeLinecap="round"
      />
      <circle
        cx={CX}
        cy={CY}
        r={6.5}
        fill="var(--card)"
        stroke="var(--ink)"
        strokeWidth={2}
      />
      {medium ? (
        <text
          x={CX}
          y={128}
          fontSize={24}
          fontWeight={800}
          fill="var(--ink)"
          textAnchor="middle"
        >
          {Math.round(s)}
        </text>
      ) : null}
    </svg>
  )
}
