#!/usr/bin/env python3
"""One-off recovery driver for the 2026-11-18 close: backfill index
membership for 38 names + enforce the SPEC v1.5 §7 non-positive-FV
gate (IONQ), WITHOUT the fetch step.

Fix 1 — index filters: 38 names in the 382-ticker base carry
`indexes: null` although the Wikipedia constituent lists in
scripts/engine/index_lists.json (S&P 500 crawled 2026-11-08,
Nasdaq-100 2026-10-24, Dow 2026-11-17 — the same source the original
names' membership came from) list them as members. The v1.7 base
build carried indexes over for existing names but left them null for
new names. This driver sets every base record's `indexes` from those
lists (strictly additive: zero reverse mismatches — no name in the
base claims a membership the lists deny), then republishes through
the pipeline's own merge, so the /stocks filter counts move
S&P 500 138 -> 175, Nasdaq-100 41 -> 50, Dow Jones 21 -> 25.

Fix 2 — IONQ negative FV: the first v1.7 live refresh published IONQ
at FV -$1.24 (DCF -$54.39 / PEGY $51.91) because the refresh path had
no FV <= 0 gate — the seed merge enforced SPEC v1.5 §7, the refresh
did not. This driver applies the new `drop_nonpositive_fv()` gate
(nightly_refresh.py, added with this fix): IONQ leaves the published
set AND the base universe in the same run, so live_tickers() still
agrees on the next night — the BYND pattern. IONQ returns only by a
deliberate re-add to base_inputs.json.

Why no fetch: the Nov 18 close is final, and the plain refresh cannot
re-run — Yahoo's SNDK history is truncated to 2 bars (8-for-1 split
distributes after close Nov 19), so fetch_history fails the 200-bar
gate and the whole refresh fails closed. This driver reproduces cmd_live
steps 2-5 EXACTLY, using the pipeline's own functions, with the fetch
step replaced by its own stored output: the engine snapshot inputs
(scripts/engine/batch2/inputs.json) ARE the 02:58 refresh's refreshed
records (Nov 18 prices + Nov 18 technicals from full 251-bar history).
The only differences a fixed fetch would produce are the index
memberships (this fix) and the IONQ removal (this fix). Nothing is
hand-edited: results.json is written only by merge_results, via the
same write_json + build gate as cmd_live.

Safety: asserts before any write that the merged output differs from
the stored results in EXACTLY the 38 index backfills + the IONQ
removal, and matches the staged engine outputs on FV/overall/verdict/
pillars for the other 381 names. Any other diff -> exit without
writing. Backups are made first (*.pre-indexfix-bak).
"""
import copy
import datetime
import json
import os
import subprocess
import sys

# Repo scripts dir: CWD-relative first (run from the repo root), else the
# absolute workspace path.
_CANDIDATES = [os.path.join(os.getcwd(), "scripts"),
               os.path.expanduser("~/workspace/the-stock-check/scripts")]
SCRIPTS = next((c for c in _CANDIDATES
                if os.path.exists(os.path.join(c, "nightly_refresh.py"))),
               None)
assert SCRIPTS, "cannot locate the-stock-check/scripts"
sys.path.insert(0, SCRIPTS)

import nightly_refresh as nr  # noqa: E402

AS_OF = "2026-11-18"
PRICE_DATE = "2026-11-18"
INDEX_FILE = os.path.join(nr.ENGINE_DIR, "index_lists.json")


def membership_from_lists(lists, ticker):
    """Index membership codes for one ticker from the Wikipedia lists.
    Codes in SP500 / NASDAQ100 / DOW30 order; None when in no index.
    Matches the ticker_format_note (dots normalised to hyphens)."""
    m = []
    if ticker in lists["sp500"]:
        m.append("SP500")
    if ticker in lists["nasdaq100"]:
        m.append("NASDAQ100")
    if ticker in lists["dow30"]:
        m.append("DOW30")
    return m or None


def main():
    lists = nr.load_json(INDEX_FILE)
    base = nr.load_json(nr.BASE_INPUTS)
    stored = nr.load_json(nr.SITE_RESULTS)
    all_tickers = nr.live_tickers(base, stored)
    assert len(all_tickers) == 382, len(all_tickers)

    # Fix 1 — backfill indexes in the in-memory base from the lists.
    changed_idx = []
    for t in all_tickers:
        want = membership_from_lists(lists, t)
        if (base["tickers"][t].get("indexes") or None) != (want or None):
            base["tickers"][t]["indexes"] = copy.deepcopy(want)
            changed_idx.append(t)
    print(f"index membership backfilled for {len(changed_idx)} names")
    assert len(changed_idx) == 38, (
        f"expected 38, got {len(changed_idx)}: {changed_idx}")

    # Step 1 (replaces the fetch): the stored snapshot inputs ARE the
    # 02:58 refresh's refreshed records. Carry the fixed indexes the
    # same way refresh_ticker does (frozen passthrough from base).
    snap = nr.load_json(os.path.join(nr.ENGINE_DIR, "batch2", "inputs.json"))
    new_tickers = copy.deepcopy(snap["tickers"])
    assert sorted(new_tickers) == all_tickers
    for t in all_tickers:
        new_tickers[t]["indexes"] = copy.deepcopy(
            base["tickers"][t].get("indexes"))

    # Step 2-3: split inputs, run both engines staged, gate.
    inputs = nr.split_inputs(new_tickers, AS_OF, PRICE_DATE)
    results = nr.run_engines_staged(inputs, all_tickers)
    nr.gate_engine_outputs(results, stored, all_tickers)

    # Step 4: merge (same call as cmd_live).
    merged = nr.merge_results(results["v13"], results["batch2"],
                              AS_OF, PRICE_DATE, refreshed=new_tickers)
    merged["av_earnings_coverage"] = nr.load_av_coverage(stored)

    # Fix 2 — SPEC v1.5 §7 gate: drop non-positive FVs from the
    # published set (and from the base universe below).
    dropped = nr.drop_nonpositive_fv(merged, all_tickers)
    print(f"non-positive FV dropped: {dropped}")
    assert dropped == ["IONQ"], f"expected ['IONQ'], got {dropped}"
    for t in dropped:
        base["tickers"].pop(t, None)
    assert len(base["tickers"]) == 381 and len(merged["tickers"]) == 381

    # Safety asserts: only the 38 index backfills + the IONQ removal
    # differ from stored; everything else is byte-identical on the
    # scored fields.
    def key(rec):
        return (rec["triangulated_fv"], rec["overall_score"],
                rec["verdict"],
                rec["pillars"]["conviction"]["score"],
                rec["pillars"]["valuation"]["score"],
                rec["pillars"]["quality"]["score"],
                rec["pillars"]["technical"]["score"],
                rec["pillars"]["trust"]["score"])

    for t in merged["tickers"]:
        assert key(merged["tickers"][t]) == key(stored["tickers"][t]), t
        assert (merged["tickers"][t].get("indexes") or None) == (
            base["tickers"][t].get("indexes") or None), t
    assert "IONQ" not in merged["tickers"]
    assert all((r["triangulated_fv"] or 0) > 0
               for r in merged["tickers"].values()), "FV <= 0 remains"
    counts = {"SP500": 0, "NASDAQ100": 0, "DOW30": 0}
    for rec in merged["tickers"].values():
        for code in (rec.get("indexes") or []):
            counts[code] += 1
    print(f"published index counts: {counts}")
    assert counts == {"SP500": 175, "NASDAQ100": 50, "DOW30": 25}, counts
    for t in ("NFLX", "JPM"):
        assert "SP500" in (merged["tickers"][t].get("indexes") or []), t
    assert "DOW30" in (merged["tickers"]["JPM"].get("indexes") or [])
    print("asserts PASS: exactly the 38 backfills + IONQ removal; "
          "all other 381 names identical on FV/score/verdict/pillars")

    # Backups, then the same writes as cmd_live step 4 (plus base).
    for path in (nr.BASE_INPUTS, nr.SITE_RESULTS,
                 os.path.join(nr.ENGINE_DIR, "v13", "inputs.json"),
                 os.path.join(nr.ENGINE_DIR, "v13", "results.json"),
                 os.path.join(nr.ENGINE_DIR, "batch2", "inputs.json"),
                 os.path.join(nr.ENGINE_DIR, "batch2", "results.json")):
        bak = path + ".pre-indexfix-bak"
        if not os.path.exists(bak):
            with open(path) as f:
                data = f.read()
            with open(bak, "w") as f:
                f.write(data)
            print(f"  backed up {path} -> {bak}")
    for key in ("v13", "batch2"):
        nr.write_json(os.path.join(nr.ENGINE_DIR, key, "inputs.json"),
                      inputs[key])
        nr.write_json(os.path.join(nr.ENGINE_DIR, key, "results.json"),
                      results[key])
    nr.write_json(nr.BASE_INPUTS, base)
    nr.write_json(nr.SITE_RESULTS, merged)
    print("wrote base_inputs.json (381) + engine snapshots + "
          "lib/data/results.json (381)")
    # market.json / macro.json unchanged (same Nov 18 close) — not rewritten.
    ts = datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ")
    n_stock, n_other = nr.sync_sitemap(sorted(merged["tickers"]), ts)
    print(f"sitemap.xml: {n_stock} stock + {n_other} other urls, "
          f"lastmod -> {ts}")
    print("\nrunning `npm run build` ...")
    r = subprocess.run(["npm", "run", "build"], cwd=nr.ROOT)
    if r.returncode != 0:
        nr.fail("`npm run build` failed after fix — data was written; "
                "fix the build before deploying")
    print("build: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
