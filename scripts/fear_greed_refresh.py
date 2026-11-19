#!/usr/bin/env python3
"""Nightly Fear & Greed refresh — The Stock Check (homepage indicator
+ Market Pulse panel).

Pulls CNN's Fear & Greed Index from CNN's own data service (free, no
key, no account) and writes lib/data/fear_greed.json: the current
composite score and rating, the previous close / 1-week / 1-month /
1-year values, the seven component scores with their raw underlying
values, the five bands, and the last 30 days of history.

Source (verified 2026-11-19 from curl):
  - https://production.dataviz.cnn.io/index/fearandgreed/graphdata
    Plain GET with a browser User-Agent (plus Accept / Referer /
    Origin) returns HTTP 200 with the full payload as JSON. Curl's
    default UA gets HTTP 418 from the CDN, so the browser headers are
    required — a real browser sends them anyway. The endpoint also
    sends Access-Control-Allow-Origin: *, so a client-side live fetch
    works; the site polls it during market hours (see
    lib/tradingview.ts fetchFearGreed) and falls back to this baked
    file after hours.
  - The payload carries the composite (fear_and_greed: score, rating,
    timestamp, previous_1_week / 1_month / 1_year), the composite
    history (fear_and_greed_historical: 252 rows, one year), and all
    seven components as separate series (score + rating + raw data).
    The raw data rows are the UNDERLYING values (S&P 500 level, 125-day
    MA level, net new highs, McClellan summation, 5-day put/call,
    VIX level, VIX 50-day MA, junk spread, 20-day stocks-vs-bonds);
    the score fields are the normalised 0-100 component scores.

Freshness, honestly: CNN updates the index through the trading day
(the timestamp moves during market hours). The nightly run (05:20
UTC) captures the day's final value; on a weekend or holiday there
is no new session and this script writes nothing (the site keeps the
last value with its as-of date). The value is never presented as
live — the homepage tile and the Pulse panel label it with its date,
and go live only through the client-side fetch during market hours.

Bands (CNN's published scale, verified against 251 days of CNN's own
ratings in the history: Extreme Fear max 24.77, Fear 25.26-44.86,
Neutral 45.23-54.97, Greed 56.20-71.17; no Extreme Greed day in the
past year, max 71.17):
  0-25    Extreme Fear
  25-45   Fear
  45-55   Neutral
  55-75   Greed
  75-100  Extreme Greed

Cross-checks (fail-closed): composite score in 0-100; its rating
matches the band for the score; all seven components present with
scores in 0-100 and ratings matching their bands; the composite is
within 1.0 of the equal-weighted mean of the seven component scores
(CNN's definition — on 2026-11-19: composite 30.66 vs mean of the
rounded component scores 30.74, the gap is rounding in the published
figures); history has >= 200 rows; the latest value date is within
the last 5 calendar days. A fetch failure, a failed check, or a stale
feed aborts the run with NOTHING written.

Note on previous_close (resolved 2026-11-19): the endpoint's
previous_close field (24.61) does NOT match the history series
(Nov 18: 29.89), while previous_1_week / 1_month / 1_year all match
the history exactly. CNN's own site displays the field's value
(Previous close 24), so the NAMED fields are what the site shows —
the history series is the odd one out for the previous close only.
The refresh therefore uses the named fields for all four reference
values, cross-checks 1-week / 1-month / 1-year against the history
(fail on disagreement), and logs — does not fail — a previous_close
mismatch, since it is a stable CNN quirk and failing would block the
refresh over a value CNN itself publishes. Documented in
PULSE_FEAR_GREED.md.

Usage:
  python3 scripts/fear_greed_refresh.py
  A normal run fetches the latest payload and writes it only if the
  value date is new (or the file is missing); weekends/holidays write
  nothing. The endpoint returns a full year of history in one fetch,
  so no seed mode is needed.
"""
import datetime
import json
import os
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS = os.path.join(REPO, "lib", "data", "fear_greed.json")

FG_URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
FG_SOURCE = "CNN Fear & Greed Index"
FG_SOURCE_URL = "https://www.cnn.com/markets/fear-and-greed"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.cnn.com/markets/fear-and-greed",
    "Origin": "https://www.cnn.com",
}

# The seven CNN components, in CNN's order. Each maps to the payload
# key that carries it, the display label, what it measures, and how the
# raw underlying value is rendered for the panel. For Market Momentum
# and Market Volatility the raw value needs two series (the level and
# its moving average), so those two take a pair of keys.
COMPONENTS = [
    {
        "key": "momentum",
        "label": "Market Momentum",
        "what": "S&P 500 vs its 125-day moving average",
        "series": ("market_momentum_sp500", "market_momentum_sp125"),
    },
    {
        "key": "strength",
        "label": "Stock Price Strength",
        "what": "NYSE stocks at 52-week highs vs 52-week lows",
        "series": ("stock_price_strength",),
    },
    {
        "key": "breadth",
        "label": "Stock Price Breadth",
        "what": "McClellan Volume Summation Index",
        "series": ("stock_price_breadth",),
    },
    {
        "key": "put_call",
        "label": "Put and Call Options",
        "what": "5-day average put/call ratio (CNN's own series)",
        "series": ("put_call_options",),
    },
    {
        "key": "volatility",
        "label": "Market Volatility",
        "what": "VIX vs its 50-day moving average",
        "series": ("market_volatility_vix", "market_volatility_vix_50"),
    },
    {
        "key": "junk_bond",
        "label": "Junk Bond Demand",
        "what": "Yield spread, junk bonds vs investment grade",
        "series": ("junk_bond_demand",),
    },
    {
        "key": "safe_haven",
        "label": "Safe Haven Demand",
        "what": "Stocks vs bonds, past 20 days",
        "series": ("safe_haven_demand",),
    },
]

# Bands: (upper bound, label, note). First match wins; verified
# against CNN's own ratings (see module docstring).
BANDS = [
    (25, "Extreme Fear",
     "0–25 — investors are very fearful; the crowd is selling."),
    (45, "Fear",
     "25–45 — investors are fearful: defensive, but short of panic."),
    (55, "Neutral",
     "45–55 — no strong emotion either way; the middle says nothing."),
    (75, "Greed",
     "55–75 — investors are greedy: leaning into risk."),
    (float("inf"), "Extreme Greed",
     "75–100 — investors are very greedy; the crowd is all-in on upside."),
]
BANDS_JSON = [
    {"max": 25, "label": "Extreme Fear",
     "note": "0–25 — investors are very fearful; the crowd is selling."},
    {"max": 45, "label": "Fear",
     "note": "25–45 — investors are fearful: defensive, but short of panic."},
    {"max": 55, "label": "Neutral",
     "note": "45–55 — no strong emotion either way; the middle says nothing."},
    {"max": 75, "label": "Greed",
     "note": "55–75 — investors are greedy: leaning into risk."},
    {"max": None, "label": "Extreme Greed",
     "note": "75–100 — investors are very greedy; the crowd is all-in on upside."},
]

HISTORY_KEEP = 30  # days kept in fear_greed.json


def fail(msg):
    print(f"FEAR/GREED REFRESH FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def band_for(score):
    for upper, label, _note in BANDS:
        if score < upper:
            return label
    return BANDS[-1][1]


def title_rating(raw):
    """CNN ratings come lowercase ('extreme fear'); normalise to the
    band label form ('Extreme Fear')."""
    return " ".join(w.capitalize() for w in str(raw).strip().split())


def fmt_num(v):
    return f"{v:,.1f}" if abs(v) >= 100 else f"{v:.1f}"


def fetch_payload():
    req = urllib.request.Request(FG_URL, headers=HEADERS)
    try:
        raw = urllib.request.urlopen(req, timeout=60).read().decode(
            "utf-8", errors="ignore")
    except Exception as e:
        fail(f"CNN fetch failed ({FG_URL}): {e}")
    try:
        return json.loads(raw)
    except Exception as e:
        fail(f"CNN payload is not JSON ({FG_URL}): {e}")


def last_raw(series):
    """Latest raw value of a component series (last data row)."""
    data = series.get("data")
    if not isinstance(data, list) or not data:
        return None
    last = data[-1]
    y = last.get("y")
    return float(y) if isinstance(y, (int, float)) else None


def raw_text(comp, payload):
    """Human-readable raw underlying value(s) for one component."""
    keys = comp["series"]
    if comp["key"] == "momentum":
        level = last_raw(payload[keys[0]])
        ma = last_raw(payload[keys[1]])
        if level is None or ma is None:
            return None
        side = "above" if level > ma else "below"
        return (f"S&P 500 {fmt_num(level)} is {side} its 125-day "
                f"average ({fmt_num(ma)})")
    if comp["key"] == "volatility":
        vix = last_raw(payload[keys[0]])
        ma = last_raw(payload[keys[1]])
        if vix is None or ma is None:
            return None
        side = "above" if vix > ma else "below"
        return (f"VIX {fmt_num(vix)} is {side} its 50-day "
                f"average ({fmt_num(ma)})")
    v = last_raw(payload[keys[0]])
    if v is None:
        return None
    if comp["key"] == "strength":
        return f"Net new highs {v:+.1f} (more new lows than highs)" \
            if v < 0 else f"Net new highs +{v:.1f}"
    if comp["key"] == "breadth":
        return f"McClellan Volume Summation {fmt_num(v)}"
    if comp["key"] == "put_call":
        return f"5-day average put/call {v:.2f}"
    if comp["key"] == "junk_bond":
        return f"Spread {v:.2f}"
    if comp["key"] == "safe_haven":
        return f"{v:+.1f}% over the past 20 days"
    return fmt_num(v)


def dedupe_history(data):
    """History rows keyed by calendar date (UTC), keeping the LAST row
    per date — CNN appends an intraday update for today, so the raw
    series can carry two rows for the same day."""
    by_day = {}
    for row in data:
        try:
            day = datetime.datetime.fromtimestamp(
                row["x"] / 1000, datetime.timezone.utc).date().isoformat()
            by_day[day] = {"date": day, "score": round(float(row["y"]), 1),
                           "rating": title_rating(row["rating"])}
        except (KeyError, TypeError, ValueError):
            continue
    return [by_day[d] for d in sorted(by_day)]


def main():
    today_utc = datetime.date.today().isoformat()
    stored = None
    if os.path.exists(RESULTS):
        with open(RESULTS) as f:
            stored = json.load(f)

    payload = fetch_payload()
    fg = payload.get("fear_and_greed")
    if not isinstance(fg, dict):
        fail("CNN payload has no fear_and_greed object")
    score = fg.get("score")
    rating = title_rating(fg.get("rating", ""))
    if not isinstance(score, (int, float)) or not 0 <= score <= 100:
        fail(f"CNN composite score out of range: {score!r}")
    if band_for(score) != rating:
        fail(f"CNN rating {rating!r} does not match band for score "
             f"{score} ({band_for(score)})")
    timestamp = fg.get("timestamp")
    if not isinstance(timestamp, str) or not timestamp:
        fail("CNN payload has no timestamp")

    hist_raw = payload.get("fear_and_greed_historical", {}).get("data")
    if not isinstance(hist_raw, list) or len(hist_raw) < 200:
        fail(f"CNN history too short: "
             f"{len(hist_raw) if isinstance(hist_raw, list) else 'missing'} rows")
    history = dedupe_history(hist_raw)
    value_date = history[-1]["date"]
    latest_age = (datetime.date.fromisoformat(today_utc)
                  - datetime.date.fromisoformat(value_date)).days
    if latest_age > 5:
        fail(f"CNN latest value {value_date} is {latest_age} days old — "
             f"feed looks stale")
    # The history's last row must agree with the composite score
    # (same day, same value — the endpoint appends today's intraday
    # value to the series).
    if abs(history[-1]["score"] - round(score, 1)) > 0.5:
        fail(f"CNN composite {score} disagrees with history last row "
             f"{history[-1]['score']} on {value_date}")

    # Reference values: the endpoint's NAMED fields — those are what
    # CNN itself displays (its site shows Previous close 24, the
    # field's 24.61, not the history series' Nov 18 value 29.89).
    # 1-week / 1-month / 1-year match the history exactly, so they
    # are cross-checked against it below (fail on disagreement);
    # previous_close is the known exception — a mismatch is logged,
    # not failed (see docstring).
    def named_ref(field):
        v = fg.get(field)
        if not isinstance(v, (int, float)) or not 0 <= v <= 100:
            fail(f"CNN {field} missing or out of range: {v!r}")
        return round(float(v), 1)

    prev_close = named_ref("previous_close")
    prev_1_week = named_ref("previous_1_week")
    prev_1_month = named_ref("previous_1_month")
    prev_1_year = named_ref("previous_1_year")

    by_date = {h["date"]: h["score"] for h in history}
    prev_date = history[-2]["date"] if len(history) > 1 else None

    def value_n_days_ago(n):
        target = (datetime.date.fromisoformat(value_date)
                  - datetime.timedelta(days=n)).isoformat()
        # Nearest trading day on or before the target.
        for h in reversed(history):
            if h["date"] <= target:
                return h["score"]
        return None

    def value_one_month_ago():
        # CNN's "1 month" is the same calendar date one month earlier
        # (Oct 19 for a Nov 19 value), not 30 days back — verified
        # 2026-11-19: endpoint 19.51 = Oct 19's 19.5, while Oct 20
        # (30 days back) is 28.7.
        vd = datetime.date.fromisoformat(value_date)
        year, month = vd.year, vd.month - 1
        if month == 0:
            year, month = year - 1, 12
        import calendar as _cal
        day = min(vd.day, _cal.monthrange(year, month)[1])
        target = datetime.date(year, month, day)
        for h in reversed(history):
            if h["date"] <= target.isoformat():
                return h["score"]
        return None

    # Cross-check the three reference values that should match the
    # history (fail on disagreement — a mismatch means the payload
    # is inconsistent). previous_close is the known exception: log
    # the mismatch, don't fail (see docstring).
    for field, named, hist in (
        ("previous_1_week", prev_1_week, value_n_days_ago(7)),
        ("previous_1_month", prev_1_month, value_one_month_ago()),
        ("previous_1_year", prev_1_year, value_n_days_ago(365)),
    ):
        if hist is None or abs(named - hist) > 0.5:
            fail(f"CNN {field} {named} disagrees with history "
                 f"{hist} — payload looks inconsistent")
    hist_prev = by_date.get(prev_date) if prev_date else None
    if hist_prev is not None and abs(prev_close - hist_prev) > 0.5:
        print(f"NOTE: CNN previous_close field {prev_close} differs "
              f"from history {prev_date} value {hist_prev} — using "
              f"the field, as CNN displays it (see docstring).")

    components = []
    comp_scores = []
    for comp in COMPONENTS:
        series = payload.get(comp["series"][0])
        if not isinstance(series, dict):
            fail(f"CNN payload missing component series "
                 f"{comp['series'][0]}")
        cscore = series.get("score")
        crating = title_rating(series.get("rating", ""))
        if not isinstance(cscore, (int, float)) or not 0 <= cscore <= 100:
            fail(f"CNN component {comp['key']} score out of range: "
                 f"{cscore!r}")
        if band_for(cscore) != crating:
            fail(f"CNN component {comp['key']} rating {crating!r} does "
                 f"not match band for score {cscore}")
        rtext = raw_text(comp, payload)
        if rtext is None:
            fail(f"CNN component {comp['key']} has no raw series data")
        components.append({
            "key": comp["key"],
            "label": comp["label"],
            "what": comp["what"],
            "raw": rtext,
            "score": round(float(cscore), 1),
            "rating": crating,
        })
        comp_scores.append(float(cscore))
    mean_comp = sum(comp_scores) / len(comp_scores)
    if abs(mean_comp - float(score)) > 1.0:
        fail(f"CNN composite {score} is not the mean of its components "
             f"({mean_comp:.2f}) — payload looks inconsistent")

    out = {
        "as_of": today_utc,
        "value_date": value_date,
        "updated_at": timestamp,
        "source": FG_SOURCE,
        "source_url": FG_SOURCE_URL,
        "score": round(float(score), 1),
        "rating": rating,
        "prev_close": prev_close,
        "prev_1_week": prev_1_week,
        "prev_1_month": prev_1_month,
        "prev_1_year": prev_1_year,
        "components": components,
        "bands": BANDS_JSON,
        "history": history[-HISTORY_KEEP:],
    }
    if stored is not None:
        # The intraday timestamp moves on every fetch, so it is not
        # part of the comparison — only content justifies a write.
        # (The previous_close correction on 2026-11-19 — 29.9 to
        # 24.6, same value date — is exactly the kind of content
        # change that must still write, so the value-date check
        # alone no longer suppresses it.)
        content_keys = ("value_date", "score", "rating", "prev_close",
                        "prev_1_week", "prev_1_month", "prev_1_year",
                        "components", "bands", "history")
        if all(stored.get(k) == out[k] for k in content_keys):
            print("No changes — nothing to write.")
            return
    with open(RESULTS, "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    print(f"Wrote {RESULTS} (value {value_date}; score {out['score']} "
          f"{rating}; prev close {prev_close}; "
          f"{len(out['history'])} days in history).")


if __name__ == "__main__":
    main()
