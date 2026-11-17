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
  * market_cap — RECOMPUTED every refresh as fresh price x
    shares_implied_total (from base_inputs.json); never frozen. Null if
    shares are missing for a ticker.
  * rel_vol — COMPUTED every refresh from the same final yfinance daily
    bars the refresh publishes (after the intraday-bar drop): latest-day
    volume / mean volume of the 20 trading days PRECEDING the latest bar
    (excluding the latest day), rounded to 4dp. Null if fewer than 20
    prior bars. As-of = price date.
  * debt_fcf, indexes — FROZEN passthrough, copied from base_inputs.json
    into results.json on every refresh (quarterly cadence, NOT nightly);
    never recomputed from prices. Missing in older files -> null.
  * market snapshot — lib/data/market.json: S&P 500 / Nasdaq / Dow / VIX
    closes with prev close, point change and % change (yfinance), plus the
    10Y Treasury yield from the FRED DGS10 CSV (urllib, no key; latest
    value dated on or before the close date — FRED can lag a day, so the
    10Y's own as_of is recorded in the file and may be one trading day
    behind the indices). Refreshed in the live path only, gated the same
    way as the tickers, written at the same time as results.json.
  * macro snapshot — lib/data/macro.json: SPY close + 50/200-day EMAs
    (yfinance, same formulas as compute_technicals), VIX daily close
    (FRED VIXCLS), HY + IG credit spreads with 1-month-ago values (FRED
    BAMLH0A0HYM2 / BAMLC0A0CM), and the 4-component macro composite
    (FRED GDP / INDPRO / UNRATE / RSAFS — each scored favorable when it
    moved the right way vs its previous release), plus per-ticker 50-day
    EMA + 52-week high and the 227-name advance/decline counts for the
    Market Pulse page. Same all-or-nothing gates; written with the
    market snapshot whenever it changed.

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
      Reproduction gate. No fetching. Re-runs the frozen engines on the
      frozen base inputs and compares triangulated_fv / overall_score /
      verdict against the site's current lib/data/results.json for all
      227 tickers. Exits non-zero on ANY mismatch. Default --as-of
      2026-11-13. (The engines' own TICKERS lists are patched in the
      staged temp-dir copies only — see "Staging" below.)
  python3 scripts/nightly_refresh.py --check-technicals
      Informational. Fetches 1y history ending 2026-11-13 (end=2026-11-14)
      for all 227 tickers, recomputes technicals, and reports per-ticker /
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

Staging (Phase 2, 227 tickers): the frozen engines hardcode their own
ticker lists (v1.3: 5 names incl. NVO; batch2: 8 names incl. JPM) and
batch2 hardcodes a COMPLETENESS dict for those 8 names only — so a
verbatim run against the 227-ticker base would KeyError on the removed
names. run_engines_staged therefore patches the STAGED temp-dir copies
only (the repo originals are never edited): each staged copy's single
TICKERS = [...] line is replaced with the tickers that run scores
(v1.3: its 4 continuing names; batch2: all 227, derived from
base_inputs.json), and batch2's COMPLETENESS literal is replaced with
the rule-derived dict (see completeness_for). Both patches are
single-substitution and asserted — a staging failure aborts the run
before anything is written. Values are unaffected: the patched batch2
run reproduces the frozen 13 exactly (Phase 1 regression PASS) and the
dry run re-verifies all 227 every time. One known text-only wart: the
frozen batch2 engine's sensitivity-grid NOTE prints the low-beta 10.0%
discount for every non-NVDA ticker, even the 21 live names whose raw
beta >= 2.0 puts them on the 12.0% tier (the grid VALUES use the right
tier). The staged batch2 copy applies that fix to the grid note only
(see _stage_engine); the DCF skip-reason change is not applied,
since no live name has a skipped DCF leg.
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
MACRO_JSON = os.path.join(ROOT, "lib", "data", "macro.json")
SITEMAP = os.path.join(ROOT, "public", "sitemap.xml")

# The tickers the v1.3 engine scores in its own subprocess run. These MUST
# stay exactly the v1.3 engine's own TICKERS list minus removed NVO: the
# staged copy's TICKERS line is patched to this list (see _stage_engine).
V13_TICKERS = ["NVDA", "AAPL", "MSFT", "GOOGL"]
# The batch2 engine scores EVERY live ticker (its discount tier, DCF/PEGY/
# Forward legs, quality, technical and verdict code are already generalised;
# only its TICKERS list and COMPLETENESS dict are per-ticker). Its list is
# derived from base_inputs.json at run time — see load_all_tickers() — and
# is never hardcoded here, so it cannot go stale when the base changes.
# NVO and JPM appear in NO list in this file: both were removed from the
# live set under Phase 2 Option A (2-leg names, unpublished).

# Market snapshot (lib/data/market.json): (yfinance symbol, display label).
MARKET_SYMBOLS = [("^GSPC", "S&P 500"), ("^IXIC", "Nasdaq"),
                  ("^DJI", "Dow"), ("^VIX", "VIX")]
FRED_DGS10_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10"
FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id="
MARKET_SOURCE = "Yahoo Finance (indices, VIX); FRED DGS10 (10Y Treasury)"
MACRO_SOURCE = ("FRED (VIXCLS, BAMLH0A0HYM2, BAMLC0A0CM, GDP, INDPRO, "
                "UNRATE, RSAFS); Yahoo Finance (SPY)")
# Macro composite components: (FRED series, display label, change unit).
# Change is QoQ for GDP (quarterly), MoM for INDPRO / UNRATE / RSAFS.
# Favorable = the component moved the right way vs its previous release:
# GDP up, industrial production up, unemployment DOWN, retail sales up.
# There is NO FRED series "MEI" (it returns HTML) — the composite is
# built from these four real series instead, and the page prints the rule.
MACRO_COMPONENTS = [
    ("GDP", "GDP (nominal, $bn, SAAR)", "pct", True),
    ("INDPRO", "Industrial production (index)", "pct", True),
    ("UNRATE", "Unemployment rate (%)", "pp", False),
    ("RSAFS", "Retail sales ($m, SA)", "pct", True),
]
CREDIT_SERIES = [
    ("BAMLH0A0HYM2", "High-yield OAS"),
    ("BAMLC0A0CM", "Investment-grade OAS"),
]
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


def load_all_tickers():
    """All live tickers, derived from base_inputs.json (sorted). No
    hardcoded list: adding or removing a ticker from the base is enough
    to change the nightly universe — the script never needs a list edit."""
    return sorted(load_json(BASE_INPUTS)["tickers"])


def live_tickers(base, stored):
    """The live ticker set, with a fail-closed agreement check: the base
    inputs and the site results must cover exactly the same tickers, or
    something upstream changed without a matching merge — do not proceed."""
    all_t = sorted(base["tickers"])
    if all_t != sorted(stored["tickers"]):
        fail(f"base_inputs.json ({len(all_t)} tickers) and results.json "
             f"({len(stored['tickers'])} tickers) disagree on the live set")
    return all_t


def completeness_for(t, frag):
    """Trust-completeness subscore for one ticker (METHOD-batch2 §1).
    80 where a ONEOFF-v1 adjustment was applied (net_income_ttm_adjusted
    set); otherwise 100 less 10 per gap (DCF leg skipped — counted once,
    whatever the cause; empty insider feed), floored at 65. Reproduces
    the frozen 13 exactly (GOOGL/AMZN/META/TSLA/AVGO/BRK-B 80;
    NVDA/AAPL/MSFT/LLY/V 100) and the refresh provenance for all 227
    live tickers (verified 227/227 before this rule was wired in).
    Limitation: a dividend-yield override gap is not visible in base
    fragments, so it is not counted here — no live ticker has one
    (verified vs refresh provenance, where all 227 have zero gaps)."""
    if frag.get("net_income_ttm_adjusted"):
        return 80
    gaps = 0
    if (frag.get("fcf_per_share_ttm") is None
            or frag.get("implied_5y_eps_growth") is None
            or frag.get("beta") is None):
        gaps += 1
    if (frag.get("insider_90d") or {}).get("n_rows", 0) == 0:
        gaps += 1
    return {0: 100, 1: 90, 2: 75}.get(gaps, 65)


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


# ------------------------------------------------------- rel_vol / market cap
# rel_vol definition (EXACT — the data worker's one-off values must match
# this): rel_vol = round(latest-day Volume / mean(Volume of the 20 trading
# days PRECEDING the latest bar, excluding the latest day), 4). Computed
# from the SAME final bar set the refresh publishes — i.e. the history
# AFTER drop_intraday_bar has removed a still-trading partial bar, so the
# "latest bar" is always a completed close and as-of = price_date. Null
# if fewer than 20 prior bars, if the Volume column is absent, or if any
# volume involved is missing / the 20-day mean is 0. A null rel_vol is
# NOT a gate trip (live runs always have >= 200 bars, so >= 199 priors).
# Rounding is 4dp: verified 2026-11-16 against the data worker's stored
# values — latest/mean(prior 20) at 4dp reproduces NVDA 1.5869, AAPL
# 0.9733, MSFT 1.1509, TSLA 0.7648, XOM 1.0074 exactly on the Nov-16
# bars (their one-off values are as of the Nov-16 close, not Nov-13).
def compute_rel_vol(hist):
    """hist: yfinance daily history (already intraday-bar-dropped)."""
    try:
        vol = hist["Volume"]
    except (KeyError, TypeError):
        return None
    if len(vol) < 21:
        return None
    latest = vol.iloc[-1]
    prior = vol.iloc[-21:-1]
    if latest is None or latest != latest:  # NaN check
        return None
    prior = prior.dropna()
    if len(prior) < 20:
        return None
    mean_prior = float(prior.mean())
    if not mean_prior:
        return None
    return round(float(latest) / mean_prior, 4)


def compute_market_cap(price, shares):
    """Market cap in USD: fresh price x shares_implied_total, rounded to
    2dp (price is already 2dp and shares are ints, so this is exact).
    Null if shares are missing / non-numeric — never a gate trip."""
    if shares is None:
        return None
    try:
        return round(float(price) * float(shares), 2)
    except (TypeError, ValueError):
        return None


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
    # New fields (see module docstring). rec is a deepcopy of base_rec, so
    # frozen fields already present in the base survive automatically; the
    # explicit .get(..., None) assignments below guarantee the keys exist
    # (as null) even in older base files that predate the fields, and
    # deepcopy the values so later mutation cannot alias the base.
    # market_cap uses the ROUNDED fresh price in rec["price"] (set by
    # _update_price_fields above), so it matches the published price
    # exactly. rel_vol is computed from this same final (post-drop) hist.
    rec["debt_fcf"] = copy.deepcopy(base_rec.get("debt_fcf"))
    rec["indexes"] = copy.deepcopy(base_rec.get("indexes"))
    rec["market_cap"] = compute_market_cap(
        rec["price"], base_rec.get("shares_implied_total"))
    rec["rel_vol"] = compute_rel_vol(hist)
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


# ---------------------------------------------------------------------- macro
def fetch_fred_series(series_id):
    """Full FRED CSV series as sorted [(date, value)] (blank days skipped).
    Any fetch failure or an empty series is a gate trip — same
    all-or-nothing rule as the other fetches: fail without writing."""
    try:
        with urllib.request.urlopen(FRED_CSV_URL + series_id, timeout=30) as r:
            text = r.read().decode("utf-8")
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        fail(f"FRED {series_id} fetch failed: {e}")
    rows = []
    for line in text.splitlines():
        parts = line.strip().split(",")
        if len(parts) != 2:
            continue
        d, v = parts[0].strip(), parts[1].strip()
        if not v:  # blank = no observation that day
            continue
        try:
            val = float(v)
            day = datetime.date.fromisoformat(d)
        except ValueError:
            continue
        rows.append((day, val))
    if not rows:
        fail(f"FRED {series_id}: no observations returned")
    rows.sort()
    return rows


def series_latest(rows, close_d):
    """Latest observation on/before close_d plus the previous one.
    Returns (value, date, prev_value, prev_date). Fails if fewer than
    two observations exist on/before close_d (a change cannot be
    computed without a previous release)."""
    upto = [(d, v) for d, v in rows if d <= close_d]
    if len(upto) < 2:
        fail(f"FRED series: fewer than 2 observations on/before {close_d}")
    (pd, pv), (d, v) = upto[-2], upto[-1]
    return v, d, pv, pd


def value_a_month_ago(rows, latest_d):
    """Latest observation on/before (latest date - 30 days), for the
    1-month-ago credit-spread comparison. Fails if none exists (the
    BAML series go back to 2023, so a live run always has one)."""
    target = latest_d - datetime.timedelta(days=30)
    upto = [(d, v) for d, v in rows if d <= target]
    if not upto:
        fail(f"FRED series: no observation on/before {target} "
             f"(1 month before {latest_d})")
    return upto[-1][1], upto[-1][0]


def fetch_spy(end):
    """SPY 1y history (yfinance), intraday-bar-dropped like the tickers,
    with 50/200-day EMAs from the EXACT compute_technicals formulas.
    Returns (spy_dict, close_date_str). Gates: empty history, fewer
    than MIN_BARS bars, or a missing close all fail the run."""
    try:
        hist = yf.Ticker("SPY").history(period="1y", auto_adjust=False,
                                        end=end)
    except Exception as e:  # noqa: BLE001 — any yfinance failure is a gate trip
        fail(f"SPY: yfinance fetch failed: {e}")
    if hist is None or hist.empty or "Close" not in hist:
        fail("SPY: yfinance returned empty history")
    hist = drop_intraday_bar(hist)
    close = hist["Close"]
    if len(close) < MIN_BARS:
        fail(f"SPY: only {len(close)} history bars (< {MIN_BARS})")
    last_close = float(close.iloc[-1])
    if last_close != last_close:  # NaN
        fail("SPY: missing close")
    tech = compute_technicals(close)
    bar_date = hist.index[-1].date().isoformat()
    print(f"    SPY: close ${last_close:.2f}, EMA50 ${tech['ema50']:.2f}, "
          f"EMA200 ${tech['ema200']:.2f}, close date {bar_date}")
    return ({"close": round(last_close, 2), "as_of": bar_date,
             "ema50": tech["ema50"], "ema200": tech["ema200"]}, bar_date)


def fetch_macro(close_date, end, ticker_recs, prev_prices):
    """Macro snapshot for the Market Pulse page, all IN MEMORY (no
    writes). close_date is the tickers' price_date; end follows cmd_live
    (as_of + 1d when pinned, None for the latest close). ticker_recs maps
    ticker -> {"price", "technicals": {"ema50", "high_52w"}} (the
    refreshed records in live mode); prev_prices maps ticker -> the
    previous close to compare against for the 227-name advance/decline
    counts. Returns the macro dict. Raises SystemExit on any gate trip:
    any FRED fetch failure, a missing series value, a SPY fetch failure,
    or a SPY close date disagreeing with close_date."""
    close_d = datetime.date.fromisoformat(close_date)

    # SPY trend inputs (gated on the close date agreeing with the tickers).
    spy, spy_date = fetch_spy(end)
    if spy_date != close_date:
        fail(f"SPY close date {spy_date} != ticker price_date {close_date}")

    # VIX daily close (FRED VIXCLS — same value as the yfinance VIX
    # close in market.json; FRED is the recorded source here).
    vix_rows = fetch_fred_series("VIXCLS")
    vix_val, vix_d, _, _ = series_latest(vix_rows, close_d)
    print(f"    VIX (FRED VIXCLS): {vix_val:.2f} as of {vix_d.isoformat()}")

    # Credit spreads: latest + 1 month ago, HY and IG.
    credit = {}
    for series_id, label in CREDIT_SERIES:
        rows = fetch_fred_series(series_id)
        val, d, _, _ = series_latest(rows, close_d)
        val_1m, d_1m = value_a_month_ago(rows, d)
        key = "hy_spread" if "HYM2" in series_id else "ig_spread"
        credit[key] = {"value": round(val, 2), "as_of": d.isoformat()}
        credit[key + "_1m_ago"] = {"value": round(val_1m, 2),
                                   "as_of": d_1m.isoformat()}
        credit[key + "_change_bp"] = round((val - val_1m) * 100)
        print(f"    {label} ({series_id}): {val:.2f}% as of "
              f"{d.isoformat()}, 1m ago {val_1m:.2f}% as of "
              f"{d_1m.isoformat()} ({credit[key + '_change_bp']:+d} bp)")

    # Macro composite: one favorable/unfavorable call per component vs
    # its previous release. GDP is quarterly and the rest monthly, so
    # the as-of dates lag the close date — each is recorded honestly.
    components = {}
    favorable = 0
    for series_id, label, unit, up_is_good in MACRO_COMPONENTS:
        rows = fetch_fred_series(series_id)
        val, d, pv, pd = series_latest(rows, close_d)
        if unit == "pct":
            change = round(val / pv - 1, 4)
            change_txt = f"{change:+.2%}"
        else:  # pp — percentage points, for the unemployment rate
            change = round(val - pv, 2)
            change_txt = f"{change:+.2f} pp"
        good = (change > 0) if up_is_good else (change < 0)
        favorable += 1 if good else 0
        components[series_id.lower()] = {
            "label": label, "value": round(val, 4),
            "as_of": d.isoformat(), "prev_value": round(pv, 4),
            "prev_as_of": pd.isoformat(), "change": change,
            "change_unit": unit, "favorable": good}
        print(f"    {label}: {val} as of {d.isoformat()} (prev {pv} as "
              f"of {pd.isoformat()}, {change_txt}) — "
              f"{'favorable' if good else 'unfavorable'}")
    print(f"    macro composite: {favorable}/4 components favorable")

    # Universe internals for the Pulse page, from the refreshed records:
    # % above the 50-day EMA, new 52-week closing highs (live close at
    # or above the 52-week high close), and advancers/decliners vs the
    # previous close. Per-ticker EMA50 + 52w high are stored so the page
    # can recompute the live readings from live prices.
    universe_tickers = {}
    above_50 = new_highs = adv = dec = unch = 0
    for t, rec in sorted(ticker_recs.items()):
        tech = rec.get("technicals") or {}
        ema50 = tech.get("ema50")
        high_52w = tech.get("high_52w")
        price = rec.get("price")
        if ema50 is None or high_52w is None or price is None:
            fail(f"macro universe: {t} missing price/ema50/high_52w")
        universe_tickers[t] = {"ema50": ema50, "high_52w": high_52w}
        if price > ema50:
            above_50 += 1
        if price >= high_52w:
            new_highs += 1
        prev = prev_prices.get(t)
        if prev is None:
            fail(f"macro universe: {t} missing previous close")
        if price > prev:
            adv += 1
        elif price < prev:
            dec += 1
        else:
            unch += 1
    print(f"    universe (227): above 50-day EMA {above_50}, new 52w "
          f"highs {new_highs}, advancers {adv} / decliners {dec} / "
          f"unchanged {unch}")

    return {
        "as_of": close_date,
        "source": MACRO_SOURCE,
        "spy": spy,
        "vix": {"value": round(vix_val, 2), "as_of": vix_d.isoformat()},
        "credit": credit,
        "macro": {"components": components,
                  "favorable_count": favorable, "total": 4},
        "universe": {
            "as_of": close_date, "total": len(ticker_recs),
            "above_50dma": above_50, "new_52w_highs": new_highs,
            "advancers": adv, "decliners": dec, "unchanged": unch,
            "tickers": universe_tickers},
    }


# -------------------------------------------------------------------- engines
def _stage_engine(key, tickers, inputs, tmpdir):
    """Stage one frozen engine copy in tmpdir for a subprocess run.
    The repo original is NEVER edited; only the staged copy is patched,
    in exactly the places the frozen code is per-ticker rather than
    general:
      * TICKERS = [...] — replaced with the tickers this run scores. The
        verbatim engines hardcode their 5/8 names (incl. removed NVO/JPM)
        and would KeyError on a base that no longer contains them.
      * batch2 only: COMPLETENESS = {...} — replaced with the
        rule-derived dict for these tickers (see completeness_for); the
        verbatim dict covers 8 names only.
    Each patch is a single substitution, asserted. A staging failure
    aborts the run (fail()) before anything is written. Returns the
    staged dir."""
    d = os.path.join(tmpdir, key)
    os.makedirs(d)
    src_path = os.path.join(ENGINE_DIR, key, "engine.py")
    with open(src_path, encoding="utf-8") as f:
        src = f.read()
    patched, n = re.subn(r"^TICKERS = \[[^\]]*\]",
                         lambda m: "TICKERS = " + json.dumps(tickers),
                         src, count=1, flags=re.M)
    if n != 1:
        fail(f"engine {key}: TICKERS line not found exactly once — "
             f"refusing to stage (frozen engine changed?)")
    if key == "batch2":
        comp = {t: completeness_for(t, inputs["tickers"][t]) for t in tickers}
        patched, n = re.subn(r"(?ms)^COMPLETENESS = \{[^}]*\}",
                             lambda m: "COMPLETENESS = " + repr(comp),
                             patched, count=1)
        if n != 1:
            fail("engine batch2: COMPLETENESS literal not found exactly "
                 "once — refusing to stage (frozen engine changed?)")
        # v1.3.1 textfix (Option E refresh), grid note only: the frozen
        # batch2 engine prints the low-beta 10.0% discount in the
        # sensitivity-grid note for every non-NVDA ticker, even the 21
        # live names whose raw beta >= 2.0 puts them on the 12.0% tier
        # (the grid VALUES use the right tier; only the note text is
        # wrong). Rewrite that one note expression to the discount the
        # grid actually uses (RF + dcf_spread); values are untouched.
        # The textfix's DCF skip-reason change is NOT applied here: no
        # live name has a skipped DCF leg, so that text never fires
        # for the 227. Single substitution, asserted.
        old_note = ("{DISCOUNT_HIGH if t == 'NVDA' "
                    "else DISCOUNT_LOW:.1%}")
        if patched.count(old_note) != 1:
            fail("engine batch2: grid-note discount expression not "
                 "found exactly once — refusing to stage (frozen "
                 "engine changed?)")
        patched = patched.replace(old_note, "{(RF + dcf_spread):.1%}")
    with open(os.path.join(d, "engine.py"), "w", encoding="utf-8") as f:
        f.write(patched)
    write_json(os.path.join(d, "inputs.json"), inputs)
    return d


def run_engines_staged(inputs_by_engine, all_tickers):
    """Run both frozen engine copies in a temp dir (no repo writes).
    inputs_by_engine: {"v13": {...inputs.json...}, "batch2": {...}}.
    The v1.3 copy scores its 4 continuing names; the batch2 copy scores
    all_tickers (all 227 live names). Returns {"v13": results_dict,
    "batch2": results_dict}."""
    out = {}
    with tempfile.TemporaryDirectory(prefix="stock-check-refresh-") as tmp:
        for key, tickers in (("v13", V13_TICKERS),
                             ("batch2", list(all_tickers))):
            d = _stage_engine(key, tickers, inputs_by_engine[key], tmp)
            r = subprocess.run([sys.executable, "engine.py"], cwd=d)
            if r.returncode != 0:
                fail(f"engine {key} exited {r.returncode}")
            out[key] = load_json(os.path.join(d, "results.json"))
    return out


def split_inputs(all_tickers, as_of, price_date):
    """Split the ticker dict into the two per-engine inputs.json dicts.
    v1.3 gets its 4 continuing names; batch2 gets every ticker in
    all_tickers (all 227 live names). Top-level metadata mirrors the
    frozen source inputs.json files."""
    base = load_json(BASE_INPUTS)
    out = {}
    for key, tickers in (("v13", V13_TICKERS),
                         ("batch2", sorted(all_tickers))):
        d = {"as_of": as_of, "price_date": price_date,
             "sources": base["sources"],
             "discarded_yahoo_fields": base["discarded_yahoo_fields"],
             "capm": base["capm"],
             "tickers": {t: copy.deepcopy(all_tickers[t]) for t in tickers}}
        out[key] = d
    return out


def gate_engine_outputs(results, stored_results, all_tickers):
    """Engine-output gates: every ticker present; triangulated_fv non-null
    wherever the stored result had a non-null FV. The batch2 gate covers
    all live tickers (all 227); v1.3 covers its 4 continuing names."""
    for key, tickers in (("v13", V13_TICKERS),
                         ("batch2", list(all_tickers))):
        got = results[key].get("tickers", {})
        for t in tickers:
            if t not in got:
                fail(f"engine {key} output missing ticker {t}")
            fv = got[t].get("triangulated_fv")
            stored_fv = stored_results["tickers"][t]["triangulated_fv"]
            if fv is None and stored_fv is not None:
                fail(f"engine {key}: {t} triangulated_fv is null "
                     f"(stored ${stored_fv:.2f})")


def merge_results(v13_results, batch2_results, as_of, price_date,
                  refreshed=None):
    """Merged site results: top-level EXACTLY as v1.3's output (engine
    string, locked_set, capm_crosscheck, weights, ladder_ratios), tickers
    = batch2's 227, with v1.3's 4 taking precedence over batch2's copies
    of the same 4 names (see below). as_of / price_date overridden to
    the refresh. The frozen engines do not emit the analyst-consensus
    block, so it is carried through here from the frozen base inputs
    (deep copy, appended as the last key of each ticker dict) — the same
    placement as the one-time backfill of lib/data/results.json. No
    number, score, FV or verdict is touched.

    The four new fields are carried through here too (same append-after-
    analysts placement), because the engines never emit them and this
    merge is the ONLY path by which a ticker record reaches results.json:
      * debt_fcf, indexes - frozen passthrough from base_inputs.json
        (via `refreshed` when the caller has it, else the base).
      * market_cap - recomputed here from the MERGED (published) price
        x shares_implied_total from base_inputs.json, so it always
        matches the published price exactly. Null if shares missing.
      * rel_vol - taken from `refreshed` (live path: computed in
        refresh_ticker from the final bar set). Dry-run callers pass the
        base records, which carry no rel_vol, so dry-run output has
        rel_vol null - the dry run fetches nothing, so it cannot compute
        one; that is expected, not a failure.
    `refreshed`: per-ticker records carrying the new fields (live path:
    the new_tickers dict from cmd_live; dry-run path: base["tickers"]).
    Missing keys in older files are tolerated as null, never a crash."""
    merged = copy.deepcopy(v13_results)
    # batch2 scores all 227, INCLUDING the 4 v1.3 names; v1.3's own output
    # takes precedence for those 4, so their published detail text stays
    # exactly as the v1.3 engine produces it. Values are identical either
    # way (Phase 1 regression: driver vs v1.3 value diffs none), but the
    # sensitivity-grid note wording differs between the engines.
    merged["tickers"] = {**batch2_results["tickers"], **v13_results["tickers"]}
    merged["as_of"] = as_of
    merged["price_date"] = price_date
    base = load_json(BASE_INPUTS)
    refreshed = refreshed or {}
    for t, rec in merged["tickers"].items():
        rec["analysts"] = copy.deepcopy(base["tickers"][t]["analysts"])
        src = refreshed.get(t) or base["tickers"][t]
        rec["debt_fcf"] = copy.deepcopy(src.get("debt_fcf"))
        rec["indexes"] = copy.deepcopy(src.get("indexes"))
        rec["market_cap"] = compute_market_cap(
            rec["price"], base["tickers"][t].get("shares_implied_total"))
        rec["rel_vol"] = copy.deepcopy(src.get("rel_vol"))
    return merged


# ------------------------------------------------------------------- dry run
def cmd_dry_run(as_of):
    base = load_json(BASE_INPUTS)
    stored = load_json(SITE_RESULTS)
    all_tickers = live_tickers(base, stored)
    inputs = split_inputs(base["tickers"], base["as_of"], base["price_date"])
    print(f"dry run: re-running both frozen engines on base inputs "
          f"(as of {base['price_date']} close), no fetching; "
          f"{len(all_tickers)} tickers")
    results = run_engines_staged(inputs, all_tickers)
    merged = merge_results(results["v13"], results["batch2"],
                           stored["as_of"], stored["price_date"],
                           refreshed=base["tickers"])
    print(f"\n{'ticker':<7} {'FV new':>10} {'FV stored':>10} "
          f"{'score new':>10} {'score stored':>12} {'verdict':>8}  result")
    n_pass = 0
    for t in all_tickers:
        new = merged["tickers"][t]
        old = stored["tickers"][t]
        ok = (new["triangulated_fv"] == old["triangulated_fv"]
              and new["overall_score"] == old["overall_score"]
              and new["verdict"] == old["verdict"])
        n_pass += ok
        print(f"{t:<7} {new['triangulated_fv']:>10.2f} {old['triangulated_fv']:>10.2f} "
              f"{new['overall_score']:>10.1f} {old['overall_score']:>12.1f} "
              f"{new['verdict']:>8}  {'PASS' if ok else 'FAIL'}")
    print(f"\ndry run: {n_pass}/{len(all_tickers)} PASS")
    if n_pass != len(all_tickers):
        fail("dry run: merged output does NOT reproduce lib/data/results.json")
    print(f"dry run: OK — engines reproduce all {len(all_tickers)} FVs / "
          f"scores / verdicts exactly")
    return 0


# ---------------------------------------------------------- check-technicals
TECH_FIELDS = ["ema20", "ema50", "ema200", "rsi14", "macd_line",
               "macd_signal", "macd_hist", "price_vs_200d_pct",
               "ret_6m", "ret_12m", "high_52w"]


def cmd_check_technicals():
    base = load_json(BASE_INPUTS)
    all_tickers = load_all_tickers()
    print("check-technicals: fetching 1y history ending 2026-11-13 "
          "(end=2026-11-14) and recomputing technicals with the exact "
          "fetch_inputs.py formulas; comparing vs stored Nov-13 technicals")
    n_match = n_total = 0
    for t in all_tickers:
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
    all_tickers = live_tickers(base, stored)
    today_utc = datetime.date.today().isoformat()  # UTC date on this machine
    if as_of_arg:
        as_of = as_of_arg
        end = (datetime.date.fromisoformat(as_of_arg)
               + datetime.timedelta(days=1)).isoformat()
    else:
        as_of = today_utc
        end = None
    print(f"live refresh: as_of={as_of} (end={end or 'latest'}); "
          f"{len(all_tickers)} tickers")

    # 1. Fetch + recompute everything IN MEMORY (no writes yet).
    new_tickers = {}
    bar_dates = set()
    for t in all_tickers:
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

    # 1c. Macro snapshot for the Pulse page, also IN MEMORY. The
    # previous close for the 227-name advance/decline counts is the last
    # PUBLISHED close (stored results.json) on a normal night; on a
    # re-run of an already-published close it is the frozen base close
    # (base_inputs.json price_date 2026-11-13 is the trading day before
    # the 2026-11-16 close) — comparing a re-run against its own
    # published close would show every name unchanged.
    print("\n  fetching macro (FRED + SPY) ...")
    if price_date == stored["price_date"]:
        prev_prices = {t: base["tickers"][t]["price"] for t in all_tickers}
    else:
        prev_prices = {t: stored["tickers"][t]["price"]
                       for t in all_tickers}
    macro = fetch_macro(price_date, end, new_tickers, prev_prices)

    # 2. Run both engines staged; gate their outputs.
    inputs = split_inputs(new_tickers, as_of, price_date)
    results = run_engines_staged(inputs, all_tickers)
    gate_engine_outputs(results, stored, all_tickers)
    merged = merge_results(results["v13"], results["batch2"], as_of, price_date,
                           refreshed=new_tickers)

    # 3. Per-ticker summary + CHANGED flag (computed BEFORE any write, so
    #    a no-change night writes nothing at all: no as_of/lastmod bumps,
    #    no empty commit, no pointless redeploy).
    print(f"\n{'ticker':<7} {'price old->new':>22} {'FV old->new':>22} "
          f"{'verdict old->new':>20}")
    changed_tickers = False
    flips = []
    for t in all_tickers:
        old, new = stored["tickers"][t], merged["tickers"][t]
        p_ch = old["price"] != new["price"]
        f_ch = old["triangulated_fv"] != new["triangulated_fv"]
        v_ch = old["verdict"] != new["verdict"]
        # New fields must count too, or they would never be written on a
        # night when price/FV/verdict are unchanged: rel_vol moves almost
        # every night by construction (daily volume), market_cap moves
        # with price, and debt_fcf/indexes move on the quarterly refresh
        # of base_inputs.json. .get(..., None) tolerates stored files
        # that predate the fields. Consequence, by design: a night with
        # no price/FV/verdict change still writes when rel_vol changed.
        n_ch = any(old.get(f) != new.get(f)
                   for f in ("debt_fcf", "market_cap", "rel_vol", "indexes"))
        changed_tickers |= p_ch or f_ch or v_ch or n_ch
        if v_ch:
            flips.append(t)
        mark = "  <-- VERDICT FLIP" if v_ch else ""
        print(f"{t:<7} ${old['price']:>8.2f} -> ${new['price']:>8.2f}  "
              f"${old['triangulated_fv']:>8.2f} -> ${new['triangulated_fv']:>8.2f}  "
              f"{old['verdict']:>6} -> {new['verdict']:<6}{mark}")
    stored_market = (load_json(MARKET_JSON)
                     if os.path.exists(MARKET_JSON) else None)
    changed_market = stored_market != market
    stored_macro = (load_json(MACRO_JSON)
                    if os.path.exists(MACRO_JSON) else None)
    changed_macro = stored_macro != macro
    changed = changed_tickers or changed_market or changed_macro
    print(f"\nCHANGED={'yes' if changed else 'no'}  "
          f"(tickers={'yes' if changed_tickers else 'no'}, "
          f"market={'yes' if changed_market else 'no'}, "
          f"macro={'yes' if changed_macro else 'no'}; "
          f"as_of {stored['as_of']} -> {as_of}, "
          f"price_date {stored['price_date']} -> {price_date})")
    if flips:
        print(f"VERDICT FLIPS: {', '.join(flips)}")
    if not changed:
        print("no price / FV / verdict / market / macro change — "
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
    if changed_macro:
        write_json(MACRO_JSON, macro)
        print(f"  macro.json: as_of {macro['as_of']}, "
              f"SPY ${macro['spy']['close']:.2f} "
              f"(EMA50 ${macro['spy']['ema50']:.2f}, "
              f"EMA200 ${macro['spy']['ema200']:.2f}), "
              f"VIX {macro['vix']['value']:.2f}, "
              f"HY {macro['credit']['hy_spread']['value']:.2f}%, "
              f"macro {macro['macro']['favorable_count']}/"
              f"{macro['macro']['total']} favorable")
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
