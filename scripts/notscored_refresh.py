#!/usr/bin/env python3
"""Nightly not-scored tier refresh — The Stock Check ("Not scored —
insufficient data" tier, RULEBOOK §34; separate data product).

Pulls the tier universe (lib/data/notscored_universe.json) and writes
lib/data/notscored_results.json with the latest-close snapshot per
name: price, day change, volume, price-bar count, 52-week high/low.
The tier carries NO fair value, NO verdict, NO score — the refresh
only moves prices. The reason panels, method availability and
fundamentals live in the universe file and never change here.

Sources (no key, no account), same as scripts/ipo_refresh.py:
  - TradingView scanner POST (america/scan) for close/change/volume,
    exchange prefixes from the universe file (NASDAQ Trader symdir).
  - Yahoo chart v8 (range=5y, 1d) for the bar count, the close,
    volume and 52-week high/low. Range is 5y, not max (Yahoo returns
    weekly bars for some names on max — the granularity guard fails
    the run if bars are ever non-daily).

Graduation guard: a name that appears in lib/data/results.json (a
scored card) is dropped from this tier's output with a printed note —
promotion happens through the normal engine publish path (RULEBOOK
§34), and the /stock route renders the scored card in preference, so
a graduated name leaves the tier at the next nightly run.

Fail-closed: any ticker unresolved on the scanner, any required
field null, zero Yahoo bars, a Yahoo/TV close disagreeing by >0.5%,
or tickers disagreeing on the latest close date aborts the run with
NOTHING written. Sitemap /stock entries for the tier are synced only
on a successful write (nightly_refresh.py's sitemap sync rebuilds
/stock lines from scored results only, so this script re-adds the
tier lines, sorted into the stock block, every night).

Mid-session guard: the script refuses to run while the latest Yahoo
bar is still partial (latest bar dated today CT before the 15:00 CT
close). Run it after the close, like the nightly workflow does.

Usage: python3 scripts/notscored_refresh.py [--as-of YYYY-MM-DD]
"""
import datetime
import json
import os
import re
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNIVERSE = os.path.join(REPO, "lib", "data", "notscored_universe.json")
RESULTS = os.path.join(REPO, "lib", "data", "notscored_results.json")
SCORED = os.path.join(REPO, "lib", "data", "results.json")
SITEMAP = os.path.join(REPO, "public", "sitemap.xml")
SCAN_URL = "https://scanner.tradingview.com/america/scan"
SITE = "https://www.thestockcheck.com"

ET = datetime.timezone(datetime.timedelta(hours=-5))  # America/Chicago (CST)


def fail(msg):
    print(f"NOTSCORED REFRESH FAILED: {msg}", file=sys.stderr)
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
        if d[1] is None or d[3] is None:
            fail(f"TradingView returned null close/volume for {d[0]}")
        out[d[0]] = dict(close=d[1], change_pct=d[2], volume=d[3])
    missing = sorted(set(tickers) - set(out))
    if missing:
        fail(f"TradingView did not resolve: {', '.join(missing)} — "
             f"STOP, never guess an exchange or drop a name")
    return out


def fetch_yahoo(symbol):
    """Yahoo chart v8, range=5y daily: closes, volumes, 52w high/low.
    Granularity guard fails the run on non-daily bars (see header)."""
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
             f"not daily — STOP, the bar count would be wrong")
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
    high_52w = meta.get("fiftyTwoWeekHigh") or max(closes)
    low_52w = meta.get("fiftyTwoWeekLow") or min(closes)
    return price_date, closes, pairs[-1][2], high_52w, low_52w


STOCK_LINE = re.compile(
    r"<url><loc>https://www\.thestockcheck\.com/stock/"
    r"([A-Z0-9.\-]+)</loc>")


def sync_sitemap(tickers, ts):
    """Insert the tier tickers' /stock lines into the sitemap's stock
    block, sorted, preserving everything else. nightly_refresh.py
    rebuilds the stock block from scored results only (dropping these
    lines), so this runs after it in the workflow and re-adds them.
    Tier lines for names no longer in the tier are removed."""
    text = open(SITEMAP).read()
    lines = text.splitlines()
    tier = set(tickers)
    kept = []
    for line in lines:
        m = STOCK_LINE.match(line)
        if m and m.group(1) in tier:
            continue  # re-inserted below, in sorted position
        kept.append(line)
    stock_idx = [i for i, l in enumerate(kept) if STOCK_LINE.match(l)]
    if not stock_idx:
        fail("sitemap.xml: no /stock lines to anchor the tier sync")
    def stock_line(t):
        return (f"<url><loc>{SITE}/stock/{t}</loc>"
                f"<lastmod>{ts}</lastmod><changefreq>daily</changefreq>"
                f"<priority>0.8</priority></url>")
    for t in sorted(tier):
        # find insertion point: after the last stock line whose ticker
        # sorts before t, else before the first stock line
        pos = None
        for i in [i for i, l in enumerate(kept) if STOCK_LINE.match(l)]:
            if STOCK_LINE.match(kept[i]).group(1) < t:
                pos = i
        if pos is None:
            first = next(i for i, l in enumerate(kept)
                         if STOCK_LINE.match(l))
            kept.insert(first, stock_line(t))
        else:
            kept.insert(pos + 1, stock_line(t))
    with open(SITEMAP, "w") as f:
        f.write("\n".join(kept) + "\n")
    return len(tier)


def main():
    as_of = None
    if "--as-of" in sys.argv:
        as_of = sys.argv[sys.argv.index("--as-of") + 1]
    as_of = as_of or datetime.date.today().isoformat()

    universe = load_json(UNIVERSE)["tickers"]
    scored = set(load_json(SCORED)["tickers"].keys())
    graduated = [u["ticker"] for u in universe if u["ticker"] in scored]
    for t in graduated:
        print(f"  NOTE: {t} is now a scored card — dropping it from "
              f"the not-scored tier (RULEBOOK §34 graduation)")
    universe = [u for u in universe if u["ticker"] not in scored]
    tickers = [u["ticker"] for u in universe]
    tv_symbols = {u["ticker"]: u["tv_symbol"] for u in universe}
    yh_symbols = {u["ticker"]: u["yahoo_symbol"] for u in universe}
    meta = {u["ticker"]: u for u in universe}
    print(f"Not-scored refresh: as_of={as_of}; {len(tickers)} tickers")

    tv = fetch_tv(tickers, tv_symbols)
    print(f"  TradingView: {len(tv)}/{len(tickers)} resolved")

    names = {}
    price_dates = set()
    for t in tickers:
        price_date, closes, volume, high_52w, low_52w = fetch_yahoo(
            yh_symbols[t])
        price = closes[-1]
        price_dates.add(price_date)
        if volume is None:
            fail(f"{t}: Yahoo returned null volume on the latest bar")
        now_ct = datetime.datetime.now(ET)
        if (price_date == now_ct.date().isoformat()
                and (now_ct.hour * 60 + now_ct.minute) < 15 * 60):
            fail(f"{t}: latest Yahoo bar is dated today and the market "
                 f"is still open (partial bar) — run after the close")
        if abs(price - tv[t]["close"]) / tv[t]["close"] > 0.005:
            fail(f"{t}: Yahoo close {price} vs TradingView "
                 f"{tv[t]['close']} differ by >0.5%")
        chg = tv[t]["change_pct"]
        names[t] = {
            "name": meta[t]["name"],
            "price": round(price, 2),
            "change_pct": (round(chg / 100, 4) if chg is not None
                           else None),
            "volume": int(volume) if volume is not None else None,
            "bars": len(closes),
            "high_52w": round(high_52w, 2),
            "low_52w": round(low_52w, 2),
        }
        print(f"    {t}: ${price:,.2f} bars={len(closes)} vol={volume:,}")

    if len(price_dates) != 1:
        fail(f"tickers disagree on latest close date: "
             f"{sorted(price_dates)}")
    price_date = price_dates.pop()

    new = {"as_of": as_of, "price_date": price_date,
           "universe_count": len(tickers), "tickers": names}
    stored = load_json(RESULTS) if os.path.exists(RESULTS) else None
    if stored is not None and stored.get("tickers") == names and \
            stored.get("price_date") == price_date:
        print("No changes — nothing to write.")
        return
    write_json(RESULTS, new)
    ts = (datetime.datetime.now(datetime.timezone.utc)
          .strftime("%Y-%m-%dT%H:%M:%SZ"))
    n = sync_sitemap(tickers, ts)
    print(f"Wrote {RESULTS} (price_date {price_date}); "
          f"sitemap synced ({n} tier /stock pages).")


if __name__ == "__main__":
    main()
