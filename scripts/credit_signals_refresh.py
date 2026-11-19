#!/usr/bin/env python3
"""Nightly credit-signals refresh — The Stock Check (Market Pulse panel).

Six recession-watch readings, all from FRED (free, no key, no account —
fredgraph.csv, the same fetch pattern as scripts/nightly_refresh.py).
The panel is a conditions gauge, not a recession prediction: these are
the conditions that tightened before past recessions.

Rows (FRED series, frequency, what it is):
  hy      ICE BofA US High Yield OAS            BAMLH0A0HYM2   daily
  bbb     ICE BofA BBB US Corporate OAS         BAMLC0A4CBBB   daily
  baa10y  Moody's Baa yield (BAA, monthly avg) minus 10Y Treasury
          (DGS10, daily). The spread mixes a monthly yield with a daily
          one; the row's as-of date is the DGS10 date and the BAA vintage
          is stored alongside.
  sloos   Senior Loan Officer Survey: net % of banks tightening C&I
          lending standards, large/middle-market firms (DRTSCILM),
          quarterly — the value sits unchanged for ~3 months.
  nfci    Chicago Fed National Financial Conditions Index (NFCI),
          weekly (Friday-dated). Above 0 = tighter than average.
  vix20d  Mean of the last 20 daily VIX closes (FRED VIXCLS). Today's
          close is shown alongside. A trend read, distinct from the
          /pulse Volatility panel's VIX level.

Bands (Calm / Watch / Warning) — ours, anchored to each series' own
history, not copied from any single chart. The historical anchors are
documented in PULSE_CREDIT_SIGNALS.md; the headline ones:
  hy:     Calm <4, Watch 4-6, Warning >6. Apr 2025 tariff shock peaked
          4.61 (Watch); Oct 2022 ~6.0 (Warning edge); COVID 10.87 on
          23 Mar 2020 and 2008 19.88 (Warning). Matches the /pulse
          Credit panel's HY scale (Calm <4, Normal 4-6, Elevated 6-8,
          Stressed >8) — Watch covers Normal, Warning covers
          Elevated+Stressed, so the two panels can never disagree.
  bbb:    Calm <1.5, Watch 1.5-2.5, Warning >2.5. Apr 2025 peaked
          1.49 (just below Watch); the 2022 tightening ran through
          Watch; Mar 2020 ran to ~4 (Warning).
  baa10y: Calm <2, Watch 2-3, Warning >3. Mar 2020 ~3.4 (Warning);
          Oct 2022 ~2.3 (Watch); Apr 2025 ~1.9 (just below Watch).
  sloos:  Calm <10, Watch 10-30, Warning >30. 2020 Q3 71.2 and 2023
          Q3 50.8 (Warning); 2022 H2 24-39 (Watch into Warning);
          Apr 2025 18.5 (Watch). Negative = net easing, also Calm.
  nfci:   Calm <0, Watch 0-0.5, Warning >0.5. COVID peaked 0.31
          (Watch); Apr 2025 peaked -0.38 (Calm); 0.5 is a level the
          COVID shock never reached.
  vix20d: Calm <20, Watch 20-30, Warning >30. Apr-May 2025 peaked
          near 32.5 (Warning); COVID ran far above 30.

Cross-checks (fail-closed): every fetch must succeed and every row
must have a value; the VIX 20-day average needs 20 closes; values
outside sanity ranges abort. The HY value is also checked against
macro.json's HY spread when the dates match, and the VIX close
against the index board's VIX price when the dates match — the site
must never show two different HY spreads or two different VIX
closes. A mismatch aborts with NOTHING written.

Cadence: nightly, same 05:20 UTC workflow, separate step after
index_refresh.py. FRED's daily series lag a day (DGS10's latest is
usually yesterday), BAA is monthly, NFCI weekly, SLOOS quarterly —
each row carries its own as-of date and the panel shows the latest
available value per series. No new value for a series = the row keeps
its last value with its date; the run writes only when something
changed (a new as-of counts as a change, as in put_call_refresh.py).

Note: since April 2026 FRED serves only a rolling three-year window
for the ICE BofA series (BAMLH0A0HYM2, BAMLC0A4CBBB) — the pre-2023
history now comes from ICE directly. This refresh only ever needs
recent values, so the window does not affect it; the historical
anchors above are recorded in the method note instead of being
re-derived at runtime.

Usage:
  python3 scripts/credit_signals_refresh.py
"""
import datetime
import json
import os
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RESULTS = os.path.join(REPO, "lib", "data", "credit_signals.json")
MACRO_JSON = os.path.join(REPO, "lib", "data", "macro.json")
INDEX_JSON = os.path.join(REPO, "lib", "data", "index_results.json")

FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id="
FRED_SOURCE = "FRED (Federal Reserve Bank of St. Louis)"
FRED_SOURCE_URL = "https://fred.stlouisfed.org/"

# (series id, fetch with a bounded window?) — cosd bounds the payload
# when FRED honours it; the parser does not depend on it, it takes
# the tail of whatever comes back.
DAILY_SERIES = {
    "hy": "BAMLH0A0HYM2",
    "bbb": "BAMLC0A4CBBB",
    "dgs10": "DGS10",
    "vix": "VIXCLS",
}
MONTHLY_SERIES = {"baa": "BAA"}
WEEKLY_SERIES = {"nfci": "NFCI"}
QUARTERLY_SERIES = {"sloos": "DRTSCILM"}

HISTORY_DAYS = 30   # daily history rows kept in credit_signals.json
HISTORY_WEEKS = 12  # NFCI weeks kept
HISTORY_QUARTERS = 8  # SLOOS quarters kept

# Bands: (upper bound, label, note). First match wins; the panel
# renders these from the data, so the numbers on screen can never
# drift from the method.
BANDS = {
    "hy": [
        (4.0, "Calm",
         "Below 4% — inside the range of the last three calm years (2.59–3.48%)."),
        (6.0, "Watch",
         "4–6% — widening; the April 2025 tariff shock peaked at 4.61%."),
        (float("inf"), "Warning",
         "Above 6% — the October 2022 peak; COVID cleared 10% and 2008 cleared 19%."),
    ],
    "bbb": [
        (1.5, "Calm",
         "Below 1.5% — the post-2023 range tops out at 1.49% (April 2025)."),
        (2.5, "Watch",
         "1.5–2.5% — the 2022 tightening ran through here."),
        (float("inf"), "Warning",
         "Above 2.5% — only genuine stress: March 2020 ran to about 4%."),
    ],
    "baa10y": [
        (2.0, "Calm",
         "Below 2% — where it has sat since 2023."),
        (3.0, "Watch",
         "2–3% — the October 2022 tightening peak, about 2.3%."),
        (float("inf"), "Warning",
         "Above 3% — the COVID spike ran to about 3.4%."),
    ],
    "sloos": [
        (10.0, "Calm",
         "Below 10% — banks roughly neutral on standards (negative is net easing)."),
        (30.0, "Watch",
         "10–30% — tightening is broadening; April 2025 printed 18.5%."),
        (float("inf"), "Warning",
         "Above 30% — 2020 Q3 hit 71.2%, 2023 Q3 50.8%."),
    ],
    "nfci": [
        (0.0, "Calm",
         "Below 0 — financial conditions looser than average."),
        (0.5, "Watch",
         "0–0.5 — tighter than average; COVID peaked at 0.31."),
        (float("inf"), "Warning",
         "Above 0.5 — a level the COVID shock never reached."),
    ],
    "vix20d": [
        (20.0, "Calm",
         "Below 20 — volatility has been ordinary for a month."),
        (30.0, "Watch",
         "20–30 — volatility has run hot for a month."),
        (float("inf"), "Warning",
         "Above 30 — the April–May 2025 tariff shock peaked near 32.5; COVID ran far above 30."),
    ],
}

# Sanity ranges (fail-closed): a value outside these means the parse
# is wrong, not that the market moved.
SANITY = {
    "hy": (0.0, 25.0),
    "bbb": (0.0, 10.0),
    "baa10y": (-2.0, 10.0),
    "sloos": (-100.0, 100.0),
    "nfci": (-2.0, 3.0),
    "vix": (5.0, 150.0),
    "vix20d": (5.0, 150.0),
}

ROW_META = {
    "hy": {
        "label": "Junk-bond spread",
        "detail": "ICE BofA US High Yield OAS",
        "unit": "%", "series": "BAMLH0A0HYM2", "frequency": "Daily",
    },
    "bbb": {
        "label": "BBB bond spread",
        "detail": "ICE BofA BBB US Corporate OAS",
        "unit": "%", "series": "BAMLC0A4CBBB", "frequency": "Daily",
    },
    "baa10y": {
        "label": "Baa – 10Y spread",
        "detail": "Moody's Baa yield minus 10-year Treasury yield",
        "unit": "%", "series": "BAA minus DGS10",
        "frequency": "Daily (Baa is a monthly average)",
    },
    "sloos": {
        "label": "Banks tightening loans",
        "detail": "Net % of banks tightening C&I lending standards, large/middle-market firms",
        "unit": "pp", "series": "DRTSCILM", "frequency": "Quarterly",
    },
    "nfci": {
        "label": "Financial conditions (NFCI)",
        "detail": "Chicago Fed National Financial Conditions Index",
        "unit": "", "series": "NFCI", "frequency": "Weekly",
    },
    "vix20d": {
        "label": "VIX, 20-day average",
        "detail": "Mean of the last 20 daily VIX closes",
        "unit": "", "series": "VIXCLS (20-day mean)", "frequency": "Daily",
    },
}
ROW_ORDER = ["hy", "bbb", "baa10y", "sloos", "nfci", "vix20d"]


def fail(msg):
    print(f"CREDIT SIGNALS REFRESH FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def fetch_fred(series_id, cosd=None):
    """Full FRED CSV series as sorted [(date_str, value)] (blank days
    skipped). cosd bounds the download when FRED honours it; the
    caller never depends on it — it takes the tail of what arrives."""
    url = FRED_CSV_URL + series_id
    if cosd:
        url += f"&cosd={cosd}"
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            text = r.read().decode("utf-8", errors="ignore")
    except Exception as e:
        fail(f"FRED {series_id} fetch failed: {e}")
    rows = []
    for line in text.splitlines()[1:]:
        parts = line.strip().split(",")
        if len(parts) < 2 or not parts[0] or not parts[1]:
            continue
        try:
            rows.append((parts[0], float(parts[1])))
        except ValueError:
            continue
    rows.sort(key=lambda p: p[0])
    if not rows:
        fail(f"FRED {series_id}: no usable observations")
    return rows


def latest_on_or_before(rows, cutoff):
    """Latest (date, value) dated on or before cutoff (ISO date)."""
    cand = [p for p in rows if p[0] <= cutoff]
    if not cand:
        fail(f"no observation on or before {cutoff}")
    return cand[-1]


def band_for(key, value):
    for upper, label, _note in BANDS[key]:
        if value < upper:
            return label
    return BANDS[key][-1][1]


def bands_json(key):
    out = []
    for upper, label, note in BANDS[key]:
        out.append({"max": None if upper == float("inf") else upper,
                    "label": label, "note": note})
    return out


def check_sanity(key, value):
    lo, hi = SANITY[key]
    if not (lo <= value <= hi):
        fail(f"{key} value {value} outside sanity range {lo}–{hi}")


def round2(v):
    return round(v, 2) if v is not None else None


def main():
    today = datetime.date.today().isoformat()
    cosd = (datetime.date.today()
            - datetime.timedelta(days=150)).isoformat()

    series = {}
    for key, sid in DAILY_SERIES.items():
        series[key] = fetch_fred(sid, cosd=cosd)
        print(f"  {sid}: {len(series[key])} obs, "
              f"latest {series[key][-1][0]} = {series[key][-1][1]}")
    for key, sid in MONTHLY_SERIES.items():
        series[key] = fetch_fred(sid)
        print(f"  {sid}: {len(series[key])} obs, "
              f"latest {series[key][-1][0]} = {series[key][-1][1]}")
    for key, sid in WEEKLY_SERIES.items():
        series[key] = fetch_fred(sid)
        print(f"  {sid}: {len(series[key])} obs, "
              f"latest {series[key][-1][0]} = {series[key][-1][1]}")
    for key, sid in QUARTERLY_SERIES.items():
        series[key] = fetch_fred(sid)
        print(f"  {sid}: {len(series[key])} obs, "
              f"latest {series[key][-1][0]} = {series[key][-1][1]}")

    # Latest value per row, each on or before today (FRED lags a day
    # on the daily series; BAA is monthly, NFCI weekly, SLOOS
    # quarterly — each row keeps its own as-of date).
    hy_date, hy = latest_on_or_before(series["hy"], today)
    bbb_date, bbb = latest_on_or_before(series["bbb"], today)
    dgs10_date, dgs10 = latest_on_or_before(series["dgs10"], today)
    baa_date, baa = latest_on_or_before(series["baa"], today)
    baa10y = round(baa - dgs10, 2)
    sloos_date, sloos = latest_on_or_before(series["sloos"], today)
    nfci_date, nfci = latest_on_or_before(series["nfci"], today)
    vix_date, vix_today = latest_on_or_before(series["vix"], today)

    # VIX 20-day average: mean of the last 20 closes on/before today.
    vix_rows = [p for p in series["vix"] if p[0] <= today]
    if len(vix_rows) < 20:
        fail(f"VIXCLS: only {len(vix_rows)} closes on/before {today}, "
             f"need 20 for the average")
    vix20d = round(sum(v for _d, v in vix_rows[-20:]) / 20, 2)

    values = {"hy": hy, "bbb": bbb, "baa10y": baa10y, "sloos": sloos,
              "nfci": nfci, "vix20d": vix20d, "vix": vix_today}
    for k, v in values.items():
        check_sanity(k, v)

    # Previous observation per row (for the day-over-day move).
    def prev_of(rows, date):
        cand = [p for p in rows if p[0] < date]
        return cand[-1] if cand else (None, None)

    hy_prev_date, hy_prev = prev_of(series["hy"], hy_date)
    bbb_prev_date, bbb_prev = prev_of(series["bbb"], bbb_date)
    dgs10_prev_date, dgs10_prev = prev_of(series["dgs10"], dgs10_date)
    baa10y_prev = (round(baa - dgs10_prev, 2)
                   if dgs10_prev is not None else None)
    sloos_prev_date, sloos_prev = prev_of(series["sloos"], sloos_date)
    nfci_prev_date, nfci_prev = prev_of(series["nfci"], nfci_date)
    vix20d_prev = None
    vix20d_prev_date = None
    if len(vix_rows) >= 21:
        vix20d_prev = round(
            sum(v for _d, v in vix_rows[-21:-1]) / 20, 2)
        vix20d_prev_date = vix_rows[-2][0]
    vix_prev_date, vix_prev = prev_of(series["vix"], vix_date)

    # Cross-check 1: the HY spread must agree with macro.json's HY
    # spread when the dates match — the site must never show two
    # different HY figures. (macro.json is written earlier in the
    # same nightly run, so the dates should match; a different date
    # just logs, it does not fail.)
    if os.path.exists(MACRO_JSON):
        try:
            macro = json.load(open(MACRO_JSON))
            mhy = (macro.get("credit") or {}).get("hy_spread") or {}
            if mhy.get("as_of") == hy_date and mhy.get("value") is not None:
                if abs(mhy["value"] - hy) > 0.02:
                    fail(f"HY cross-check: this run {hy} on {hy_date} "
                         f"vs macro.json {mhy['value']} on "
                         f"{mhy['as_of']}")
                print(f"  HY cross-check vs macro.json: agree ({hy})")
            elif mhy.get("as_of"):
                print(f"  HY cross-check skipped: macro.json is "
                      f"{mhy['as_of']}, this run is {hy_date}")
        except Exception as e:
            print(f"  HY cross-check skipped (macro.json unreadable): {e}")
    # Cross-check 2: the VIX close must agree with the index board's
    # VIX price when the dates match.
    if os.path.exists(INDEX_JSON):
        try:
            idx = json.load(open(INDEX_JSON))
            vix_card = (idx.get("indexes") or {}).get("VIX") or {}
            if (idx.get("price_date") == vix_date
                    and vix_card.get("price") is not None):
                if abs(vix_card["price"] - vix_today) / vix_today > 0.005:
                    fail(f"VIX cross-check: FRED VIXCLS {vix_today} on "
                         f"{vix_date} vs index board "
                         f"{vix_card['price']} on {idx['price_date']}")
                print(f"  VIX cross-check vs index board: agree "
                      f"({vix_today})")
            elif idx.get("price_date"):
                print(f"  VIX cross-check skipped: index board is "
                      f"{idx.get('price_date')}, this run is {vix_date}")
        except Exception as e:
            print(f"  VIX cross-check skipped (index_results unreadable): "
                  f"{e}")

    # Daily history: last HISTORY_DAYS trading days. baa10y on a day
    # is that day's DGS10 subtracted from the BAA value in force
    # (monthly); vix20d is the trailing 20-close mean ending that
    # day. Nulls where a series has no observation that day.
    hy_map = dict(series["hy"])
    bbb_map = dict(series["bbb"])
    dgs10_map = dict(series["dgs10"])
    vix_map = dict(series["vix"])
    baa_sorted = series["baa"]
    all_dates = sorted(set(hy_map) | set(bbb_map) | set(vix_map))
    all_dates = [d for d in all_dates if d <= today]
    daily_history = []
    for d in all_dates[-HISTORY_DAYS:]:
        baa_in_force = None
        for bd, bv in baa_sorted:
            if bd <= d:
                baa_in_force = bv
            else:
                break
        d10 = dgs10_map.get(d)
        row = {
            "date": d,
            "hy": hy_map.get(d),
            "bbb": bbb_map.get(d),
            "baa10y": (round(baa_in_force - d10, 2)
                       if baa_in_force is not None and d10 is not None
                       else None),
            "vix_close": vix_map.get(d),
            "vix20d": None,
        }
        # Trailing 20-close mean ending on this date, when available.
        closes = [v for cd, v in series["vix"] if cd <= d]
        if len(closes) >= 20:
            row["vix20d"] = round(sum(closes[-20:]) / 20, 2)
        daily_history.append(row)

    nfci_history = [
        {"date": d, "value": v}
        for d, v in series["nfci"][-HISTORY_WEEKS:]
    ]
    sloos_history = [
        {"date": d, "value": v}
        for d, v in series["sloos"][-HISTORY_QUARTERS:]
    ]

    rows_out = []
    row_values = {
        "hy": (hy, hy_date, hy_prev, hy_prev_date, None),
        "bbb": (bbb, bbb_date, bbb_prev, bbb_prev_date, None),
        "baa10y": (baa10y, dgs10_date, baa10y_prev, dgs10_prev_date,
                   {"baa": baa, "baa_as_of": baa_date,
                    "dgs10": dgs10, "dgs10_as_of": dgs10_date}),
        "sloos": (sloos, sloos_date, sloos_prev, sloos_prev_date, None),
        "nfci": (nfci, nfci_date, nfci_prev, nfci_prev_date, None),
        "vix20d": (vix20d, vix_date, vix20d_prev, vix20d_prev_date,
                   {"vix_today": vix_today,
                    "vix_today_as_of": vix_date,
                    "vix_today_prev": vix_prev,
                    "vix_today_prev_as_of": vix_prev_date}),
    }
    counts = {"calm": 0, "watch": 0, "warning": 0}
    for key in ROW_ORDER:
        value, as_of, prev, prev_as_of, extra = row_values[key]
        band = band_for(key, value)
        counts[band.lower()] += 1
        meta = ROW_META[key]
        row = {
            "key": key,
            "label": meta["label"],
            "detail": meta["detail"],
            "value": round2(value),
            "unit": meta["unit"],
            "as_of": as_of,
            "prev_value": round2(prev),
            "prev_as_of": prev_as_of,
            "band": band,
            "series": meta["series"],
            "frequency": meta["frequency"],
        }
        if extra:
            row.update(extra)
        rows_out.append(row)

    overall = ("Warning" if counts["warning"] else
               "Watch" if counts["watch"] else "Calm")

    out = {
        "as_of": today,
        "source": FRED_SOURCE,
        "source_url": FRED_SOURCE_URL,
        "rows": rows_out,
        "bands": {k: bands_json(k) for k in ROW_ORDER},
        "counts": counts,
        "overall": overall,
        "history": {
            "daily": daily_history,
            "nfci": nfci_history,
            "sloos": sloos_history,
        },
    }

    stored = None
    if os.path.exists(RESULTS):
        with open(RESULTS) as f:
            stored = json.load(f)
    if stored == out:
        print("No changes — nothing to write.")
        return
    with open(RESULTS, "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    print(f"Wrote {RESULTS}: overall {overall} "
          f"({counts['calm']} calm, {counts['watch']} watch, "
          f"{counts['warning']} warning); HY {hy}% ({hy_date}), "
          f"BBB {bbb}% ({bbb_date}), Baa-10Y {baa10y}% "
          f"({dgs10_date}), SLOOS {sloos} ({sloos_date}), "
          f"NFCI {nfci} ({nfci_date}), VIX 20d {vix20d} "
          f"(today {vix_today}, {vix_date}).")


if __name__ == "__main__":
    main()
