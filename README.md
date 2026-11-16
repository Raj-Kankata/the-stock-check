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

- **$0 spent so far. Site is LIVE at https://the-stock-check-six.vercel.app** (deployed
  2026-11-16; Vercel assigned `-six` because plain `the-stock-check.vercel.app` was
  taken). Vercel project `the-stock-check`, Hobby plan ($0, team raj-kankata),
  GitHub repo https://github.com/Raj-Kankata/the-stock-check, `main`, commit
  `d94a1214` (37 files, tree verified identical to local). Domain not registered.
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
