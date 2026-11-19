#!/usr/bin/env python3
"""Nightly ETF refresh — The Stock Check (ETF board, separate data product).

Pulls the ETF universe (lib/data/etf_universe.json) and writes
lib/data/etf_results.json with the latest-close snapshot:
price, day change, volume, relative volume, EMA20/50/200, RSI(14),
MACD, beta, 52-week high/low, 50DMA, 1W/4W/13W total returns,
1-year total return, Technical score + read, Momentum Score + read.

Sources (no key, no account):
  - TradingView scanner POST (america/scan, Content-Type: text/plain)
    for close/change/volume/EMA/RSI/MACD/beta/52w. Same pattern as the
    stock live quotes; exchange prefixes from etf_universe.json.
  - Yahoo chart v8 1y daily for returns, 50DMA, rel_vol, 1y total
    return (adjusted closes, dividends included).

Method (ETF_BOARD.md): Technical score is the stock engine's
pillar_technical exactly (scoring-engine-v1.7/engine.py):
trend 35 / vs-200d 25 / RSI 20 / MACD 20, same bands. Reads:
Strong >= 70, Mixed 40-69, Weak < 40.
Momentum Score = 0.5*13W + 0.3*4W + 0.2*1W. Reads: Building >= +5%,
Flat -5% to +5%, Fading < -5%. NO fair value, NO verdict, NO
composite score — those do not exist for ETFs.

Fail-closed PER SYMBOL (since the 2026-11-19 expansion to 175):
any ticker unresolved on the scanner, any missing Yahoo series,
fewer than 200 bars, or a Yahoo/TV close disagreeing by >0.5% is
held back with its reason — it never publishes without verified
data, and one bad symbol never blocks the rest. A held-back ticker
that already has a published record is carried forward unchanged
(stale by one close, flagged in the run log); a brand-new ticker
with no previous record is left out of the output entirely, and
the universe file must then be pruned to match so the board and
the universe never disagree. The run still aborts with nothing
written if the scanner request itself fails or zero tickers end
up with data. Sitemap ETF entries are synced only on a
successful write, for the tickers actually in the output.

Prev-close mode: the nightly run happens after the close, but a
manual run during market hours must NOT bake today's partial bar
as a "close". When the last Yahoo bar is dated today (Chicago)
and the market is still open (before 15:00 CT), that bar is
dropped and the previous bar is the close; price, day change and
volume then come from Yahoo's kept bars, and the TV agreement
check compares TV's derived previous close (close / (1 + change))
against it. TV's EMA/RSI/MACD stay live intraday values in that
mode — documented in ETF_BOARD.md — and the next nightly run
re-snapshots at the true close.

Usage: python3 scripts/etf_refresh.py [--as-of YYYY-MM-DD]
"""
import copy
import datetime
import json
import os
import re
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNIVERSE = os.path.join(REPO, "lib", "data", "etf_universe.json")
RESULTS = os.path.join(REPO, "lib", "data", "etf_results.json")
SITEMAP = os.path.join(REPO, "public", "sitemap.xml")
SCAN_URL = "https://scanner.tradingview.com/america/scan"
SITE = "https://www.thestockcheck.com"

ET = datetime.timezone(datetime.timedelta(hours=-5))  # America/Chicago (CST)
# Market close in Chicago time; the nightly run is after this, a manual
# run before it is in prev-close mode (see module docstring).
MARKET_CLOSE_CT = datetime.time(15, 0)


class TickerError(Exception):
    """One ticker's data failed verification — held back, run continues."""


def now_ct():
    return datetime.datetime.now(datetime.timezone.utc).astimezone(ET)


def fail(msg):
    print(f"ETF REFRESH FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def load_json(path):
    with open(path) as f:
        return json.load(f)


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=1)
        f.write("\n")


def band(v, table):
    for thr, s in table:
        if v <= thr:
            return s
    return table[-1][1]


def technical_score(price, ema20, ema50, ema200, rsi, macd_hist):
    """Stock engine pillar_technical, verbatim (v1.7 engine.py)."""
    if price > ema20 > ema50 > ema200:
        s_trend = 100
    elif price > ema50 > ema200:
        s_trend = 75
    elif price > ema50 or price > ema200:
        s_trend = 60
    elif price < ema20 < ema50 and price < ema200:
        s_trend = 15
    else:
        s_trend = 35
    vs200 = price / ema200 - 1
    s_vs = band(vs200, [(-0.10, 20), (0.0, 45), (0.10, 75), (999, 100)])
    if 45 <= rsi <= 60:
        s_rsi = 80
    elif 60 < rsi <= 70:
        s_rsi = 70
    elif 30 <= rsi < 45:
        s_rsi = 55
    elif rsi > 70:
        s_rsi = 40
    else:
        s_rsi = 35
    s_macd = 75 if macd_hist > 0 else 40
    score = round(0.35 * s_trend + 0.25 * s_vs + 0.20 * s_rsi + 0.20 * s_macd, 1)
    return score, {"trend_ema": s_trend, "price_vs_200d": s_vs,
                   "rsi": s_rsi, "macd": s_macd}, round(vs200, 3)


def fetch_tv(tickers, tv_symbols):
    """TradingView scanner: one batched POST for the whole universe.

    Returns (resolved, failures): resolved maps ticker -> fields,
    failures maps ticker -> reason. A symbol the scanner does not
    resolve, or one with a null required field, is a per-symbol
    failure — never a whole-run abort (see module docstring)."""
    cols = ["name", "close", "change", "volume", "EMA20", "EMA50",
            "EMA200", "RSI", "MACD.macd", "MACD.signal", "beta_1_year",
            "price_52_week_high", "price_52_week_low"]
    body = json.dumps({
        "symbols": {"tickers": [tv_symbols[t] for t in tickers]},
        "columns": cols, "options": {"lang": "en"},
        "range": [0, len(tickers)]})
    req = urllib.request.Request(
        SCAN_URL, data=body.encode(),
        headers={"Content-Type": "text/plain"})
    try:
        resp = urllib.request.urlopen(req, timeout=60).read()
    except Exception as e:
        fail(f"TradingView scanner request failed: {e}")
    data = json.loads(resp)
    out = {}
    for row in data.get("data", []):
        d = row["d"]
        out[d[0]] = dict(close=d[1], change_pct=d[2], volume=d[3],
                         ema20=d[4], ema50=d[5], ema200=d[6], rsi14=d[7],
                         macd_line=d[8], macd_signal=d[9], beta=d[10],
                         high_52w=d[11], low_52w=d[12])
    failures = {}
    for t in tickers:
        if t not in out:
            failures[t] = "TradingView did not resolve tv_symbol " \
                          f"{tv_symbols[t]}"
    for t in tickers:
        if t in failures:
            continue
        for k in ("close", "ema20", "ema50", "ema200", "rsi14",
                  "macd_line", "macd_signal", "high_52w", "low_52w"):
            if out[t][k] is None:
                failures[t] = f"TradingView returned null {k}"
                del out[t]
                break
    return out, failures


def fetch_yahoo(ticker):
    """Yahoo chart v8, 1y daily: closes, adjusted closes, volumes.

    Raises TickerError (per-symbol, held back) on any failure.
    Returns (bar_dates, closes, adjcloses, vols): bar_dates are
    Chicago dates, one per bar, in order."""
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{ticker}?range=1y&interval=1d")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        d = json.loads(urllib.request.urlopen(req, timeout=60).read())
    except Exception as e:
        raise TickerError(f"Yahoo chart v8 failed: {e}")
    try:
        r = d["chart"]["result"][0]
    except (KeyError, IndexError, TypeError):
        raise TickerError("Yahoo chart v8 returned no result")
    ts = r.get("timestamp") or []
    q = r["indicators"]["quote"][0]
    adj = r["indicators"]["adjclose"][0]["adjclose"]
    rows = [(t, c, a, v) for t, c, a, v in
            zip(ts, q["close"], adj, q["volume"]) if c is not None]
    if len(rows) < 200:
        raise TickerError(f"Yahoo returned only {len(rows)} bars (< 200)")
    dates = [datetime.datetime.fromtimestamp(
        t, datetime.timezone.utc).astimezone(ET).date() for t, _, _, _ in rows]
    closes = [c for _, c, _, _ in rows]
    adjcloses = [a for _, _, a, _ in rows]
    vols = [v for _, _, _, v in rows]
    return dates, closes, adjcloses, vols


def sync_sitemap(tickers, ts):
    """Rebuild the /etfs + /etf/[ticker] sitemap entries, preserving
    everything else (the stock refresh's sync_sitemap does the same
    for /stock/ entries and keeps these lines as 'others')."""
    text = open(SITEMAP).read()
    lines = text.splitlines()
    kept = []
    for line in lines:
        if re.search(r"/etf/|/etfs<", line):
            continue
        kept.append(line)
    # Insert the board line after the /stocks line, and the ETF pages
    # after the last /stock/ line, keeping the file sorted as before.
    out = []
    inserted_board = False
    for line in kept:
        out.append(line)
        if not inserted_board and "/stocks</loc>" in line:
            out.append(
                f"<url><loc>{SITE}/etfs</loc><lastmod>{ts}</lastmod>"
                f"<changefreq>daily</changefreq><priority>0.8</priority></url>")
            inserted_board = True
    if not inserted_board:
        fail("sitemap.xml: no /stocks entry to anchor the /etfs line")
    # ETF pages go right after the /etfs line.
    idx = next(i for i, l in enumerate(out) if "/etfs</loc>" in l)
    etf_lines = [
        f"<url><loc>{SITE}/etf/{t}</loc><lastmod>{ts}</lastmod>"
        f"<changefreq>daily</changefreq><priority>0.8</priority></url>"
        for t in sorted(tickers)]
    out[idx + 1:idx + 1] = etf_lines
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
    meta = {u["ticker"]: u for u in universe}
    print(f"ETF refresh: as_of={as_of}; {len(tickers)} tickers")

    tv, tv_failures = fetch_tv(tickers, tv_symbols)
    print(f"  TradingView: {len(tv)}/{len(tickers)} resolved")
    stored = load_json(RESULTS) if os.path.exists(RESULTS) else None
    prev_etfs = (stored or {}).get("etfs", {}) or {}

    etfs = {}
    held_back = {}   # ticker -> reason (no verified data this run)
    carried = []     # tickers carried forward on a previous record
    price_dates = set()
    for t in tickers:
        try:
            if t in tv_failures:
                raise TickerError(tv_failures[t])
            dates, closes, adjcloses, vols = fetch_yahoo(t)
            # Prev-close mode: drop today's partial bar when the market
            # is still open, so the snapshot is the last completed
            # close and never claims a close that has not happened.
            prev_close_mode = (
                dates[-1] == now_ct().date()
                and now_ct().time() < MARKET_CLOSE_CT)
            if prev_close_mode:
                dates, closes, adjcloses, vols = (
                    dates[:-1], closes[:-1], adjcloses[:-1], vols[:-1])
                if len(closes) < 200:
                    raise TickerError(
                        "only %d completed-close bars (< 200) after "
                        "dropping today's partial bar" % len(closes))
            price = closes[-1]
            if prev_close_mode:
                if tv[t]["change_pct"] is None:
                    raise TickerError(
                        "no TV day change for the prev-close check")
                tv_prev = tv[t]["close"] / (1 + tv[t]["change_pct"] / 100)
                if abs(price - tv_prev) / tv_prev > 0.005:
                    raise TickerError(
                        f"Yahoo close {price} vs TV-derived prev close "
                        f"{tv_prev:.2f} differ by >0.5%")
                # Day change and volume come from Yahoo's kept bars in
                # this mode — TV's are live intraday values.
                change_pct = closes[-1] / closes[-2] - 1
                volume = vols[-1]
            else:
                if abs(price - tv[t]["close"]) / tv[t]["close"] > 0.005:
                    raise TickerError(
                        f"Yahoo close {price} vs TradingView "
                        f"{tv[t]['close']} differ by >0.5%")
                change_pct = tv[t]["change_pct"] / 100
                volume = tv[t]["volume"]
            price_dates.add(dates[-1].isoformat())
        except TickerError as e:
            if t in prev_etfs:
                etfs[t] = prev_etfs[t]
                carried.append(t)
                print(f"    {t}: HELD BACK ({e}) — carried forward on "
                      f"the previous record")
            else:
                held_back[t] = str(e)
                print(f"    {t}: HELD BACK ({e}) — no record published")
            continue
        ret_1w = price / closes[-6] - 1
        ret_4w = price / closes[-21] - 1
        ret_13w = price / closes[-66] - 1
        ret_1y = adjcloses[-1] / adjcloses[0] - 1
        dma50 = sum(closes[-50:]) / 50
        rel_vol = None
        prior = [v for v in vols[-21:-1] if v]
        if len(prior) == 20 and vols[-1] and sum(prior) > 0:
            rel_vol = round(vols[-1] / (sum(prior) / 20), 4)
        macd_hist = tv[t]["macd_line"] - tv[t]["macd_signal"]
        tech, subs, vs200 = technical_score(
            price, tv[t]["ema20"], tv[t]["ema50"], tv[t]["ema200"],
            tv[t]["rsi14"], macd_hist)
        mom = round(0.5 * ret_13w + 0.3 * ret_4w + 0.2 * ret_1w, 4)
        etfs[t] = {
            "name": meta[t]["name"],
            "provider": meta[t]["provider"],
            "category": meta[t]["category"],
            "type": meta[t]["type"],
            "index": meta[t]["index"],
            "price": round(price, 2),
            "change_pct": round(change_pct, 4),
            "volume": volume,
            "rel_vol": rel_vol,
            "ema20": round(tv[t]["ema20"], 2),
            "ema50": round(tv[t]["ema50"], 2),
            "ema200": round(tv[t]["ema200"], 2),
            "rsi14": round(tv[t]["rsi14"], 1),
            "macd_line": round(tv[t]["macd_line"], 2),
            "macd_signal": round(tv[t]["macd_signal"], 2),
            "macd_hist": round(macd_hist, 2),
            "beta": round(tv[t]["beta"], 3) if tv[t]["beta"] is not None else None,
            "high_52w": tv[t]["high_52w"],
            "low_52w": tv[t]["low_52w"],
            "price_vs_200d_pct": vs200,
            "dma50": round(dma50, 2),
            "vs_50dma_pct": round(price / dma50 - 1, 3),
            "ret_1w": round(ret_1w, 4),
            "ret_4w": round(ret_4w, 4),
            "ret_13w": round(ret_13w, 4),
            "ret_1y_total": round(ret_1y, 4),
            "technical_score": tech,
            "technical_read": ("Strong" if tech >= 70 else
                               "Mixed" if tech >= 40 else "Weak"),
            "technical_subscores": subs,
            "momentum_score": mom,
            "momentum_read": ("Building" if mom >= 0.05 else
                              "Flat" if mom >= -0.05 else "Fading"),
        }
        print(f"    {t}: ${price:.2f} tech={tech} "
              f"{etfs[t]['technical_read']} mom={mom:+.2%} "
              f"{etfs[t]['momentum_read']}")
    if not etfs:
        fail("zero tickers with data — nothing to write")
    if len(price_dates) > 1:
        fail(f"tickers disagree on latest close date: {sorted(price_dates)}")
    price_date = price_dates.pop() if price_dates else \
        (stored or {}).get("price_date")
    if price_date is None:
        fail("no fresh tickers and no stored price_date")

    new = {"as_of": as_of, "price_date": price_date,
           "universe_count": len(etfs), "etfs": etfs}
    if stored is not None and stored.get("etfs") == etfs and \
            stored.get("price_date") == price_date:
        print("No changes — nothing to write.")
    else:
        write_json(RESULTS, new)
        ts = (datetime.datetime.now(datetime.timezone.utc)
              .strftime("%Y-%m-%dT%H:%M:%SZ"))
        n = sync_sitemap(sorted(etfs), ts)
        print(f"Wrote {RESULTS} (price_date {price_date}); "
              f"sitemap synced ({n} ETF pages + /etfs).")
    print(f"Fresh: {len(etfs) - len(carried)} tickers; "
          f"carried forward: {len(carried)}; held back: {len(held_back)}")
    if carried:
        print("  CARRIED FORWARD (stale by one close): "
              + ", ".join(sorted(carried)))
    if held_back:
        print("  HELD BACK (no record published):")
        for t in sorted(held_back):
            print(f"    {t}: {held_back[t]}")


if __name__ == "__main__":
    main()
