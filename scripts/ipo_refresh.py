#!/usr/bin/env python3
"""Nightly IPO dossier refresh — The Stock Check (IPO dossiers, separate
data product).

Pulls the IPO universe (lib/data/ipo_universe.json) and writes
lib/data/ipo_results.json with the latest-close snapshot per dossier:
price, day change, volume, price-bar count, 52-week high/low, and
market caps computed from the prospectus share counts in the universe
file (outstanding, fully diluted where sourced, float).

Sources (no key, no account):
  - TradingView scanner POST (america/scan, Content-Type: text/plain)
    for close/change/volume. Exchange prefixes from ipo_universe.json.
    All three tickers resolve as NASDAQ:* — verified 2026-11-19
    (totalCount 3). A new IPO's day change is null on the scanner
    (no previous close) — that is stored as null, never faked.
  - Yahoo chart v8 (range=max, 1d) for the bar count, the close,
    volume and 52-week high/low.

Method (IPO_DOSSIER.md): dossiers carry NO fair value, NO verdict,
NO score — the refresh only moves prices. Market caps are price x
the share counts in the universe file, which come from the
prospectuses / 10-Qs (ANT outstanding 13,219,642,276 shares per the
424B4; fully diluted ~18.1B implied by the ~$1.5T valuation at the
$83 offer price; SPCX basic 13.0759B; CRWV ~556M at Sep 30, 2026).
The bar count is the path-to-a-check progress: 200 bars is the
engine's gate, so ANT (1 bar on Nov 19) and SPCX (112 bars) are
years — no, months — from it; CRWV (415 bars) already passes it.

Fail-closed: any ticker unresolved on the scanner, any required
field null, zero Yahoo bars, a Yahoo/TV close disagreeing by >0.5%,
or tickers disagreeing on the latest close date aborts the run with
NOTHING written. Sitemap IPO entries are synced only on a successful
write.

Mid-session guard: the script refuses to run while the latest Yahoo
bar is still partial (latest bar dated today CT before the 15:00 CT
close) — a partial bar must never be written as a close. Run it
after the close, like the nightly workflow does (05:20 UTC).

Usage: python3 scripts/ipo_refresh.py [--as-of YYYY-MM-DD]
"""
import datetime
import json
import os
import re
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNIVERSE = os.path.join(REPO, "lib", "data", "ipo_universe.json")
RESULTS = os.path.join(REPO, "lib", "data", "ipo_results.json")
SITEMAP = os.path.join(REPO, "public", "sitemap.xml")
SCAN_URL = "https://scanner.tradingview.com/america/scan"
SITE = "https://www.thestockcheck.com"

ET = datetime.timezone(datetime.timedelta(hours=-5))  # America/Chicago (CST)


def fail(msg):
    print(f"IPO REFRESH FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def load_json(path):
    with open(path) as f:
        return json.load(f)


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=1)
        f.write("\n")


def fetch_tv(tickers, tv_symbols):
    """TradingView scanner: one batched POST for the whole universe."""
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
             f"universe {len(tickers)}")
    out = {}
    for row in data.get("data", []):
        d = row["d"]
        # Day change is null on a name's first trading day (no previous
        # close) — stored as null, never faked. Close and volume must
        # be present.
        if d[1] is None or d[3] is None:
            fail(f"TradingView returned null close/volume for {d[0]}")
        out[d[0]] = dict(close=d[1], change_pct=d[2], volume=d[3])
    missing = sorted(set(tickers) - set(out))
    if missing:
        fail(f"TradingView did not resolve: {', '.join(missing)} — "
             f"STOP, never guess an exchange or drop a name")
    return out


def fetch_yahoo(symbol):
    """Yahoo chart v8, range=max daily: closes, volumes, 52w high/low.
    No 200-bar gate here — these names have few bars by design (ANT
    has 1 on its first day). Fail only on zero bars."""
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{symbol}?range=max&interval=1d")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        d = json.loads(urllib.request.urlopen(req, timeout=60).read())
    except Exception as e:
        fail(f"Yahoo chart v8 failed for {symbol}: {e}")
    try:
        r = d["chart"]["result"][0]
    except (KeyError, IndexError, TypeError):
        fail(f"Yahoo chart v8 returned no result for {symbol}")
    ts = r.get("timestamp") or []
    q = r["indicators"]["quote"][0]
    pairs = [(t, c, v) for t, c, v in
             zip(ts, q["close"], q.get("volume") or [None] * len(ts))
             if c is not None]
    if not pairs:
        fail(f"{symbol}: Yahoo returned zero bars")
    closes = [p[1] for p in pairs]
    last_ts = pairs[-1][0]
    price_date = datetime.datetime.fromtimestamp(
        last_ts, datetime.timezone.utc).astimezone(ET).date().isoformat()
    meta = r.get("meta") or {}
    high_52w = meta.get("fiftyTwoWeekHigh") or max(closes)
    low_52w = meta.get("fiftyTwoWeekLow") or min(closes)
    return price_date, closes, pairs[-1][2], high_52w, low_52w


def sync_sitemap(tickers, ts):
    """Rebuild the /ipos + /ipo/[ticker] sitemap entries, preserving
    everything else (the index sync does the same for /index/ entries
    and keeps these lines as 'others')."""
    text = open(SITEMAP).read()
    lines = text.splitlines()
    kept = []
    for line in lines:
        if re.search(r"/ipo/|/ipos<", line):
            continue
        kept.append(line)
    out = []
    inserted_board = False
    for line in kept:
        out.append(line)
        if not inserted_board and "/indexes</loc>" in line:
            out.append(
                f"<url><loc>{SITE}/ipos</loc><lastmod>{ts}</lastmod>"
                f"<changefreq>daily</changefreq><priority>0.8</priority></url>")
            inserted_board = True
    if not inserted_board:
        fail("sitemap.xml: no /indexes entry to anchor the /ipos line")
    idx = next(i for i, l in enumerate(out) if "/ipos</loc>" in l)
    idx_lines = [
        f"<url><loc>{SITE}/ipo/{t}</loc><lastmod>{ts}</lastmod>"
        f"<changefreq>daily</changefreq><priority>0.8</priority></url>"
        for t in sorted(tickers)]
    out[idx + 1:idx + 1] = idx_lines
    with open(SITEMAP, "w") as f:
        f.write("\n".join(out) + "\n")
    return len(tickers)


def main():
    as_of = None
    if "--as-of" in sys.argv:
        as_of = sys.argv[sys.argv.index("--as-of") + 1]
    today_utc = datetime.date.today().isoformat()
    as_of = as_of or today_utc

    universe = load_json(UNIVERSE)["universe"]
    tickers = [u["ticker"] for u in universe]
    tv_symbols = {u["ticker"]: u["tv_symbol"] for u in universe}
    yh_symbols = {u["ticker"]: u["yahoo_symbol"] for u in universe}
    meta = {u["ticker"]: u for u in universe}
    print(f"IPO refresh: as_of={as_of}; {len(tickers)} tickers")

    tv = fetch_tv(tickers, tv_symbols)
    print(f"  TradingView: {len(tv)}/{len(tickers)} resolved")

    ipos = {}
    price_dates = set()
    for t in tickers:
        price_date, closes, volume, high_52w, low_52w = fetch_yahoo(yh_symbols[t])
        price = closes[-1]
        price_dates.add(price_date)
        if volume is None:
            fail(f"{t}: Yahoo returned null volume on the latest bar")
        # Mid-session guard: a latest bar dated today CT before the
        # 15:00 CT close is partial — never write it as a close.
        now_ct = datetime.datetime.now(ET)
        if (price_date == now_ct.date().isoformat()
                and (now_ct.hour * 60 + now_ct.minute) < 15 * 60):
            fail(f"{t}: latest Yahoo bar is dated today and the market "
                 f"is still open (partial bar) — run after the close")
        if abs(price - tv[t]["close"]) / tv[t]["close"] > 0.005:
            fail(f"{t}: Yahoo close {price} vs TradingView "
                 f"{tv[t]['close']} differ by >0.5%")
        chg = tv[t]["change_pct"]
        m = meta[t]
        mc_out = price * m["shares_outstanding"]
        mc_fd = (price * m["shares_fully_diluted_approx"]
                 if m.get("shares_fully_diluted_approx") else None)
        mc_float = price * m["shares_float"]
        ipos[t] = {
            "name": m["name"],
            "company": m["company"],
            "sector": m["sector"],
            "price": round(price, 2),
            "change_pct": (round(chg / 100, 4) if chg is not None else None),
            "volume": int(volume) if volume is not None else None,
            "bars": len(closes),
            "high_52w": round(high_52w, 2),
            "low_52w": round(low_52w, 2),
            "market_cap_outstanding_usd": round(mc_out),
            "market_cap_fully_diluted_usd": (
                round(mc_fd) if mc_fd is not None else None),
            "market_cap_float_usd": round(mc_float),
        }
        print(f"    {t}: ${price:,.2f} bars={len(closes)} "
              f"vol={volume:,} mcap_out=${mc_out:,.0f}")

    if len(price_dates) != 1:
        fail(f"tickers disagree on latest close date: {sorted(price_dates)}")
    price_date = price_dates.pop()

    new = {"as_of": as_of, "price_date": price_date,
           "universe_count": len(tickers), "ipos": ipos}
    stored = load_json(RESULTS) if os.path.exists(RESULTS) else None
    if stored is not None and stored.get("ipos") == ipos and \
            stored.get("price_date") == price_date:
        print("No changes — nothing to write.")
        return
    write_json(RESULTS, new)
    ts = (datetime.datetime.now(datetime.timezone.utc)
          .strftime("%Y-%m-%dT%H:%M:%SZ"))
    n = sync_sitemap(tickers, ts)
    print(f"Wrote {RESULTS} (price_date {price_date}); "
          f"sitemap synced ({n} IPO pages + /ipos).")


if __name__ == "__main__":
    main()
