# The Stock Check — deploy steps (GO given 2026-11-16 — code is on GitHub)

Repo is live at https://github.com/Raj-Kankata/the-stock-check — 37 files on
`main`, verified. Nothing deployed to Vercel yet, domain not registered, no
money spent. Remaining steps below.

## Deploy

1. **Create a free Vercel account** at [vercel.com](https://vercel.com) — Hobby plan, $0.
2. **Push this repo to GitHub** (create the repo then — do not do it now) and import it in
   Vercel, or use the `vercel` CLI. Framework preset: Next.js. Build command:
   `npm run build`. Output directory: `out` (static export).
3. **Register thestockcheck.com** at a registrar (~$10–15/yr; Name.com was used by the
   reference site, any registrar works). **NOT registered yet — Raj said no registration
   now.**
4. **In Vercel, add the domains** `www.thestockcheck.com` and `thestockcheck.com`. Set the
   domain's nameservers to Vercel DNS (`ns1.vercel-dns.com` / `ns2.vercel-dns.com`), or use
   the A/CNAME records Vercel shows. The apex → www 308 redirect is already in
   `vercel.json`.
5. **Verify:** the site loads on https://www.thestockcheck.com, the apex redirects to www,
   and `robots.txt` + `sitemap.xml` serve.
6. **Daily rebuild:** add a Vercel Cron (or a deploy hook + external scheduler) at ~05:20
   UTC that triggers a redeploy so pages rebuild with fresh closes. The engine re-run +
   data refresh step is wired at that point (see SPEC v1.1 §7).

## Local build

```bash
npm install && npm run build
```

Output lands in `out/`.

## Status

- **$0 spent so far. Site is LIVE at https://www.thestockcheck.com** (deployed
  2026-11-16; custom domain thestockcheck.com registered 2026-11-17 and wired
  to the site). Vercel project `the-stock-check`, Hobby plan ($0, team raj-kankata),
  GitHub repo https://github.com/Raj-Kankata/the-stock-check, `main`.
- **Vercel build quirk (learned 2026-11-16):** do NOT set Output Directory to
  `out` — the first deploy failed with NEXT_NO_ROUTES_MANIFEST; Vercel's
  Next.js builder wants its default output for a static export. Settings that
  work: Framework Next.js, Build Command `npm run build`, Output Directory
  "Next.js default". No environment variables.
- GitHub login used was OAuth device flow as Raj-Kankata (`gh`, token in
  ~/.config/gh/hosts.yml) — remove with `gh auth logout` when the deploy is
  done; Raj can also revoke it under GitHub → Settings → Applications. The
  earlier fine-grained PAT stored in custom.github was rejected by GitHub
  (401) and was not used.
- Domain re-check 2026-11-16 ~07:00 CT was inconclusive (registry RDAP timing
  out from this machine); it was verified available twice on 2026-11-15 — confirm
  in the registrar's own search before paying.
- Stack: Next.js 16 (App Router, TypeScript, static export), no backend, no API routes,
  no analytics, no sign-in. Data is baked in at build time from
  `lib/data/results.json` (scoring-engine-v1.3, SPEC v1.1 FINAL).

## Nightly refresh (`scripts/nightly_refresh.py`)

The data pipeline for the GitHub Actions nightly job (~05:20 UTC; the workflow
YAML itself is separate — this script only fetches, gates, scores and writes,
it never commits or pushes). Engines are FROZEN (scoring-engine-v1.3 and
v1.3-batch2, SPEC v1.1 FINAL): verbatim copies live at
`scripts/engine/v13/engine.py` and `scripts/engine/batch2/engine.py`, and the
frozen Nov-13-close base inputs at `scripts/engine/base_inputs.json` (13
tickers merged from both engines' `inputs.json`, entries byte-identical).

```bash
python3 scripts/nightly_refresh.py --dry-run            # reproduction gate, no fetching
python3 scripts/nightly_refresh.py --check-technicals   # recompute Nov-13 technicals, compare vs stored
python3 scripts/nightly_refresh.py [--as-of YYYY-MM-DD] # live refresh
```

- **Live refresh:** for each of the 13 tickers, fetches 1y history via yfinance
  and recomputes technicals with the exact `fetch_inputs.py` formulas
  (EMA20/50/200, RSI14 Wilder, MACD 12/26/9, ret_6m/ret_12m, high_52w,
  price_vs_200d_pct), then updates price, price_date and the price-derived
  fields only: trailing_pe = price/trailing_eps, forward_pe =
  price/forward_eps, dividend_yield scaled to preserve dividend-per-share.
  `trailing_pe_adjusted` is scaled by the price ratio, not recomputed as
  price/trailing_eps_adjusted — the stored adjusted EPS is rounded to 2dp
  (TSLA proves it: 390.22/0.98 = 398.18 ≠ stored 399.17). On success it
  writes fresh `inputs.json` into `scripts/engine/v13/` and `batch2/`, runs
  both engines, merges into `lib/data/results.json` (top-level exactly as
  v1.3's output; as_of = today UTC, price_date = latest completed close),
  updates all `public/sitemap.xml` lastmod entries to the refresh timestamp,
  and runs `npm run build` as a final gate. If no ticker's price, FV or
  verdict changed, it writes nothing at all (no as_of/lastmod bumps, no
  empty commit, no redeploy). A mid-session manual run never
  uses today's still-trading bar: if the last bar is dated today (US/Eastern)
  and it is before 16:00 ET, the bar is dropped.
- **Market snapshot (live refresh only):** the same run fetches the S&P 500,
  Nasdaq, Dow and VIX closes via yfinance (close, prev close, point change,
  % change) and the 10Y Treasury yield from the FRED DGS10 CSV (urllib, no
  key), and writes `lib/data/market.json` at the same time as
  `lib/data/results.json` — but only if the market values actually changed
  (a market-only change still writes `market.json` on its own; a night with
  no ticker or market change writes nothing). FRED can lag a day behind the
  close (and is blank on bond holidays), so the 10Y is the latest FRED value
  dated on or before the close date and its own `as_of` is recorded in the
  file — e.g. the Nov-13 snapshot carries the 10Y at 5.10% as of Nov 12,
  because FRED had not yet published a Nov-13 DGS10 value (the U.S.
  Treasury's own daily par-yield table put the Nov-13 10Y at 5.15%; the
  nightly run picks that up once FRED publishes it). `--dry-run` and
  `--check-technicals` do not touch the market snapshot.
- **What stays on its own cadence (NOT refreshed here):** fundamentals
  (quarterly, via the Fundamentals refresh), Story/Financials scores
  (weekly, Story-Tracker), sector multiples (quarterly, FactSet), Damodaran
  ERP / 10Y Treasury for the CAPM cross-check (monthly), ONEOFF adjustments
  (manual, only when a material one-off is verified). The nightly job
  reuses all of these exactly as frozen in `base_inputs.json`.
- **Safety gates (live mode, before writing anything):** any yfinance fetch
  failure or empty history → FAIL; missing close → FAIL; any ticker's new
  price more than 25% from its stored price → FAIL (likely bad data); fewer
  than 200 history bars → FAIL; any engine output missing a ticker or with
  a null triangulated_fv where the stored one was non-null → FAIL; tickers
  disagreeing on the latest close date → FAIL. Market gates, same
  all-or-nothing rule: any index/10Y fetch failure or missing close → FAIL;
  the four indices disagreeing on the latest close date, or disagreeing
  with the tickers' price_date → FAIL; any of ^GSPC/^IXIC/^DJI moving more
  than 25% day-over-day → FAIL; NO magnitude gate on VIX or the 10Y. On any
  failure the script exits non-zero and writes NOTHING (everything is
  computed in memory and staged in a temp dir first).
- **Dry run** re-runs both engines on the frozen base inputs and requires
  triangulated_fv, overall_score and verdict to match `lib/data/results.json`
  EXACTLY for all 13 tickers (verified 13/13 PASS on 2026-11-16).
  **Check-technicals** is informational: it re-fetches 1y history ending
  2026-11-13 and reports per-field match vs the stored Nov-13 technicals.
  On 2026-11-16 it matched 123/143 fields exactly — all 11 fields for the
  five v1.3 tickers; for the eight batch-2 tickers only EMA200 (±0.02–0.47),
  its knock-on price_vs_200d_pct (±0.001) and ret_12m (±0.001–0.017) differ,
  because the rolling 1y window starts one bar later than the original
  batch-2 fetch. EMA20/50, RSI, MACD, ret_6m, high_52w and every last close
  match exactly. These are seed/window-start effects on the slowest
  indicator, reported as-is, never adjusted to match — and they never
  change a banded technical subscore.

