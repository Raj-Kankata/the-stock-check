#!/usr/bin/env python3
"""One-off recovery driver for the 2026-11-18 close: apply the trailing_pe
fix (nightly_refresh.py _update_price_fields: never derive a trailing P/E
from a non-positive trailing EPS) to the already-published Nov 18 data,
WITHOUT the fetch step.

Why this exists: the Nov 18 live refresh derived trailing_pe =
price / trailing_eps for 48 loss-making names (trailing EPS <= 0),
inventing negative P/Es and resurrecting nonsense negative PEGY legs
(e.g. LITE -$1,745.50), which flipped 6 verdicts and collapsed 48 FVs.
The fix is one line in nightly_refresh.py, but the plain refresh cannot
re-run: Yahoo's SNDK history is truncated to 2 bars (split rebuild —
8-for-1 split distributes after close Nov 19), so fetch_history fails
the 200-bar gate and the whole refresh fails closed.

This driver reproduces cmd_live steps 2-5 EXACTLY, using the pipeline's
own functions, with the fetch step replaced by its own stored output:
the engine snapshot inputs (scripts/engine/batch2/inputs.json) ARE the
02:58 refresh's refreshed records (Nov 18 prices + Nov 18 technicals
from full 251-bar history). The Nov 18 close is final, so a re-fetch
would return identical prices/technicals; the ONLY difference the fixed
fetch would produce is trailing_pe=None for the 48 names, which is what
step 2 below applies. Nothing is hand-edited: results.json is written
only by merge_results, via the same write_json + build gate as cmd_live.

Safety: asserts before any write that the merged output differs from
the stored results in EXACTLY the 48 names (and matches the staged
engine outputs on FV/overall/verdict/pillars). Any other diff -> exit
without writing. Backups are made first (lib/data/results.json and the
engine snapshots as *.pre-pegyfix-bak).
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


def main():
    base = nr.load_json(nr.BASE_INPUTS)
    stored = nr.load_json(nr.SITE_RESULTS)
    all_tickers = nr.live_tickers(base, stored)

    # Step 1 (replaces the fetch): the stored snapshot inputs ARE the
    # 02:58 refresh's refreshed records. Apply the trailing_pe fix.
    snap = nr.load_json(os.path.join(nr.ENGINE_DIR, "batch2", "inputs.json"))
    new_tickers = copy.deepcopy(snap["tickers"])
    fixed = []
    for t, rec in new_tickers.items():
        if base["tickers"][t].get("trailing_pe") is None \
                and rec.get("trailing_pe") is not None:
            rec["trailing_pe"] = None
            fixed.append(t)
    print(f"trailing_pe corrected to None for {len(fixed)} names")
    assert len(fixed) == 48, f"expected 48, got {len(fixed)}: {fixed}"

    # Step 2-3: split inputs, run both engines staged, gate.
    inputs = nr.split_inputs(new_tickers, AS_OF, PRICE_DATE)
    results = nr.run_engines_staged(inputs, all_tickers)
    nr.gate_engine_outputs(results, stored, all_tickers)

    # Step 4: merge (same call as cmd_live).
    merged = nr.merge_results(results["v13"], results["batch2"],
                              AS_OF, PRICE_DATE, refreshed=new_tickers)
    merged["av_earnings_coverage"] = nr.load_av_coverage(stored)

    # Safety assert: merged differs from stored in EXACTLY the 48 names,
    # and matches the staged engine outputs on the scored fields.
    def key(rec):
        return (rec["triangulated_fv"], rec["overall_score"],
                rec["verdict"],
                rec["pillars"]["conviction"]["score"],
                rec["pillars"]["valuation"]["score"],
                rec["pillars"]["quality"]["score"],
                rec["pillars"]["technical"]["score"],
                rec["pillars"]["trust"]["score"])

    diffs = []
    for t in all_tickers:
        if key(merged["tickers"][t]) != key(stored["tickers"][t]):
            diffs.append(t)
    print(f"merged differs from stored on {len(diffs)} names")
    assert sorted(diffs) == sorted(fixed), (
        f"diff set != fixed set: extra {sorted(set(diffs) - set(fixed))}, "
        f"missing {sorted(set(fixed) - set(diffs))}")
    for t in all_tickers:
        assert key(merged["tickers"][t]) == key(
            results["batch2"]["tickers"][t]) or t in nr.V13_TICKERS, t
    print("asserts PASS: exactly the 48 fixed names move, nothing else")

    flips = [t for t in diffs
             if stored["tickers"][t]["verdict"]
             != merged["tickers"][t]["verdict"]]
    print(f"VERDICT FLIPS: {', '.join(flips) if flips else 'none'}")
    for t in diffs:
        o, n = stored["tickers"][t], merged["tickers"][t]
        print(f"  {t:<7} FV ${o['triangulated_fv']:>8.2f} -> "
              f"${n['triangulated_fv']:>8.2f}  {o['overall_score']:>5.1f} -> "
              f"{n['overall_score']:>5.1f}  {o['verdict']:>6} -> "
              f"{n['verdict']:<6}")

    # Backups, then the same writes as cmd_live step 4.
    for path in (nr.SITE_RESULTS,
                 os.path.join(nr.ENGINE_DIR, "v13", "inputs.json"),
                 os.path.join(nr.ENGINE_DIR, "v13", "results.json"),
                 os.path.join(nr.ENGINE_DIR, "batch2", "inputs.json"),
                 os.path.join(nr.ENGINE_DIR, "batch2", "results.json")):
        bak = path + ".pre-pegyfix-bak"
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
    nr.write_json(nr.SITE_RESULTS, merged)
    print("wrote engine snapshots + lib/data/results.json")
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
