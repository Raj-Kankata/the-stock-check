/**
 * The Stock Check brand mark — Concept A, "Five Bars, One Check".
 * Five vertical bars = the five pillars; their tops trace a tick mark
 * (dip to the vertex at bar 2, then rising to the tallest bar), and the
 * tallest, brightest bar is the verdict. Colours come from CSS variables
 * so they swap with the theme: light #166534 / #16A34A, dark #4ADE80 /
 * #86EFAC (see --mark-bar / --mark-verdict in app/globals.css).
 * The parent span sizes the svg; the viewBox keeps the 120:84 aspect.
 */
export default function BrandMark() {
  return (
    <svg viewBox="0 0 120 84" aria-hidden="true" focusable="false">
      <rect x="4" y="46" width="16" height="30" rx="3" fill="var(--mark-bar)" />
      <rect x="28" y="58" width="16" height="18" rx="3" fill="var(--mark-bar)" />
      <rect x="52" y="46" width="16" height="30" rx="3" fill="var(--mark-bar)" />
      <rect x="76" y="28" width="16" height="48" rx="3" fill="var(--mark-bar)" />
      <rect x="100" y="12" width="16" height="64" rx="3" fill="var(--mark-verdict)" />
    </svg>
  )
}
