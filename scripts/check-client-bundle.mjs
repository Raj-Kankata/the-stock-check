// Post-build guard: no recipe text in the client bundle.
//
// After `next build`, every JS chunk under out/_next/static is scanned
// for the method/recipe markers. Any hit fails the build (non-zero
// exit) so a regression can never deploy: the nightly refresh keeps
// serving the last good build instead.
//
// Why these markers: each one appears ONLY in the scoring recipe —
// the leg method strings, the sensitivity-grid notes, the locked set,
// the sector-multiple source — never in a display value. The grid's
// own axis labels ("5.0%", "10%") use one decimal or none, so the
// two-decimal locked values ("5.00%", "10.0%", "12.0%") cannot match
// them. "2.5%" is deliberately NOT in this list: it could appear in
// a future display value, so it is checked by hand in verification
// instead of in this gate. The grid note, leg methods and locked set
// are caught redundantly by several markers each, so no single
// omission lets recipe text through.
//
// Run automatically as `postbuild` (see package.json). Also runnable
// by hand: node scripts/check-client-bundle.mjs

import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = fileURLToPath(new URL('../out/_next/static', import.meta.url))

const MARKERS = [
  'median of 3 legs',
  'locked_set',
  'ladder_ratios',
  'fv_method',
  'Damodaran',
  'SPEC v1.1',
  'FactSet Earnings',
  'triangulated_fv',
  '5.00%',
  '10.0%',
  '12.0%',
]

async function* jsFiles(dir) {
  for (const entry of await readdir(dir)) {
    const p = join(dir, entry)
    const s = await stat(p)
    if (s.isDirectory()) yield* jsFiles(p)
    else if (p.endsWith('.js')) yield p
  }
}

const counts = Object.fromEntries(MARKERS.map((m) => [m, 0]))
let files = 0
let bytes = 0
for await (const file of jsFiles(OUT_DIR)) {
  files += 1
  const text = await readFile(file, 'utf8')
  bytes += text.length
  for (const m of MARKERS) {
    let i = text.indexOf(m)
    while (i !== -1) {
      counts[m] += 1
      i = text.indexOf(m, i + m.length)
    }
  }
}

console.log(`check-client-bundle: ${files} JS chunks, ${bytes.toLocaleString('en-US')} bytes`)
for (const m of MARKERS) console.log(`  ${m}: ${counts[m]}`)
const bad = MARKERS.filter((m) => counts[m] > 0)
if (bad.length > 0) {
  console.error(
    `check-client-bundle: FAIL — recipe markers in client chunks: ${bad.join(', ')}. ` +
      'Client components must receive only whitelisted display values; see lib/public.ts.',
  )
  process.exit(1)
}
console.log('check-client-bundle: PASS — no recipe markers in client chunks')
