# stockcheck-search-log — anonymous search log (Cloudflare Worker + D1)

Receives anonymous search events from thestockcheck.com and stores ONLY
what the site sends: a UTC timestamp, the search query, and the ticker
picked (or `null` for a no-result search). **No IP, no user agent, no
headers, no cookies** — nothing that can identify a visitor is ever read
or stored. `/stats` returns aggregates only, behind a bearer token; no
raw rows ever leave the database.

## Endpoints

- `POST /log` — body `{ "query": "NVDA", "ticker": "NVDA" }` or
  `{ "query": "ZZZZ", "ticker": null }`. CORS allows
  `https://www.thestockcheck.com` only; any other browser origin gets 403.
  Validation: query is trimmed, uppercased, 1–20 chars of
  `[A-Z0-9 .-]`; ticker is `[A-Z0-9.-]` 1–12 chars or null. Anything else
  is rejected with 400 and nothing is stored.
- `GET /stats` — aggregates for the last 30 days: top queries, top picked
  tickers, top no-result queries, daily counts. Requires
  `Authorization: Bearer <STATS_TOKEN>`; without it, 401.
- Anything else — 404.

## Deploy (one time, from this directory)

Prereqs: a Cloudflare account with the thestockcheck.com zone, and an API
token with these **Account** permissions (exact dashboard labels, from
Cloudflare's API token permissions reference):

- **Workers Scripts Edit** — deploy the Worker
- **D1 Edit** — create the database and apply migrations
- **Account Analytics Read** — later, for pulling Cloudflare Web
  Analytics traffic numbers via the GraphQL Analytics API (there is no
  separate "Web Analytics" token permission)

Deploy with the connector helper, not wrangler. It uses the stored API
token, creates or reuses the D1 database, applies the migration, uploads
the Worker, enables its workers.dev route and verifies the live endpoints:

```sh
python3 ~/workspace/custom-connectors/custom.cloudflare/bin/deploy_search_log.py
```

Do not use `npx wrangler login` (the Cloudflare dashboard sign-in is
blocked from this VM's browser) and never export the raw API token. All
commands are free tier (Workers 100k req/day, D1 free tier) — nothing here
costs anything.

Live deployment (2026-11-18): Worker
`https://stockcheck-search-log.thestockcheck.workers.dev`, D1 database
`stockcheck-search-log` (`cc5e7126-b731-49c4-9ef8-8c43d2defd2c`), account
subdomain `thestockcheck`. The STATS_TOKEN bearer value lives only in
`~/workspace/custom-connectors/custom.cloudflare/STATS_TOKEN` (mode 600),
never in this repo.

## Wire the site to the Worker (after deploy)

1. In `lib/analytics.ts`, set `SEARCH_LOG_URL` to the workers.dev URL
   from step 4 (append `/log`, e.g.
   `https://stockcheck-search-log.<subdomain>.workers.dev/log`).
2. Commit and push the repo (see the repo's push discipline — push via
   `~/workspace/push_via_api.py`); Vercel redeploys the static site.
3. The site then logs one event per search selection and one per distinct
   no-result query — never per keystroke.

## Cloudflare Web Analytics beacon (traffic)

The site renders the beacon only when `CF_BEACON_TOKEN` is set in
`lib/analytics.ts`. To get the token, in the Cloudflare dashboard
(on your own device — the dashboard sign-in is blocked from this VM's
browser): **Analytics & Logs → Web Analytics → Add a site →
thestockcheck.com**. The site is DNS-only (proxy OFF), so automatic
injection is not available — Cloudflare gives a snippet instead; copy
only the `token` value from
`data-cf-beacon='{"token": "..."}'` and paste it into `CF_BEACON_TOKEN`,
then commit + push as above. No DNS or proxy change is needed.

## Local test

```sh
cd workers/search-log
cp .dev.vars.example .dev.vars   # gitignored; test token only
npx wrangler d1 migrations apply stockcheck-search-log --local
npx wrangler dev --local         # serves http://localhost:8787

# In another terminal:
curl -X POST localhost:8787/log \
  -H 'Content-Type: application/json' -H 'Origin: https://www.thestockcheck.com' \
  -d '{"query":"NVDA","ticker":"NVDA"}'            # → {"ok":true}
curl -X POST localhost:8787/log \
  -H 'Content-Type: application/json' \
  -d '{"query":"!!!","ticker":null}'                # → 400, nothing stored
curl localhost:8787/stats                           # → 401
curl localhost:8787/stats \
  -H 'Authorization: Bearer test-token-local-only'  # → 200, aggregates
curl -X OPTIONS localhost:8787/log \
  -H 'Origin: https://www.thestockcheck.com' \
  -H 'Access-Control-Request-Method: POST' -i       # → 204, ACAO = live origin
curl -X OPTIONS localhost:8787/log \
  -H 'Origin: https://evil.example' -i              # → 403
```

## Reading the numbers

```sh
curl https://stockcheck-search-log.<subdomain>.workers.dev/stats \
  -H "Authorization: Bearer <STATS_TOKEN>"
```

Traffic (page views, referrers, countries, top pages) lives in the
Cloudflare dashboard under Analytics & Logs → Web Analytics, or via the
GraphQL Analytics API with the token above.
