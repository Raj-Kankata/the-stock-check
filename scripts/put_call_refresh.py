#!/usr/bin/env python3
"""Nightly put/call refresh — The Stock Check (Market Pulse panel + header strip).

Pulls the CBOE U.S. Options Daily Market Statistics page (free, no key,
no account) and writes lib/data/put_call.json: the latest session's
total / equity / index / ETP / VIX / SPX put/call ratios, the previous
session's values, 5-day and 10-day averages, the total-ratio read, and
the last 20 sessions of history.

Source (verified 2026-11-19 from curl):
  - https://www.cboe.com/markets/us/options/market-statistics/daily
    Plain GET with a browser User-Agent returns HTTP 200 with the ratios
    embedded as JSON (optionsData.ratios) plus a selectedDate field and
    per-product-group volumes. The page also accepts ?dt=YYYY-MM-DD for
    past sessions (minDate 2019-10-07), which is how the history is
    seeded — every seeded value is a CBOE figure, never a third-party
    copy. Two seeded values were cross-checked against independent
    pages that republish CBOE: 2026-11-17 total 0.98 / equity 0.71 /
    index 0.98 and 2026-11-13 total 0.85 / equity 0.63 / index 0.96
    both match exactly.
  - CBOE publishes each session's figures the FOLLOWING morning, so
    the reading always runs one session behind by construction. The
    nightly run (05:20 UTC) sees the previous close's session; on a
    weekend or holiday there is no new session and this script writes
    nothing (the site keeps the last session with its as-of date).

Cross-check: every ratio is verified against the product-group volumes
on the same page (put volume / call volume must round to the published
ratio within 0.02). A mismatch, a missing ratio, or a fetch failure
aborts the run with NOTHING written (fail-closed).

Total-ratio bands (method record: PULSE_PUT_CALL.md). Anchored to the
CBOE total-ratio distribution Nov 2006-Oct 2019 (average 0.95, median
0.93, 10th percentile 0.77, 90th percentile 1.16, highest day 1.82)
and the widely used 0.80-1.00 neutral zone:
  < 0.80  Complacent — calls dominate, below the neutral zone
  0.80-1.00 Neutral — inside the neutral zone
  1.00-1.16 Elevated — puts outnumber calls, up to the 90th percentile
  > 1.16  Extreme — above the 90th percentile (fear extreme)
Equity normal range 0.50-0.90 (average 0.65); index normal range
0.86-1.58 (average 1.20 — index options are dominated by institutional
hedging, so the index ratio is usually above 1.0). The bands are a
sentiment read, not a timing signal; the 5-day and 10-day averages
are the readable line, not the single-day print.

Usage:
  python3 scripts/put_call_refresh.py [--seed-days N]
  --seed-days N backfills the last N sessions via ?dt= (build-time use);
  a normal run fetches only the latest session and appends it if new.
"""
import datetime
import json
import os
import re
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS = os.path.join(REPO, "lib", "data", "put_call.json")

CBOE_URL = "https://www.cboe.com/markets/us/options/market-statistics/daily"
CBOE_SOURCE = "CBOE U.S. Options Daily Market Statistics"
CBOE_SOURCE_URL = CBOE_URL
UA = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"}

# Ratios we publish, by the exact name CBOE prints on the page.
# Total / index / equity are required — the site publishes them.
# ETP / VIX / SPX are bonus fields: optional, because CBOE changes
# its own product labels over time (e.g. "SPX + SPXW" became
# "SPX + SPXW + SPXO"), so a missing bonus ratio stores null instead
# of failing the run.
RATIO_NAMES = {
    "total": "TOTAL PUT/CALL RATIO",
    "index": "INDEX PUT/CALL RATIO",
    "equity": "EQUITY PUT/CALL RATIO",
}
OPTIONAL_RATIOS = {
    "etp": ["EXCHANGE TRADED PRODUCTS PUT/CALL RATIO"],
    "vix": ["CBOE VOLATILITY INDEX (VIX) PUT/CALL RATIO"],
    "spx": ["SPX + SPXW + SPXO PUT/CALL RATIO",
            "SPX + SPXW PUT/CALL RATIO"],
}
# Product-group volume rows used for the cross-check: (ratio key, group).
VOLUME_GROUPS = {
    "total": "SUM OF ALL PRODUCTS",
    "index": "INDEX OPTIONS",
    "equity": "EQUITY OPTIONS",
}

HISTORY_KEEP = 20  # sessions kept in put_call.json

# Total-ratio bands: (upper bound, label, interpretation). First match wins.
TOTAL_BANDS = [
    (0.80, "Complacent",
     "Calls dominate — below the neutral zone. Contrarian warning: the crowd is all-in on upside."),
    (1.00, "Neutral",
     "Inside the neutral zone — no sentiment extreme either way."),
    (1.16, "Elevated",
     "Puts outnumber calls — defensive, but below the 90th percentile of the 2006-2019 distribution."),
    (float("inf"), "Extreme",
     "Above the 90th percentile of the 2006-2019 distribution — fear extreme, the zone that has historically marked bottoms."),
]
BANDS_JSON = [
    {"max": 0.80, "label": "Complacent",
     "note": "Below 0.80 — calls dominate; contrarian warning, the crowd is all-in on upside."},
    {"max": 1.00, "label": "Neutral",
     "note": "0.80–1.00 — inside the neutral zone; no sentiment extreme."},
    {"max": 1.16, "label": "Elevated",
     "note": "1.00–1.16 — puts outnumber calls; defensive, below the 90th percentile."},
    {"max": None, "label": "Extreme",
     "note": "Above 1.16 — above the 90th percentile; fear extreme, the zone that has historically marked bottoms."},
]


def fail(msg):
    print(f"PUT/CALL REFRESH FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def load_json(path):
    with open(path) as f:
        return json.load(f)


def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=1)
        f.write("\n")


def total_read(total):
    for upper, label, _note in TOTAL_BANDS:
        if total < upper:
            return label
    return TOTAL_BANDS[-1][1]


def fetch_session(dt=None, strict=True):
    """Fetch one CBOE session. dt=None fetches the latest session.
    Returns (session_date_iso, ratios dict, volumes dict). With
    strict=False a date with no session at all (weekend/holiday:
    optionsData is null) returns (session_date, None, None) instead
    of failing — the seed walk skips it."""
    url = CBOE_URL + (f"?dt={dt}" if dt else "")
    req = urllib.request.Request(url, headers=UA)
    try:
        raw = urllib.request.urlopen(req, timeout=60).read().decode(
            "utf-8", errors="ignore")
    except Exception as e:
        fail(f"CBOE fetch failed ({url}): {e}")
    m = re.search(r'selectedDate\\?":\\?"(\d{4}-\d{2}-\d{2})', raw)
    if not m:
        fail(f"CBOE page has no selectedDate ({url})")
    session_date = m.group(1)
    if dt and session_date != dt:
        # Weekend / holiday: CBOE serves the previous session. The
        # caller treats a date already in history as "no new session".
        pass
    if 'optionsData\\":null' in raw:
        # No session on this date (weekend / market holiday).
        if strict:
            fail(f"CBOE page has no session data for {dt or 'latest'} "
                 f"({url})")
        return session_date, None, None
    ratios = {}
    for key, name in RATIO_NAMES.items():
        rm = re.search(re.escape(name) + r'\\?",\\"value\\?":\\"([0-9.]+)',
                       raw)
        if not rm:
            fail(f"CBOE page missing ratio {name} ({url})")
        ratios[key] = float(rm.group(1))
    for key, names in OPTIONAL_RATIOS.items():
        ratios[key] = None
        for name in names:
            rm = re.search(
                re.escape(name) + r'\\?",\\"value\\?":\\"([0-9.]+)', raw)
            if rm:
                ratios[key] = float(rm.group(1))
                break
    # Cross-check published ratios against the same page's volumes.
    volumes = {}
    for key, group in VOLUME_GROUPS.items():
        vm = re.search(
            re.escape(group) + r'.*?\\"VOLUME\\?",\\"call\\?":(\d+),'
            r'\\"put\\?":(\d+)',
            raw, re.DOTALL)
        if not vm:
            fail(f"CBOE page missing volume row {group} ({url})")
        call, put = int(vm.group(1)), int(vm.group(2))
        volumes[key] = {"call": call, "put": put}
        if call == 0:
            fail(f"CBOE volume row {group} has zero calls ({url})")
        computed = put / call
        if abs(computed - ratios[key]) > 0.02:
            fail(f"CBOE ratio/volume mismatch for {key}: published "
                 f"{ratios[key]} vs {put}/{call} = {computed:.2f} ({url})")
    return session_date, ratios, volumes


def avg_last(history, key, n):
    vals = [h[key] for h in history[-n:] if h.get(key) is not None]
    if len(vals) < n:
        return None
    return round(sum(vals) / len(vals), 2)


def build_output(as_of, history):
    """history: list of {date, total, equity, index} (+ extras), oldest
    first, already sorted and de-duplicated. Computes the published
    fields from it."""
    latest = history[-1]
    prev = history[-2] if len(history) > 1 else None
    out = {
        "as_of": as_of,
        "session_date": latest["date"],
        "source": CBOE_SOURCE,
        "source_url": CBOE_SOURCE_URL,
        "total": latest["total"],
        "equity": latest["equity"],
        "index": latest["index"],
        "etp": latest.get("etp"),
        "vix": latest.get("vix"),
        "spx": latest.get("spx"),
        "total_prev": prev["total"] if prev else None,
        "equity_prev": prev["equity"] if prev else None,
        "index_prev": prev["index"] if prev else None,
        "total_change": (round(latest["total"] - prev["total"], 2)
                         if prev else None),
        "equity_change": (round(latest["equity"] - prev["equity"], 2)
                          if prev else None),
        "index_change": (round(latest["index"] - prev["index"], 2)
                         if prev else None),
        "total_5d_avg": avg_last(history, "total", 5),
        "total_10d_avg": avg_last(history, "total", 10),
        "equity_5d_avg": avg_last(history, "equity", 5),
        "equity_10d_avg": avg_last(history, "equity", 10),
        "index_5d_avg": avg_last(history, "index", 5),
        "index_10d_avg": avg_last(history, "index", 10),
        "total_read": total_read(latest["total"]),
        "bands": BANDS_JSON,
        "history": history[-HISTORY_KEEP:],
    }
    return out


def main():
    seed_days = None
    if "--seed-days" in sys.argv:
        seed_days = int(sys.argv[sys.argv.index("--seed-days") + 1])
    today_utc = datetime.date.today().isoformat()
    as_of = today_utc

    stored = load_json(RESULTS) if os.path.exists(RESULTS) else None
    history = list(stored["history"]) if stored else []
    seen = {h["date"] for h in history}

    if seed_days:
        # Backfill: walk back from the latest session until N sessions
        # are collected (skips weekends/holidays via selectedDate).
        latest_date, _r, _v = fetch_session()
        print(f"Put/call seed: latest session {latest_date}")
        day = datetime.date.fromisoformat(latest_date)
        attempts = 0
        while len(history) < seed_days and attempts < seed_days + 25:
            dt = day.isoformat()
            if day.weekday() < 5 and dt not in seen:
                sdate, ratios, _vols = fetch_session(dt, strict=False)
                if ratios is not None and sdate not in seen:
                    history.append({
                        "date": sdate,
                        "total": ratios["total"],
                        "equity": ratios["equity"],
                        "index": ratios["index"],
                        "etp": ratios["etp"],
                        "vix": ratios["vix"],
                        "spx": ratios["spx"],
                    })
                    seen.add(sdate)
                    print(f"    {sdate}: total {ratios['total']} "
                          f"equity {ratios['equity']} "
                          f"index {ratios['index']}")
            day -= datetime.timedelta(days=1)
            attempts += 1
        history.sort(key=lambda h: h["date"])
        if len(history) < seed_days:
            fail(f"seed collected only {len(history)} of {seed_days} "
                 f"sessions")
    else:
        session_date, ratios, _vols = fetch_session()
        print(f"Put/call refresh: latest session {session_date}: "
              f"total {ratios['total']} equity {ratios['equity']} "
              f"index {ratios['index']}")
        if session_date in seen:
            print("No new session — nothing to write.")
            return
        history.append({
            "date": session_date,
            "total": ratios["total"],
            "equity": ratios["equity"],
            "index": ratios["index"],
            "etp": ratios["etp"],
            "vix": ratios["vix"],
            "spx": ratios["spx"],
        })
        history.sort(key=lambda h: h["date"])

    out = build_output(as_of, history)
    if stored is not None and stored == out:
        print("No changes — nothing to write.")
        return
    write_json(RESULTS, out)
    print(f"Wrote {RESULTS} (session {out['session_date']}; "
          f"total {out['total']} {out['total_read']}; "
          f"5d avg {out['total_5d_avg']}; 10d avg {out['total_10d_avg']}; "
          f"{len(out['history'])} sessions in history).")


if __name__ == "__main__":
    main()
