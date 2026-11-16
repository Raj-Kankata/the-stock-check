# The Stock Check — deploy steps (GO given 2026-11-16 — repo ready, rest pending)

Repo is committed locally (37 files, `main`, commit `7af0be0`) — nothing pushed,
nothing deployed, domain not registered, no money spent. Remaining steps below.

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

- **$0 spent so far. Nothing pushed or deployed. Domain not registered.**
- Repo committed locally 2026-11-16 (commit `7af0be0`, 37 files, `main` branch;
  node_modules / .next / out excluded). Commit author is Rajkumar Kankata with a
  placeholder project email (`raj@thestockcheck.com`) — amend to his GitHub
  email with `git commit --amend --author="Name <email>"` when GitHub is connected.
- Domain re-check 2026-11-16 ~07:00 CT was inconclusive (registry RDAP timing
  out from this machine); it was verified available twice on 2026-11-15 — confirm
  in the registrar's own search before paying.
- Stack: Next.js 16 (App Router, TypeScript, static export), no backend, no API routes,
  no analytics, no sign-in. Data is baked in at build time from
  `lib/data/results.json` (scoring-engine-v1.3, SPEC v1.1 FINAL).
