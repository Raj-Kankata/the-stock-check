#!/usr/bin/env python3
"""Nightly refresh for The Stock Check (Next.js static site).

Data pipeline for the GitHub Actions nightly job (~05:20 UTC). This script
does the fetching, the safety gates, the engine re-runs and the file writes.
It does NOT commit or push — the Actions workflow does that. It does NOT
write the workflow YAML either.

What refreshes nightly (this script):
  * price, price_date — latest completed daily close per ticker (yfinance)
  * technicals — EMA20/50/200, RSI14, MACD, ret_6m, ret_12m, high_52w,
    price_vs_200d_pct, recomputed from the 1y history with the EXACT
    formulas of scoring-engine-v1.3/fetch_inputs.py
  * price-derived fields — trailing_pe, forward_pe, dividend_yield from the
    new price and the stored (frozen) fundamentals; trailing_pe_adjusted
    is scaled by the price ratio (see _update_price_fields — the stored
    trailing_eps_adjusted is rounded to 2dp, so price/eps would be wrong;
    TSLA proves it: 390.22/0.98 = 398.18 != stored 399.17)
  * market snapshot — lib/data/market.json: S&P 500 / Nasdaq / Dow / VIX
    closes with prev close, point change and % change (yfinance), plus the
    10Y Treasury yield from the FRED DGS10 CSV (urllib, no key; latest
    value dated on or before the close date — FRED can lag a day, so the
    10Y's own as_of is recorded in the file and may be one trading day
    behind the indices). Refreshed in the live path only, gated the same
    way as the tickers, written at the same time as results.json.

What NEVER refreshes here (stays exactly as in base_inputs.json):
  fundamentals, Story/Financials scores, sector multiples, Damodaran ERP /
  CAPM cross-check inputs, ONEOFF adjustments, analyst / insider
  blocks. Those move on their own cadence (see README.md).

Modes:
  python3 scripts/nightly_refresh.py [--as-of YYYY-MM-DD]
      Live refresh. Fetches 1y history per ticker, recomputes, gates, runs
      both frozen engines, merges into lib/data/results.json, updates
      public/sitemap.xml lastmod, runs `npm run build` as a final gate.
      --as-of pins the refresh to that date's close (fetch end = as-of + 1d);
      without it, the refresh targets the latest completed close and
      as_of = today (UTC). A mid-session manual run NEVER uses today's
      still-trading bar: if the last bar is dated today (US/Eastern) and
      the market has not closed yet (before 16:00 ET), it is dropped.
  python3 scripts/nightly_refresh.py --dry-run [--as-of YYYY-MM-DD]
      Reproduction gate. No fetching. Re-runs both engines on the frozen
      base inputs and compares triangulated_fv / overall_score / verdict
      against the site's current lib/data/results.json for all 13 tickers.
      Exits non-zero on ANY mismatch. Default --as-of 2026-11-13.
  python3 scripts/nightly_refresh.py --check-technicals
      Informational. Fetches 1y history ending 2026-11-13 (end=2026-11-14)
      for all 13 tickers, recomputes technicals, and reports per-ticker /
      per-field match vs the stored Nov-13 technicals. The rolling-window
      start can differ slightly from the original fetch, so diffs are
      reported honestly, never fudged. Always exits 0 (unless the fetch
      itself fails).

Safety gates (live mode, checked BEFORE writing anything): any yfinance
fetch failure or empty history -> FAIL; any missing close -> FAIL; any
ticker's |new price vs stored price| > 25% day-over-day -> FAIL (likely bad
data); fewer than 200 history bars -> FAIL; any engine output missing a
ticker or with a null triangulated_fv where the stored one was non-null
-> FAIL. Market gates, same all-or-nothing rule: any index/10Y fetch
failure or missing close -> FAIL; the four indices disagreeing on the
latest close date, or disagreeing with the tickers' price_date -> FAIL;
|^GSPC/^IXIC/^DJI change_pct| > 25% -> FAIL (likely bad data); NO
magnitude gate on VIX (it can legitimately move >25% in a day) or on the
10Y. On any failure: exit non-zero and write NOTHING. Everything is
computed in memory and staged in a temp dir; files are written only after
all gates pass.

Engines are FROZEN (scoring-engine-v1.3 + v1.3-batch2, SPEC v1.1 FINAL).
This script copies them verbatim into scripts/engine/v13|batch2/engine.py
and never edits them. They read inputs.json from their own directory and
hardcode as_of "2026-11-16" / price_date "2026-11-13" in their output;
the merge step below overrides those two top-level fields in the site's
results.json with the refresh date / latest close date.
"""
import argparse
import copy
import datetime
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

import yfinance as yf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENGINE_DIR = os.path.join(ROOT, "scripts", "engine")
BASE_INPUTS = os.path.join(ENGINE_DIR, "base_inputs.json")
SITE_RESULTS = os.path.join(ROOT, "lib", "data", "results.json")
MARKET_JSON = os.path.join(ROOT, "lib", "data", "market.json")
SITEMAP = os.path.join(ROOT, "public", "sitemap.xml")

V13_TICKERS = ["NVDA", "AAPL", "MSFT", "GOOGL", "NVO"]
BATCH2_TICKERS = ["AMZN", "META", "TSLA", "AVGO", "BRK-B", "LLY", "JPM", "V"]
ALL_TICKERS = V13_TICKERS + BATCH2_TICKERS

# Market snapshot (lib/data/market.json): (yfinance symbol, display label).
MARKET_SYMBOLS = [("^GSPC", "S&P 500"), ("^IXIC", "Nasdaq"),
                  ("^DJI", "Dow"), ("^VIX", "VIX")]
FRED_DGS10_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10"
MARKET_SOURCE = "Yahoo Finance (indices, VIX); FRED DGS10 (10Y Treasury)"
MAX_INDEX_MOVE = 0.25  # |change_pct| above this for ^GSPC/^IXIC/^DJI = bad data, FAIL

MAX_DAY_MOVE = 0.25   # |new/old - 1| above this = bad data, FAIL
MIN_BARS = 200        # fetch_inputs.py requires len(close) >= 200
BASE_AS_OF = "2026-11-13"  # dry-run default: the frozen base close date

ET = ZoneInfo("America/New_York")


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def load_json(path):
    with open(path) as f:
        return json.load(f)


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


# ---------------------------------------------------------------- technicals
# EXACT formulas from scoring-engine-v1.3/fetch_inputs.py (yfinance 1y
# history, auto_adjust=False). Rounding matches the stored-inputs convention
# observed in the frozen inputs.json files: EMAs/MACD 2dp, RSI 1dp,
# pct fields 3dp, high_52w unrounded. fetch_inputs.py itself did not compute
# price_vs_200d_pct (curation added it): price/ema200 - 1, 3dp — verified
# against all 13 stored values (e.g. NVDA 162.85/205.85-1 = -0.209).
def compute_technicals(close):
    """close: pandas Series of daily closes (oldest first). Returns dict."""
    import pandas as pd  # noqa: F401  (kept local: only needed here)

    price = float(close.iloc[-1])
    ema20 = float(close.ewm(span=20, adjust=False).mean().iloc[-1])
    ema50 = float(close.ewm(span=50, adjust=False).mean().iloc[-1])
    ema200 = float(close.ewm(span=200, adjust=False).mean().iloc[-1])
    # RSI14, Wilder: ewm(alpha=1/14, adjust=False) on up/down moves
    d = close.diff()
    up = d.clip(lower=0)
    dn = -d.clip(upper=0)
    ru = up.ewm(alpha=1 / 14, adjust=False).mean()
    rd = dn.ewm(alpha=1 / 14, adjust=False).mean()
    rs = ru / rd
    rsi = float(100 - 100 / (1 + rs.iloc[-1])) if len(rs) and rd.iloc[-1] != 0 else None
    # MACD 12/26/9, ewm(adjust=False)
    e12 = close.ewm(span=12, adjust=False).mean()
    e26 = close.ewm(span=26, adjust=False).mean()
    line = e12 - e26
    sig = line.ewm(span=9, adjust=False).mean()
    macd_line = float(line.iloc[-1])
    macd_signal = float(sig.iloc[-1])
    macd_hist = float(line.iloc[-1] - sig.iloc[-1])
    return {
        "ema20": round(ema20, 2),
        "ema50": round(ema50, 2),
        "ema200": round(ema200, 2),
        "rsi14": round(rsi, 1) if rsi is not None else None,
        "macd_line": round(macd_line, 2),
        "macd_signal": round(macd_signal, 2),
        "macd_hist": round(macd_hist, 2),
        "price_vs_200d_pct": round(price / ema200 - 1, 3),
        "ret_6m": round(price / float(close.iloc[-126]) - 1, 3),
        "ret_12m": round(price / float(close.iloc[0]) - 1, 3),
        "high_52w": float(close.max()),
    }


# ------------------------------------------------------------------- fetching
def fetch_history(ticker, end=None):
    """1y daily history, auto_adjust=False. end (YYYY-MM-DD) is exclusive,
    as in yfinance: end=2026-11-14 returns bars through 2026-11-13."""
    tk = yf.Ticker(ticker)
    kwargs = {"period": "1y", "auto_adjust": False}
    if end:
        kwargs["end"] = end
    hist = tk.history(**kwargs)
    if hist is None or hist.empty or "Close" not in hist:
        fail(f"{ticker}: yfinance returned empty history (end={end})")
    return hist


def drop_intraday_bar(hist):
    """If the last bar is dated today (US/Eastern) and the market has not
    closed yet (< 16:00 ET), it is a still-trading partial bar, not a close:
    drop it so price_date is always a completed close. The 05:20 UTC
    production run is never affected (last bar is the prior close)."""
    last_date = hist.index[-1].date()
    now_et = datetime.datetime.now(ET)
    if last_date == now_et.date() and now_et.hour < 16:
        print(f"  note: dropping today's partial bar ({last_date}); "
              f"market still open, using last completed close")
        return hist.iloc[:-1]
    return hist


# ------------------------------------------------------------- price updating
def _update_price_fields(rec, new_price):
    """Recompute ONLY the price-derived fields from the new price and the
    stored (frozen) fundamentals. Everything else in rec is untouched."""
    old_price = rec["price"]
    rec["price"] = round(new_price, 2)
    if rec.get("trailing_eps"):
        rec["trailing_pe"] = round(new_price / rec["trailing_eps"], 2)
    if rec.get("forward_eps"):
        rec["forward_pe"] = round(new_price / rec["forward_eps"], 2)
    if rec.get("trailing_pe_adjusted") is not None:
        # Scale, do NOT recompute as price/trailing_eps_adjusted: the stored
        # adjusted EPS is rounded to 2dp, so that division is wrong
        # (TSLA: 390.22/0.98 = 398.18 vs stored 399.17). Scaling preserves
        # the exact original PE<->price relationship (PE ~ price, EPS fixed).
        rec["trailing_pe_adjusted"] = round(
            rec["trailing_pe_adjusted"] * new_price / old_price, 2)
    if rec.get("dividend_yield") is not None:
        # Preserves dividend-per-share: yield_new = dps / price_new.
        rec["dividend_yield"] = round(
            rec["dividend_yield"] * old_price / new_price, 4)


def refresh_ticker(base_rec, hist):
    """Apply one fetched history to a deep copy of a base ticker record.
    Returns (new_rec, last_bar_date_str). Raises SystemExit on gate trip."""
    ticker = base_rec.get("name", "?")
    close = hist["Close"]
    if len(close) < MIN_BARS:
        fail(f"{ticker}: only {len(close)} history bars (< {MIN_BARS})")
    new_price = float(close.iloc[-1])
    if new_price is None or new_price != new_price:  # NaN check
        fail(f"{ticker}: missing close")
    old_price = base_rec["price"]
    move = new_price / old_price - 1
    if abs(move) > MAX_DAY_MOVE:
        fail(f"{ticker}: price moved {move:+.1%} vs stored ${old_price:.2f} "
             f"(>${MAX_DAY_MOVE:.0%} gate — likely bad data)")
    rec = copy.deepcopy(base_rec)
    rec["technicals"] = compute_technicals(close)
    _update_price_fields(rec, new_price)
    bar_date = hist.index[-1].date().isoformat()
    rec["price_date"] = bar_date
    return rec, bar_date


# --------------------------------------------------------------------- market
def fetch_fred_dgs10(close_date):
    """Latest FRED DGS10 (10Y Treasury, %) dated on or before close_date.
    FRED can lag a day behind the close (and is blank on bond holidays,
    e.g. 2026-11-11 Veterans Day), so the returned (value, date) may be
    one trading day behind the indices — the date is recorded in
    market.json, never assumed. Returns (value_pct, as_of_str)."""
    try:
        with urllib.request.urlopen(FRED_DGS10_URL, timeout=30) as r:
            text = r.read().decode("utf-8")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        fail(f"FRED DGS10 fetch failed: {e}")
    best = None
    for line in text.splitlines():
        parts = line.strip().split(",")
        if len(parts) != 2:
            continue
        d, v = parts[0].strip(), parts[1].strip()
        if not v:  # blank = no observation that day (bond holiday)
            continue
        try:
            val = float(v)
            day = datetime.date.fromisoformat(d)
        except ValueError:
            continue
        if day <= close_date and (best is None or day > best[1]):
            best = (val, day)
    if best is None:
        fail(f"FRED DGS10: no value on or before {close_date}")
    return round(best[0], 2), best[1].isoformat()


def fetch_market(as_of_arg, end):
    """Market snapshot for the close date: the 4 index/VIX closes with
    prev close, point change and % change (yfinance), plus the 10Y from
    FRED. as_of_arg/end follow cmd_live: end is exclusive (as_of + 1d)
    when pinned, None for the latest close. Returns (market_dict,
    close_date_str). Raises SystemExit on any gate trip."""
    if as_of_arg:
        start = (datetime.date.fromisoformat(as_of_arg)
                 - datetime.timedelta(days=10)).isoformat()
    else:
        start = (datetime.date.today()
                 - datetime.timedelta(days=10)).isoformat()
    indices = []
    close_dates = set()
    for symbol, label in MARKET_SYMBOLS:
        try:
            hist = yf.Ticker(symbol).history(start=start, end=end,
                                              auto_adjust=False)
        except Exception as e:  # noqa: BLE001 — any yfinance failure is a gate trip
            fail(f"{symbol}: yfinance fetch failed: {e}")
        if hist is None or hist.empty or "Close" not in hist:
            fail(f"{symbol}: yfinance returned empty history (end={end})")
        hist = drop_intraday_bar(hist)
        close = hist["Close"]
        if len(close) < 2:
            fail(f"{symbol}: fewer than 2 bars — no prev close")
        last_close = float(close.iloc[-1])
        prev_close = float(close.iloc[-2])
        if last_close != last_close or prev_close != prev_close:  # NaN
            fail(f"{symbol}: missing close")
        c2, p2 = round(last_close, 2), round(prev_close, 2)
        ch = round(c2 - p2, 2)
        pct = round(ch / p2, 4)
        if symbol != "^VIX" and abs(pct) > MAX_INDEX_MOVE:
            fail(f"{symbol}: change {pct:+.2%} exceeds "
                 f"{MAX_INDEX_MOVE:.0%} gate — likely bad data")
        bar_date = hist.index[-1].date().isoformat()
        close_dates.add(bar_date)
        indices.append({"symbol": symbol, "label": label, "close": c2,
                        "prev_close": p2, "change": ch, "change_pct": pct})
        print(f"    {label} ({symbol}): {p2:.2f} -> {c2:.2f} "
              f"({ch:+.2f}, {pct:+.2%}), close date {bar_date}")
    if len(close_dates) != 1:
        fail(f"market indices disagree on latest close date: "
             f"{sorted(close_dates)}")
    close_date = close_dates.pop()
    close_d = datetime.date.fromisoformat(close_date)
    value_10y, as_of_10y = fetch_fred_dgs10(close_d)
    print(f"    10Y Treasury (FRED DGS10): {value_10y:.2f}% as of {as_of_10y}")
    market = {"as_of": close_date, "source": MARKET_SOURCE,
              "indices": indices,
              "treasury_10y": {"value_pct": value_10y, "as_of": as_of_10y}}
    return market, close_date


# -------------------------------------------------------------------- engines
def run_engines_staged(inputs_by_engine):
    """Run both frozen engine copies in a temp dir (no repo writes).
    inputs_by_engine: {"v13": {...inputs.json...}, "batch2": {...}}.
    Returns {"v13": results_dict, "batch2": results_dict}."""
    out = {}
    with tempfile.TemporaryDirectory(prefix="stock-check-refresh-") as tmp:
        for key, tickers in (("v13", V13_TICKERS), ("batch2", BATCH2_TICKERS)):
            d = os.path.join(tmp, key)
            os.makedirs(d)
            # engine.py is copied verbatim (md5-verified at build time);
            # stage a copy so the frozen originals are never executed in
            # place against unvalidated inputs.
            src = os.path.join(ENGINE_DIR, key, "engine.py")
            with open(src, "rb") as f:
                engine_bytes = f.read()
            with open(os.path.join(d, "engine.py"), "wb") as f:
                f.write(engine_bytes)
            write_json(os.path.join(d, "inputs.json"), inputs_by_engine[key])
            r = subprocess.run([sys.executable, "engine.py"], cwd=d)
            if r.returncode != 0:
                fail(f"engine {key} exited {r.returncode}")
            out[key] = load_json(os.path.join(d, "results.json"))
    return out


def split_inputs(all_tickers, as_of, price_date):
    """Split the 13-ticker dict into the two per-engine inputs.json dicts.
    Top-level metadata mirrors the frozen source inputs.json files."""
    base = load_json(BASE_INPUTS)
    out = {}
    for key, tickers in (("v13", V13_TICKERS), ("batch2", BATCH2_TICKERS)):
        d = {"as_of": as_of, "price_date": price_date,
             "sources": base["sources"],
             "discarded_yahoo_fields": base["discarded_yahoo_fields"],
             "capm": base["capm"],
             "tickers": {t: copy.deepcopy(all_tickers[t]) for t in tickers}}
        out[key] = d
    return out


def gate_engine_outputs(results, stored_results):
    """Engine-output gates: every ticker present; triangulated_fv non-null
    wherever the stored result had a non-null FV."""
    for key, tickers in (("v13", V13_TICKERS), ("batch2", BATCH2_TICKERS)):
        got = results[key].get("tickers", {})
        for t in tickers:
            if t not in got:
                fail(f"engine {key} output missing ticker {t}")
            fv = got[t].get("triangulated_fv")
            stored_fv = stored_results["tickers"][t]["triangulated_fv"]
            if fv is None and stored_fv is not None:
                fail(f"engine {key}: {t} triangulated_fv is null "
                     f"(stored ${stored_fv:.2f})")


def merge_results(v13_results, batch2_results, as_of, price_date):
    """Merged site results: top-level EXACTLY as v1.3's output (engine
    string, locked_set, capm_crosscheck, weights, ladder_ratios), tickers
    = v1.3's 5 + batch2's 8. as_of / price_date overridden to the refresh.
    The frozen engines do not emit the analyst-consensus block, so it is
    carried through here from the frozen base inputs (deep copy, appended
    as the last key of each ticker dict) — the same placement as the
    one-time backfill of lib/data/results.json. No number, score, FV or
    verdict is touched."""
    merged = copy.deepcopy(v13_results)
    merged["tickers"] = {**v13_results["tickers"], **batch2_results["tickers"]}
    merged["as_of"] = as_of
    merged["price_date"] = price_date
    base = load_json(BASE_INPUTS)
    for t, rec in merged["tickers"].items():
        rec["analysts"] = copy.deepcopy(base["tickers"][t]["analysts"])
    return merged


# ------------------------------------------------------------------- dry run
def cmd_dry_run(as_of):
    base = load_json(BASE_INPUTS)
    stored = load_json(SITE_RESULTS)
    inputs = split_inputs(base["tickers"], base["as_of"], base["price_date"])
    print(f"dry run: re-running both frozen engines on base inputs "
          f"(as of {base['price_date']} close), no fetching")
    results = run_engines_staged(inputs)
    merged = merge_results(results["v13"], results["batch2"],
                           stored["as_of"], stored["price_date"])
    print(f"\n{'ticker':<7} {'FV new':>10} {'FV stored':>10} "
          f"{'score new':>10} {'score stored':>12} {'verdict':>8}  result")
    n_pass = 0
    for t in ALL_TICKERS:
        new = merged["tickers"][t]
        old = stored["tickers"][t]
        ok = (new["triangulated_fv"] == old["triangulated_fv"]
              and new["overall_score"] == old["overall_score"]
              and new["verdict"] == old["verdict"])
        n_pass += ok
        print(f"{t:<7} {new['triangulated_fv']:>10.2f} {old['triangulated_fv']:>10.2f} "
              f"{new['overall_score']:>10.1f} {old['overall_score']:>12.1f} "
              f"{new['verdict']:>8}  {'PASS' if ok else 'FAIL'}")
    print(f"\ndry run: {n_pass}/13 PASS")
    if n_pass != len(ALL_TICKERS):
        fail("dry run: merged output does NOT reproduce lib/data/results.json")
    print("dry run: OK — engines reproduce all 13 FVs / scores / verdicts exactly")
    return 0


# ---------------------------------------------------------- check-technicals
TECH_FIELDS = ["ema20", "ema50", "ema200", "rsi14", "macd_line",
               "macd_signal", "macd_hist", "price_vs_200d_pct",
               "ret_6m", "ret_12m", "high_52w"]


def cmd_check_technicals():
    base = load_json(BASE_INPUTS)
    print("check-technicals: fetching 1y history ending 2026-11-13 "
          "(end=2026-11-14) and recomputing technicals with the exact "
          "fetch_inputs.py formulas; comparing vs stored Nov-13 technicals")
    n_match = n_total = 0
    for t in ALL_TICKERS:
        hist = fetch_history(t, end="2026-11-14")
        close = hist["Close"]
        first, last = hist.index[0].date(), hist.index[-1].date()
        last_close = float(close.iloc[-1])
        print(f"\n{t}: {len(close)} bars {first}..{last}, "
              f"last close ${last_close:.2f} (stored price "
              f"${base['tickers'][t]['price']:.2f})")
        if len(close) < MIN_BARS:
            print(f"  SKIP: only {len(close)} bars (< {MIN_BARS})")
            continue
        new_tech = compute_technicals(close)
        stored_tech = base["tickers"][t]["technicals"]
        for f in TECH_FIELDS:
            n_total += 1
            s, n = stored_tech.get(f), new_tech.get(f)
            match = (s == n) or (s is None and n is None)
            n_match += match
            diff = "" if match else f"  diff {n - s:+.4g}"
            print(f"  {f:<18} stored {s!s:>12}  recomputed {n!s:>12}  "
                  f"{'MATCH' if match else 'DIFF'}{diff}")
    print(f"\ncheck-technicals: {n_match}/{n_total} fields match exactly "
          f"(rounded values). Diffs, if any, come from the rolling 1y "
          f"window start differing from the original 2026-11-15 fetch — "
          f"they are reported as-is, never adjusted to match.")
    return 0


# ---------------------------------------------------------------------- live
def cmd_live(as_of_arg):
    base = load_json(BASE_INPUTS)
    stored = load_json(SITE_RESULTS)
    today_utc = datetime.date.today().isoformat()  # UTC date on this machine
    if as_of_arg:
        as_of = as_of_arg
        end = (datetime.date.fromisoformat(as_of_arg)
               + datetime.timedelta(days=1)).isoformat()
    else:
        as_of = today_utc
        end = None
    print(f"live refresh: as_of={as_of} (end={end or 'latest'})")

    # 1. Fetch + recompute everything IN MEMORY (no writes yet).
    new_tickers = {}
    bar_dates = set()
    for t in ALL_TICKERS:
        print(f"  fetching {t} ...")
        hist = fetch_history(t, end=end)
        hist = drop_intraday_bar(hist)
        rec, bar_date = refresh_ticker(base["tickers"][t], hist)
        new_tickers[t] = rec
        bar_dates.add(bar_date)
        old = base["tickers"][t]["price"]
        print(f"    {t}: ${old:.2f} -> ${rec['price']:.2f} "
              f"({rec['price'] / old - 1:+.2%}), close date {bar_date}, "
              f"{len(hist)} bars")
    if len(bar_dates) != 1:
        fail(f"tickers disagree on latest close date: {sorted(bar_dates)}")
    price_date = bar_dates.pop()

    # 1b. Market snapshot, also IN MEMORY (no writes yet). Its close date
    # must agree with the tickers' price_date — a mismatch is bad data.
    print("\n  fetching market indices + 10Y ...")
    market, market_close_date = fetch_market(as_of_arg, end)
    if market_close_date != price_date:
        fail(f"market close date {market_close_date} != ticker "
             f"price_date {price_date}")

    # 2. Run both engines staged; gate their outputs.
    inputs = split_inputs(new_tickers, as_of, price_date)
    results = run_engines_staged(inputs)
    gate_engine_outputs(results, stored)
    merged = merge_results(results["v13"], results["batch2"], as_of, price_date)

    # 3. Per-ticker summary + CHANGED flag (computed BEFORE any write, so
    #    a no-change night writes nothing at all: no as_of/lastmod bumps,
    #    no empty commit, no pointless redeploy).
    print(f"\n{'ticker':<7} {'price old->new':>22} {'FV old->new':>22} "
          f"{'verdict old->new':>20}")
    changed_tickers = False
    flips = []
    for t in ALL_TICKERS:
        old, new = stored["tickers"][t], merged["tickers"][t]
        p_ch = old["price"] != new["price"]
        f_ch = old["triangulated_fv"] != new["triangulated_fv"]
        v_ch = old["verdict"] != new["verdict"]
        changed_tickers |= p_ch or f_ch or v_ch
        if v_ch:
            flips.append(t)
        mark = "  <-- VERDICT FLIP" if v_ch else ""
        print(f"{t:<7} ${old['price']:>8.2f} -> ${new['price']:>8.2f}  "
              f"${old['triangulated_fv']:>8.2f} -> ${new['triangulated_fv']:>8.2f}  "
              f"{old['verdict']:>6} -> {new['verdict']:<6}{mark}")
    stored_market = (load_json(MARKET_JSON)
                     if os.path.exists(MARKET_JSON) else None)
    changed_market = stored_market != market
    changed = changed_tickers or changed_market
    print(f"\nCHANGED={'yes' if changed else 'no'}  "
          f"(tickers={'yes' if changed_tickers else 'no'}, "
          f"market={'yes' if changed_market else 'no'}; "
          f"as_of {stored['as_of']} -> {as_of}, "
          f"price_date {stored['price_date']} -> {price_date})")
    if flips:
        print(f"VERDICT FLIPS: {', '.join(flips)}")
    if not changed:
        print("no price / FV / verdict / market change — "
              "writing nothing; site keeps serving the last good build.")
        return 0

    # 4. Changed — now write. (Inputs + per-engine results first,
    #    then the site file, then market.json, then the sitemap.)
    if changed_tickers:
        for key in ("v13", "batch2"):
            write_json(os.path.join(ENGINE_DIR, key, "inputs.json"), inputs[key])
            write_json(os.path.join(ENGINE_DIR, key, "results.json"), results[key])
        write_json(SITE_RESULTS, merged)
    if changed_market:
        write_json(MARKET_JSON, market)
        print(f"  market.json: as_of {market['as_of']}, "
              f"10Y {market['treasury_10y']['value_pct']:.2f}% "
              f"as of {market['treasury_10y']['as_of']}")
    ts = (datetime.datetime.now(datetime.timezone.utc)
          .strftime("%Y-%m-%dT%H:%M:%SZ"))
    sitemap = open(SITEMAP).read()
    sitemap_new, n_sub = re.subn(r"<lastmod>[^<]*</lastmod>",
                                 f"<lastmod>{ts}</lastmod>", sitemap)
    if n_sub == 0:
        fail("sitemap.xml: no <lastmod> entries found to update")
    with open(SITEMAP, "w") as f:
        f.write(sitemap_new)
    print(f"  sitemap.xml: {n_sub} lastmod entries -> {ts}")

    # 5. Final gate: the site must still build.
    print("\nrunning `npm run build` ...")
    r = subprocess.run(["npm", "run", "build"], cwd=ROOT)
    if r.returncode != 0:
        fail("`npm run build` failed after refresh — a data file was "
             "written; fix the build before deploying")
    print("build: OK")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Nightly refresh for The Stock Check")
    ap.add_argument("--dry-run", action="store_true",
                    help="re-run engines on frozen base inputs; compare vs site results.json")
    ap.add_argument("--as-of", default=None,
                    help="YYYY-MM-DD: dry-run label / live-mode refresh target date")
    ap.add_argument("--check-technicals", action="store_true",
                    help="recompute Nov-13 technicals from yfinance and compare vs stored")
    args = ap.parse_args()
    if args.check_technicals:
        return cmd_check_technicals()
    if args.dry_run:
        return cmd_dry_run(args.as_of or BASE_AS_OF)
    return cmd_live(args.as_of)


if __name__ == "__main__":
    sys.exit(main())
