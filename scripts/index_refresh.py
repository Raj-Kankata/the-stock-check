#!/usr/bin/env python3
"""Nightly index refresh — The Stock Check (index board, separate data product).

Pulls the 6-index universe (lib/data/index_universe.json) and writes
lib/data/index_results.json with the latest-close snapshot:
level, day change, EMA20/50/200, RSI(14), MACD, 52-week high/low,
50DMA, 1W/4W/13W returns, Technical score + read, Momentum Score + read
for the five price indexes; and a VIX regime block (VIX, VIX3M, ratio,
curve state, expected daily SPX move) for VIX.

Sources (no key, no account):
  - TradingView scanner POST (america/scan, Content-Type: text/plain)
    for level/change/EMA/RSI/MACD/52w. Same pattern as the stock live
    quotes and the ETF refresh; exchange prefixes from index_universe.json.
    Russell 2000 resolves ONLY as FTSE:RUT (TVC:RUT, CBOE:RUT, AMEX:RUT
    and plain RUT all return nothing — verified 2026-11-19).
  - Yahoo chart v8 1y daily for returns, 50DMA and ^VIX3M.

Method (INDEX_BOARD.md): Technical score is the stock engine's
pillar_technical exactly (scoring-engine-v1.8/engine.py):
trend 35 / vs-200d 25 / RSI 20 / MACD 20, same bands. Reads:
Strong >= 70, Mixed 40-69, Weak < 40.
Momentum Score = 0.5*13W + 0.3*4W + 0.2*1W. Reads: Building >= +5%,
Flat -5% to +5%, Fading < -5%. NO fair value, NO verdict, NO
composite score — those do not exist for indexes. VIX carries NO
Technical or Momentum score: scored naively it reads "Strong" when
fear spikes, which is backwards. It gets a regime read instead, on
the site's 5-band scale (Calm <15, Normal 15-20, Elevated 20-30,
High 30-40, Extreme >40 — same as /pulse), plus VIX3M, the VIX/VIX3M
ratio and curve state, and the expected daily SPX move (VIX/sqrt(252)).

Fail-closed: any ticker unresolved on the scanner, any required
field null, fewer than 200 Yahoo bars, a Yahoo/TV close disagreeing
by >0.5%, or tickers disagreeing on the latest close date aborts
the run with NOTHING written. Sitemap index entries are synced only
on a successful write.

Seed mode (--seed YYYY-MM-DD): the launch seed only. The nightly
script is a close snapshot and cannot run mid-session (the latest
Yahoo bar would be a partial bar and the scanner values live), so
the seed fetches Yahoo history only, truncates bars to the seed
date, and computes EMA/RSI/MACD locally from closes with the
engine's formulas. From the first nightly run, all technicals come
from the TradingView scanner like the ETF board. The seed prints its
VIX3M so it can be checked against the morning briefing's
verified-close series (Nov 18 close: 24.29).

Usage: python3 scripts/index_refresh.py [--as-of YYYY-MM-DD]
       python3 scripts/index_refresh.py --seed YYYY-MM-DD
"""
import copy
import datetime
import json
import math
import os
import re
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNIVERSE = os.path.join(REPO, "lib", "data", "index_universe.json")
RESULTS = os.path.join(REPO, "lib", "data", "index_results.json")
SITEMAP = os.path.join(REPO, "public", "sitemap.xml")
SCAN_URL = "https://scanner.tradingview.com/america/scan"
SITE = "https://www.thestockcheck.com"

ET = datetime.timezone(datetime.timedelta(hours=-5))  # America/Chicago (CST)


def fail(msg):
    print(f"INDEX REFRESH FAILED: {msg}", file=sys.stderr)
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


def ema_series(closes, period):
    """Standard EMA (k = 2/(N+1)), seeded with the SMA of the first N closes."""
    k = 2.0 / (period + 1)
    out = []
    seed = sum(closes[:period]) / period
    out.append(seed)
    for c in closes[period:]:
        out.append(c * k + out[-1] * (1 - k))
    return out


def rsi_wilder(closes, period=14):
    """Wilder's RSI(14) from daily closes, smoothed to the latest bar."""
    gains = []
    losses = []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0.0))
        losses.append(max(-d, 0.0))
    avg_g = sum(gains[:period]) / period
    avg_l = sum(losses[:period]) / period
    for g, l in zip(gains[period:], losses[period:]):
        avg_g = (avg_g * (period - 1) + g) / period
        avg_l = (avg_l * (period - 1) + l) / period
    rs = avg_g / avg_l if avg_l else float("inf")
    return 100 - 100 / (1 + rs)


def macd_hist(closes):
    """MACD(12,26,9) histogram from daily closes."""
    e12 = ema_series(closes, 12)
    e26 = ema_series(closes, 26)
    # Align: e12 starts at index 11, e26 at index 25.
    macd_line = [e12[i + 14] - e26[i] for i in range(len(e26))]
    sig = ema_series(macd_line, 9)
    return macd_line[-1], sig[-1], macd_line[-1] - sig[-1]


def fetch_tv(tickers, tv_symbols):
    """TradingView scanner: one batched POST for the whole universe."""
    cols = ["name", "close", "change", "EMA20", "EMA50", "EMA200",
            "RSI", "MACD.macd", "MACD.signal",
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
    if data.get("totalCount") != len(tickers):
        fail(f"TradingView totalCount {data.get('totalCount')} != "
             f"universe {len(tickers)}")
    out = {}
    for row in data.get("data", []):
        d = row["d"]
        out[d[0]] = dict(close=d[1], change_pct=d[2],
                         ema20=d[3], ema50=d[4], ema200=d[5], rsi14=d[6],
                         macd_line=d[7], macd_signal=d[8],
                         high_52w=d[9], low_52w=d[10])
    missing = sorted(set(tickers) - set(out))
    if missing:
        fail(f"TradingView did not resolve: {', '.join(missing)} — "
             f"STOP, never guess an exchange or drop a name")
    for t in tickers:
        for k in ("close", "ema20", "ema50", "ema200", "rsi14",
                  "macd_line", "macd_signal", "high_52w", "low_52w"):
            if out[t][k] is None:
                fail(f"TradingView returned null {k} for {t}")
    return out


def fetch_yahoo(symbol, truncate_to=None):
    """Yahoo chart v8, 1y daily: closes + timestamps. With truncate_to
    (a date string), bars after that date are dropped (seed mode)."""
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{symbol}?range=1y&interval=1d")
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
    pairs = [(t, c) for t, c in zip(ts, q["close"]) if c is not None]
    if truncate_to:
        pairs = [(t, c) for t, c in pairs
                 if datetime.datetime.fromtimestamp(
                     t, datetime.timezone.utc).astimezone(ET).date()
                 <= datetime.date.fromisoformat(truncate_to)]
    if len(pairs) < 200:
        fail(f"{symbol}: Yahoo returned only {len(pairs)} bars (< 200)")
    closes = [p[1] for p in pairs]
    last_ts = pairs[-1][0]
    price_date = datetime.datetime.fromtimestamp(
        last_ts, datetime.timezone.utc).astimezone(ET).date().isoformat()
    return price_date, closes


def sync_sitemap(tickers, ts):
    """Rebuild the /indexes + /index/[ticker] sitemap entries, preserving
    everything else (the ETF sync does the same for /etf/ entries and
    keeps these lines as 'others')."""
    text = open(SITEMAP).read()
    lines = text.splitlines()
    kept = []
    for line in lines:
        if re.search(r"/index/|/indexes<", line):
            continue
        kept.append(line)
    out = []
    inserted_board = False
    for line in kept:
        out.append(line)
        if not inserted_board and "/etfs</loc>" in line:
            out.append(
                f"<url><loc>{SITE}/indexes</loc><lastmod>{ts}</lastmod>"
                f"<changefreq>daily</changefreq><priority>0.8</priority></url>")
            inserted_board = True
    if not inserted_board:
        fail("sitemap.xml: no /etfs entry to anchor the /indexes line")
    idx = next(i for i, l in enumerate(out) if "/indexes</loc>" in l)
    idx_lines = [
        f"<url><loc>{SITE}/index/{t}</loc><lastmod>{ts}</lastmod>"
        f"<changefreq>daily</changefreq><priority>0.8</priority></url>"
        for t in sorted(tickers)]
    out[idx + 1:idx + 1] = idx_lines
    with open(SITEMAP, "w") as f:
        f.write("\n".join(out) + "\n")
    return len(tickers)


def vix_regime(vix):
    if vix < 15:
        return "Calm"
    if vix < 20:
        return "Normal"
    if vix < 30:
        return "Elevated"
    if vix < 40:
        return "High"
    return "Extreme"


def main():
    seed = None
    if "--seed" in sys.argv:
        seed = sys.argv[sys.argv.index("--seed") + 1]
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
    print(f"Index refresh: as_of={as_of}; seed={seed}; {len(tickers)} tickers")

    tv = None
    if not seed:
        tv = fetch_tv(tickers, tv_symbols)
        print(f"  TradingView: {len(tv)}/{len(tickers)} resolved")
    else:
        print("  Seed mode: Yahoo only, technicals computed from closes")

    indexes = {}
    price_dates = set()
    for t in tickers:
        price_date, closes = fetch_yahoo(yh_symbols[t], truncate_to=seed)
        price = closes[-1]
        price_dates.add(price_date)
        ret_1w = price / closes[-6] - 1
        ret_4w = price / closes[-21] - 1
        ret_13w = price / closes[-66] - 1
        ret_1y = price / closes[0] - 1
        dma50 = sum(closes[-50:]) / 50
        high_52w = max(closes)
        low_52w = min(closes)
        if t == "VIX":
            continue  # VIX is filled after SPX is known (expected move)
        if tv is not None:
            if abs(price - tv[t]["close"]) / tv[t]["close"] > 0.005:
                fail(f"{t}: Yahoo close {price} vs TradingView "
                     f"{tv[t]['close']} differ by >0.5%")
            ema20, ema50, ema200 = tv[t]["ema20"], tv[t]["ema50"], tv[t]["ema200"]
            rsi14 = tv[t]["rsi14"]
            macd_line, macd_signal = tv[t]["macd_line"], tv[t]["macd_signal"]
            high_52w, low_52w = tv[t]["high_52w"], tv[t]["low_52w"]
        else:
            ema20 = ema_series(closes, 20)[-1]
            ema50 = ema_series(closes, 50)[-1]
            ema200 = ema_series(closes, 200)[-1]
            rsi14 = rsi_wilder(closes)
            macd_line, macd_signal, _ = macd_hist(closes)
        macd_hist_v = macd_line - macd_signal
        tech, subs, vs200 = technical_score(
            price, ema20, ema50, ema200, rsi14, macd_hist_v)
        mom = round(0.5 * ret_13w + 0.3 * ret_4w + 0.2 * ret_1w, 4)
        indexes[t] = {
            "name": meta[t]["name"],
            "provider": meta[t]["provider"],
            "category": meta[t]["category"],
            "type": meta[t]["type"],
            "index": meta[t]["index"],
            "price": round(price, 2),
            "change_pct": round((tv[t]["change_pct"] / 100 if tv is not None
                                 else price / closes[-2] - 1), 4),
            "ema20": round(ema20, 2),
            "ema50": round(ema50, 2),
            "ema200": round(ema200, 2),
            "rsi14": round(rsi14, 1),
            "macd_line": round(macd_line, 2),
            "macd_signal": round(macd_signal, 2),
            "macd_hist": round(macd_hist_v, 2),
            "high_52w": round(high_52w, 2),
            "low_52w": round(low_52w, 2),
            "price_vs_200d_pct": vs200,
            "dma50": round(dma50, 2),
            "vs_50dma_pct": round(price / dma50 - 1, 3),
            "ret_1w": round(ret_1w, 4),
            "ret_4w": round(ret_4w, 4),
            "ret_13w": round(ret_13w, 4),
            "ret_1y": round(ret_1y, 4),
            "technical_score": tech,
            "technical_read": ("Strong" if tech >= 70 else
                               "Mixed" if tech >= 40 else "Weak"),
            "technical_subscores": subs,
            "momentum_score": mom,
            "momentum_read": ("Building" if mom >= 0.05 else
                              "Flat" if mom >= -0.05 else "Fading"),
        }
        print(f"    {t}: {price:,.2f} tech={tech} "
              f"{indexes[t]['technical_read']} mom={mom:+.2%} "
              f"{indexes[t]['momentum_read']}")

    if len(price_dates) != 1:
        fail(f"tickers disagree on latest close date: {sorted(price_dates)}")
    price_date = price_dates.pop()

    # VIX regime block (no Technical / Momentum score — see docstring).
    vix_date, vix_closes = fetch_yahoo("^VIX", truncate_to=seed)
    vix = vix_closes[-1]
    if vix_date != price_date:
        fail(f"VIX price_date {vix_date} != index price_date {price_date}")
    vix3m_date, vix3m_closes = fetch_yahoo("^VIX3M", truncate_to=seed)
    vix3m = vix3m_closes[-1]
    if vix3m_date != price_date:
        fail(f"VIX3M price_date {vix3m_date} != index price_date {price_date}")
    if tv is not None:
        if abs(vix - tv["VIX"]["close"]) / tv["VIX"]["close"] > 0.005:
            fail(f"VIX: Yahoo close {vix} vs TradingView "
                 f"{tv['VIX']['close']} differ by >0.5%")
    spx_close = indexes["SPX"]["price"]
    ratio = round(vix / vix3m, 3)
    # VIX is quoted in percent points (24.56 = 24.56% annualised), so the
    # daily move as a fraction is VIX / sqrt(252) / 100.
    exp_move_pct = round(vix / math.sqrt(252) / 100, 4)
    indexes["VIX"] = {
        "name": meta["VIX"]["name"],
        "provider": meta["VIX"]["provider"],
        "category": meta["VIX"]["category"],
        "type": meta["VIX"]["type"],
        "index": meta["VIX"]["index"],
        "price": round(vix, 2),
        "change_pct": round((tv["VIX"]["change_pct"] / 100 if tv is not None
                             else vix / vix_closes[-2] - 1), 4),
        "high_52w": round(max(vix_closes), 2),
        "low_52w": round(min(vix_closes), 2),
        "vix3m": round(vix3m, 2),
        "vix_vix3m_ratio": ratio,
        "curve_state": "Contango" if ratio < 1 else "Backwardation",
        "regime": vix_regime(vix),
        "expected_move_pct": exp_move_pct,
        "expected_move_points": round(exp_move_pct * spx_close, 1),
    }
    print(f"    VIX: {vix:.2f} {indexes['VIX']['regime']} · VIX3M {vix3m:.2f} · "
          f"ratio {ratio} {indexes['VIX']['curve_state']} · expected SPX move "
          f"±{exp_move_pct:.2%} (±{indexes['VIX']['expected_move_points']} pts)")

    new = {"as_of": as_of, "price_date": price_date,
           "universe_count": len(tickers), "indexes": indexes}
    stored = load_json(RESULTS) if os.path.exists(RESULTS) else None
    if stored is not None and stored.get("indexes") == indexes and \
            stored.get("price_date") == price_date:
        print("No changes — nothing to write.")
        return
    write_json(RESULTS, new)
    ts = (datetime.datetime.now(datetime.timezone.utc)
          .strftime("%Y-%m-%dT%H:%M:%SZ"))
    n = sync_sitemap(tickers, ts)
    print(f"Wrote {RESULTS} (price_date {price_date}); "
          f"sitemap synced ({n} index pages + /indexes).")


if __name__ == "__main__":
    main()
