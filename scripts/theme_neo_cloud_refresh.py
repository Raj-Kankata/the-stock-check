#!/usr/bin/env python3
"""Nightly Neo-cloud theme refresh — The Stock Check (theme boards,
separate data product; first theme: neo-cloud).

Pulls the theme universe (lib/data/themes/neo-cloud-universe.json) and
writes lib/data/themes/neo-cloud.json with the latest-close snapshot
per member: price, YTD % (last close of the prior calendar year to the
baked close) and gain since first trade (frozen first-trade close in
the universe file to the baked close).

Sources (no key, no account):
  - Yahoo chart v8 (range=5y, 1d) for the close and the prior-year
    last close. Range is 5y, not max: Yahoo silently returns WEEKLY
    bars for NBIS on range=max while the others return daily — 5y
    returns daily bars for all nine. A granularity guard fails the
    run if Yahoo ever returns non-daily bars again.
  - TradingView scanner POST (america/scan, Content-Type: text/plain)
    for the close cross-check. Exchange prefixes from the universe
    file. All nine tickers must resolve.

First-trade baselines are HAND-VERIFIED editorial data in the universe
file (see RULEBOOK §29) — the script never derives them from Yahoo:
Yahoo's series for the SPAC names starts at the SPAC (GWAC/IKNX),
not at the operating company, and for HUT it reaches back to the TSX
listing. The baselines: NBIS 2024-10-21 $20.00 (resumption), CRWV
2025-03-28 $40.00 (IPO), IREN 2021-11-17 $24.45 (IPO), CIFR
2021-08-30 $10.27 (first day under the CIFR ticker), APLD 2022-04-13
$4.85 (IPO), HUT 2021-06-15 $21.45 (Nasdaq listing), CORZ 2024-01-24
$3.44 (relisting), WULF 2021-12-14 $20.30 (first day under the WULF
ticker), ORCL 1986-03-12 $0.0633 split-adjusted (IPO).

Fail-closed: any ticker unresolved on the scanner, any required field
null, zero Yahoo bars, no prior-year last close, a Yahoo/TV close
disagreeing by >0.5%, or tickers disagreeing on the latest close date
aborts the run with NOTHING written. No 25% move gate — these names
move >25% in a day for real (and the Yahoo/TV agreement on two
independent sources is the bad-data guard, as in ipo_refresh.py).
Sitemap theme entry is synced only on a successful write.

Mid-session guard: the script refuses to run while the latest Yahoo
bar is still partial (latest bar dated today CT before the 15:00 CT
close) — a partial bar must never be written as a close. Run it
after the close, like the nightly workflow does (05:20 UTC).

Usage: python3 scripts/theme_neo_cloud_refresh.py [--dry-run]
  --dry-run prints the file it would write and exits 0 iff all gates
  pass; writes nothing.
"""
import datetime
import json
import os
import re
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNIVERSE = os.path.join(REPO, "lib", "data", "themes",
                        "neo-cloud-universe.json")
RESULTS = os.path.join(REPO, "lib", "data", "themes", "neo-cloud.json")
SITEMAP = os.path.join(REPO, "public", "sitemap.xml")
SCAN_URL = "https://scanner.tradingview.com/america/scan"
SITE = "https://www.thestockcheck.com"

ET = datetime.timezone(datetime.timedelta(hours=-5))  # America/Chicago (CST)

NOTE = ("Prices: Yahoo chart v8 (range=5y, daily) cross-checked to the "
        "TradingView scanner (≤0.5%). First-trade closes are frozen "
        "baselines from lib/data/themes/neo-cloud-universe.json. YTD "
        "base is the last close of the prior calendar year.")


def fail(msg):
    print(f"THEME REFRESH FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def load_json(path):
    with open(path) as f:
        return json.load(f)


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=1)
        f.write("\n")


def fetch_tv(tickers, tv_symbols):
    """TradingView scanner: one batched POST for the whole theme."""
    body = json.dumps({
        "symbols": {"tickers": [tv_symbols[t] for t in tickers]},
        "columns": ["name", "close", "change", "volume"],
        "options": {"lang": "en"},
        "range": [0, len(tickers)]})
    req = urllib.request.Request(
        SCAN_URL, data=body.encode(),
        headers={"Content-Type": "text/plain"})
    try:
        resp = urllib.request.urlopen(req, timeout=60).read()
    except Exception as e:
        fail(f"TradingView scanner request failed: {e}")
    data = json.loads(resp)
    if data.get("totalCount") != len(tickers):
        fail(f"TradingView totalCount {data.get('totalCount')} != "
             f"theme {len(tickers)}")
    out = {}
    for row in data.get("data", []):
        d = row["d"]
        if d[1] is None:
            fail(f"TradingView returned null close for {d[0]}")
        out[d[0]] = d[1]
    missing = sorted(set(tickers) - set(out))
    if missing:
        fail(f"TradingView did not resolve: {', '.join(missing)} — "
             f"STOP, never guess an exchange or drop a name")
    return out


def fetch_yahoo(symbol):
    """Yahoo chart v8, range=5y daily: closes with dates. Returns
    (price_date, closes_by_date). Range is 5y, not max: Yahoo silently
    returns WEEKLY bars for NBIS on range=max — 5y returns daily bars
    for all nine. The granularity guard below fails the run if Yahoo
    ever returns non-daily bars again."""
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{symbol}?range=5y&interval=1d")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        d = json.loads(urllib.request.urlopen(req, timeout=60).read())
    except Exception as e:
        fail(f"Yahoo chart v8 failed for {symbol}: {e}")
    try:
        r = d["chart"]["result"][0]
    except (KeyError, IndexError, TypeError):
        fail(f"Yahoo chart v8 returned no result for {symbol}")
    meta = r.get("meta") or {}
    if meta.get("dataGranularity") not in (None, "1d"):
        fail(f"{symbol}: Yahoo returned {meta.get('dataGranularity')} bars, "
             f"not daily — STOP, the price would be wrong")
    ts = r.get("timestamp") or []
    q = r["indicators"]["quote"][0]
    pairs = [(t, c) for t, c in zip(ts, q["close"]) if c is not None]
    if not pairs:
        fail(f"{symbol}: Yahoo returned zero bars")
    by_date = {}
    for t, c in pairs:
        day = datetime.datetime.fromtimestamp(
            t, datetime.timezone.utc).astimezone(ET).date()
        by_date[day.isoformat()] = c
    price_date = max(by_date)
    return price_date, by_date


def sync_sitemap(ts):
    """Add/refresh the /themes/neo-cloud sitemap entry, preserving
    everything else (the IPO sync does the same for /ipo/ entries)."""
    text = open(SITEMAP).read()
    lines = text.splitlines()
    kept = [line for line in lines
            if not re.search(r"/themes/", line)]
    out = []
    inserted = False
    for line in kept:
        out.append(line)
        if not inserted and "/screener</loc>" in line:
            out.append(
                f"<url><loc>{SITE}/themes/neo-cloud</loc>"
                f"<lastmod>{ts}</lastmod>"
                f"<changefreq>daily</changefreq><priority>0.8</priority></url>")
            inserted = True
    if not inserted:
        fail("sitemap.xml: no /screener entry to anchor the "
             "/themes/neo-cloud line")
    with open(SITEMAP, "w") as f:
        f.write("\n".join(out) + "\n")


def main():
    dry_run = "--dry-run" in sys.argv
    today_utc = datetime.date.today().isoformat()

    universe = load_json(UNIVERSE)["members"]
    tickers = [u["ticker"] for u in universe]
    tv_symbols = {u["ticker"]: u["tv_symbol"] for u in universe}
    meta = {u["ticker"]: u for u in universe}
    print(f"Theme refresh (neo-cloud): {len(tickers)} tickers"
          + (" [dry run]" if dry_run else ""))

    tv = fetch_tv(tickers, tv_symbols)
    print(f"  TradingView: {len(tv)}/{len(tickers)} resolved")

    rows = {}
    price_dates = set()
    for t in tickers:
        price_date, by_date = fetch_yahoo(t)
        price_dates.add(price_date)
        price = by_date[price_date]
        # Mid-session guard: a latest bar dated today CT before the
        # 15:00 CT close is partial — never write it as a close.
        now_ct = datetime.datetime.now(ET)
        if (price_date == now_ct.date().isoformat()
                and (now_ct.hour * 60 + now_ct.minute) < 15 * 60):
            fail(f"{t}: latest Yahoo bar is dated today and the market "
                 f"is still open (partial bar) — run after the close")
        if abs(price - tv[t]) / tv[t] > 0.005:
            fail(f"{t}: Yahoo close {price} vs TradingView "
                 f"{tv[t]} differ by >0.5%")
        # YTD base: last close of the prior calendar year.
        prev_year = int(price_date[:4]) - 1
        prior = sorted(d for d in by_date if d.startswith(str(prev_year)))
        if not prior:
            fail(f"{t}: no {prev_year} bars for the YTD base")
        ytd_base_date = prior[-1]
        ytd_base = by_date[ytd_base_date]
        m = meta[t]
        first_close = m["first_close"]
        rows[t] = {
            "price": round(price, 2),
            "ytd_base_date": ytd_base_date,
            "ytd_base_close": round(ytd_base, 2),
            "ytd_pct": round(price / ytd_base - 1, 4),
            "first_trade_date": m["first_trade_date"],
            "first_close": first_close,
            "first_close_split_adjusted":
                bool(m.get("first_close_split_adjusted")),
            "since_first_pct": round(price / first_close - 1, 4),
        }
        print(f"    {t}: ${price:,.2f} YTD {rows[t]['ytd_pct']:+.2%} "
              f"since-first {rows[t]['since_first_pct']:+.2%} "
              f"(first {m['first_trade_date']} ${first_close})")

    if len(price_dates) != 1:
        fail(f"tickers disagree on latest close date: {sorted(price_dates)}")
    price_date = price_dates.pop()

    new = {"as_of": today_utc, "price_date": price_date,
           "note": NOTE, "rows": rows}
    if dry_run:
        print(json.dumps(new, indent=1))
        print("Dry run OK — nothing written.")
        return
    stored = load_json(RESULTS) if os.path.exists(RESULTS) else None
    if stored is not None and stored.get("rows") == rows and \
            stored.get("price_date") == price_date:
        print("No changes — nothing to write.")
        return
    write_json(RESULTS, new)
    ts = (datetime.datetime.now(datetime.timezone.utc)
          .strftime("%Y-%m-%dT%H:%M:%SZ"))
    sync_sitemap(ts)
    print(f"Wrote {RESULTS} (price_date {price_date}); sitemap synced.")


if __name__ == "__main__":
    main()
