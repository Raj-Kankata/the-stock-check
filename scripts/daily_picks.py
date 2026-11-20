#!/usr/bin/env python3
"""Daily picks table — The Stock Check.

Appends one new picks table per day to lib/site.ts (PICKS, cohort
'daily') under Raj's rule of 19 Nov 2026: the top 5 by overall score
at the previous close, entered at that close. The /performance page
groups each day's five entries into one table, newest first.

Run each morning AFTER the nightly refresh (05:20 UTC) has landed —
the script reads the fresh lib/data/results.json and
lib/data/market.json the refresh wrote. It does NOT commit or push;
the caller (cron / workflow) does that after the script exits 0.

FAIL-CLOSED gates — any failure exits non-zero and writes NOTHING:
  1. Freshness: results.json price_date must equal the expected close
     date — the latest Mon-Fri date on or before yesterday (UTC).
     A failed nightly refresh leaves price_date one close behind, so
     this catches it. On a US market holiday there is no new close and
     the gate refuses: a skipped table is reported, never a wrong one.
     Override with --expected-date YYYY-MM-DD after a human verifies
     the close date by hand.
  2. Benchmark: lib/data/market.json ^GSPC close must exist and its
     as_of must equal price_date (the benchmark entry close has to be
     from the same close).
  3. No duplicates: no daily table may already exist for price_date,
     and price_date must be newer than every daily entry date already
     in PICKS.
  4. Selection: at least 5 tickers with a numeric overall_score and a
     positive price. Ranking is overall_score descending; ties break
     alphabetically by symbol (deterministic, documented here).

Usage:
  python3 scripts/daily_picks.py            # append today's table
  python3 scripts/daily_picks.py --dry-run  # print the selection and
                                             # gate verdicts, write nothing
  python3 scripts/daily_picks.py --expected-date 2026-11-19
"""

import argparse
import json
import re
import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESULTS = ROOT / "lib" / "data" / "results.json"
MARKET = ROOT / "lib" / "data" / "market.json"
SITE_TS = ROOT / "lib" / "site.ts"
TOP_N = 5


def expected_close_date(today: date) -> date:
    """Latest Mon-Fri date on or before yesterday (UTC)."""
    d = today - timedelta(days=1)
    while d.weekday() >= 5:  # Sat / Sun
        d -= timedelta(days=1)
    return d


def load_results() -> tuple[str, list[tuple[float, str, float, str]]]:
    data = json.loads(RESULTS.read_text())
    price_date = data["price_date"]
    ranked = []
    for symbol, t in data["tickers"].items():
        score = t.get("overall_score")
        price = t.get("price")
        if isinstance(score, (int, float)) and isinstance(price, (int, float)) and price > 0:
            ranked.append((float(score), symbol, float(price), str(t.get("verdict", ""))))
    ranked.sort(key=lambda r: (-r[0], r[1]))
    return price_date, ranked


def load_spx_close(market_asof_expected: str) -> tuple[float, str]:
    data = json.loads(MARKET.read_text())
    as_of = data.get("as_of", "")
    for idx in data.get("indices", []):
        if idx.get("symbol") == "^GSPC":
            return float(idx["close"]), as_of
    raise ValueError("market.json has no ^GSPC entry")


def existing_daily_dates(site_text: str) -> list[str]:
    return sorted(set(re.findall(r"cohort: 'daily' as const, entryDate: '(\d{4}-\d{2}-\d{2})'", site_text)))


def insert_picks(site_text: str, entries: list[str], price_date: str) -> str:
    """Insert one day's PICKS lines before the PICKS array's closing `]`."""
    start = site_text.index("export const PICKS")
    start = site_text.index("[", start)  # the `= [` opening the array
    end = site_text.index("\n]", start)
    block = "\n".join(entries)
    return site_text[:end] + "\n" + block + site_text[end:]


def insert_benchmark(site_text: str, price_date: str, spx_close: float) -> str:
    """Insert one DAILY_BENCHMARK_CLOSES line before its closing brace."""
    start = site_text.index("export const DAILY_BENCHMARK_CLOSES")
    end = site_text.index("\n}", start)
    line = f"  '{price_date}': {spx_close!r},"
    return site_text[:end] + "\n" + line + site_text[end:]


def main() -> int:
    ap = argparse.ArgumentParser(description="Append one daily picks table (top 5 by overall score).")
    ap.add_argument("--dry-run", action="store_true", help="Print the selection and gate verdicts; write nothing.")
    ap.add_argument("--expected-date", default=None, help="Override the expected close date (YYYY-MM-DD).")
    args = ap.parse_args()

    today = date.today()
    expected = date.fromisoformat(args.expected_date) if args.expected_date else expected_close_date(today)

    price_date, ranked = load_results()
    top5 = ranked[:TOP_N]
    try:
        spx_close, market_asof = load_spx_close(price_date)
    except (ValueError, KeyError, TypeError) as exc:
        print(f"FAIL: {exc}")
        return 1

    site_text = SITE_TS.read_text()
    daily_dates = existing_daily_dates(site_text)

    # --- Selection report (always printed, even in dry-run) ---
    print(f"results.json price_date: {price_date}  (expected close date: {expected})")
    print(f"market.json ^GSPC close: {spx_close}  (as_of: {market_asof})")
    print(f"existing daily tables: {daily_dates or 'none'}")
    print(f"Top {TOP_N} by overall score at the {price_date} close:")
    for score, symbol, price, verdict in top5:
        print(f"  {symbol:6s} {score:5.1f}  ${price:>9.2f}  {verdict}")

    # --- Fail-closed gates ---
    errors: list[str] = []
    if price_date != expected.isoformat():
        errors.append(
            f"price_date {price_date} != expected close date {expected} — "
            "the nightly refresh has not landed a fresh close (or today is a market holiday). "
            "Refusing to build a table on stale closes."
        )
    if market_asof != price_date:
        errors.append(f"market.json as_of {market_asof} != price_date {price_date} — benchmark close is from a different day.")
    if price_date in daily_dates:
        errors.append(f"a daily table for {price_date} already exists in lib/site.ts — refusing to duplicate it.")
    elif daily_dates and price_date <= daily_dates[-1]:
        errors.append(f"price_date {price_date} is not newer than the latest daily table ({daily_dates[-1]}) — data went backwards.")
    if len(top5) < TOP_N:
        errors.append(f"only {len(top5)} tickers have a numeric overall score and positive price — need {TOP_N}.")

    if errors:
        for e in errors:
            print(f"FAIL: {e}")
        return 1

    if args.dry_run:
        print("DRY RUN: all gates pass — no files written.")
        return 0

    # --- Write: one comment + five PICKS lines, one benchmark line ---
    summary = ", ".join(f"{s} {sc:.1f}" for sc, s, _, _ in top5)
    entries = [f"  // Daily picks {price_date} — top {TOP_N} by overall score: {summary}."]
    for score, symbol, price, _verdict in top5:
        entries.append(
            f"  {{ symbol: '{symbol}', entryPrice: {price!r}, cohort: 'daily' as const, entryDate: '{price_date}' }},"
        )
    new_text = insert_picks(site_text, entries, price_date)
    new_text = insert_benchmark(new_text, price_date, spx_close)

    # --- Verify the write by re-parsing ---
    after = existing_daily_dates(new_text)
    if price_date not in after:
        print("FAIL: write verification failed — the new entry date is not in lib/site.ts after the edit.")
        return 1
    if new_text.count(f"entryDate: '{price_date}'") != TOP_N:
        print(f"FAIL: write verification failed — expected {TOP_N} entries for {price_date}.")
        return 1
    if f"'{price_date}': {spx_close!r}," not in new_text:
        print("FAIL: write verification failed — the benchmark close line is missing.")
        return 1

    SITE_TS.write_text(new_text)
    print(f"OK: appended daily picks for {price_date} to lib/site.ts (top {TOP_N} by overall score).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
