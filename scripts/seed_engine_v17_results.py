#!/usr/bin/env python3
"""Seed lib/data/results.json for the engine-v1.7 expansion (SPEC v1.5).
Run once: python3 scripts/seed_engine_v17_results.py

Runs both staged v1.7 engine copies on the new 382-ticker base at the
2026-11-13 close (the same run_engines_staged + merge_results path the
dry run uses — no fetching), writes lib/data/results.json with as_of
2026-11-18 / price_date 2026-11-13, and carries av_earnings_coverage
from the stored results via load_av_coverage.

Then verifies the merged output against the workspace v1.7 results.json
— the real gate, since the dry run after seeding is circular by
construction (merged == seeded by design). For every publishable name
the merged record must deep-equal the workspace record, excluding only
the intended differences:
  * flags / name — the site base carries public copy (RULEBOOK §16);
    the workspace records carry recipe language (and name None for
    EFOR / OLED / ELPC).
  * stock_verdicts / vs_stock_verdicts — the site base drops the
    stock_verdicts input, so the staged engines emit None there.
  * analysts / debt_fcf / indexes / market_cap / rel_vol / lynch —
    merge additions, not engine output.
  * the DCF grid note (batch2 textfix) and the merge-added actual-growth
    grid row — values are compared, text is not.
Also verifies, through the staged run, that the Trust completeness
reproduces the v1.7 provenance completeness for all 382 names.
"""
import copy
import hashlib
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nightly_refresh as nr

SITE = nr.ROOT
RESULTS = nr.SITE_RESULTS
BASE = nr.BASE_INPUTS
PIPE = "/home/hatch/workspace/stock-verdicts-better"
WS_RESULTS = os.path.join(PIPE, "scoring-engine-v1.7", "results.json")
PROVENANCE = os.path.join(
    PIPE, "full-universe-pipeline", "refresh", "fragments_provenance.json")

# Keys excluded from the deep comparison (see the module docstring).
# publish / publish_reason are added by run_v17.py after the workspace
# run, not by the engine — the site engine never emits them.
EXCLUDE_TOP = {"analysts", "debt_fcf", "indexes", "market_cap", "rel_vol",
               "lynch", "flags", "name", "stock_verdicts",
               "vs_stock_verdicts", "publish", "publish_reason"}


def deep_compare(merged_rec, ws_rec, path, diffs):
    """Deep-compare two records, honouring the exclusions. Appends
    (path, merged_value, ws_value) to diffs; returns nothing."""
    if isinstance(ws_rec, dict):
        assert isinstance(merged_rec, dict), f"{path}: type mismatch"
        m_keys = set(merged_rec) - EXCLUDE_TOP
        w_keys = set(ws_rec) - EXCLUDE_TOP
        for k in sorted(m_keys - w_keys):
            diffs.append((f"{path}.{k}", "present in merged only",
                          merged_rec[k]))
        for k in sorted(w_keys - m_keys):
            diffs.append((f"{path}.{k}", "present in workspace only",
                          ws_rec[k]))
        for k in sorted(m_keys & w_keys):
            if (path.endswith("dcf_sensitivity_grid") and k == "note"):
                continue  # batch2 textfix: values only
            if (path.endswith("dcf_sensitivity_grid") and k == "values"):
                # The grid is None when there is no DCF leg (e.g. AGNC).
                if merged_rec[k] is None or ws_rec[k] is None:
                    if merged_rec[k] != ws_rec[k]:
                        diffs.append((f"{path}.values", merged_rec[k],
                                      ws_rec[k]))
                    continue
                for gk in sorted(set(merged_rec[k]) - set(ws_rec[k])):
                    # The merge-added actual-growth row.
                    assert gk not in ws_rec[k], f"{path}.values.{gk}"
                for gk in sorted(set(ws_rec[k]) & set(merged_rec[k])):
                    deep_compare(merged_rec[k][gk], ws_rec[k][gk],
                                 f"{path}.values.{gk}", diffs)
                continue
            deep_compare(merged_rec[k], ws_rec[k], f"{path}.{k}", diffs)
    elif isinstance(ws_rec, list):
        assert isinstance(merged_rec, list), f"{path}: type mismatch"
        assert len(merged_rec) == len(ws_rec), (
            f"{path}: list length {len(merged_rec)} vs {len(ws_rec)}")
        for i, (a, b) in enumerate(zip(merged_rec, ws_rec)):
            deep_compare(a, b, f"{path}[{i}]", diffs)
    else:
        if merged_rec != ws_rec:
            diffs.append((path, merged_rec, ws_rec))


def main():
    base = nr.load_json(BASE)
    stored = nr.load_json(RESULTS)
    ws = nr.load_json(WS_RESULTS)
    prov = nr.load_json(PROVENANCE)
    assert len(base["tickers"]) == 382, len(base["tickers"])
    assert "BYND" not in base["tickers"] and "SO" in base["tickers"]
    assert base["price_date"] == "2026-11-13"
    all_tickers = sorted(base["tickers"])
    publishable = {("BRK-B" if t == "BRK.B" else t)
                   for t, r in ws["tickers"].items() if r["publish"]}
    assert set(all_tickers) == publishable, "base != publishable set"

    inputs = nr.split_inputs(base["tickers"], base["as_of"],
                             base["price_date"])
    print(f"seed: running both staged v1.7 engines on the 382-ticker base "
          f"(as of {base['price_date']} close), no fetching")
    results = nr.run_engines_staged(inputs, all_tickers)
    merged = nr.merge_results(results["v13"], results["batch2"],
                              "2026-11-18", "2026-11-13",
                              refreshed=base["tickers"])
    merged["av_earnings_coverage"] = nr.load_av_coverage(stored)
    assert merged["engine"] == "scoring-engine-v1.7 (SPEC v1.5 FINAL)", \
        merged["engine"]
    assert len(merged["tickers"]) == 382

    # ---- the real gate: deep-compare against the workspace v1.7 run ----
    diffs = []
    for t in all_tickers:
        ws_t = "BRK.B" if t == "BRK-B" else t
        deep_compare(merged["tickers"][t], ws["tickers"][ws_t], t, diffs)
    print(f"workspace comparison: {len(diffs)} diffs over {len(all_tickers)} "
          f"names (excluding flags/name/stock_verdicts/merge additions/"
          f"grid note)")
    for path, a, b in diffs[:20]:
        print(f"  DIFF {path}: merged={a!r} workspace={b!r}")
    if diffs:
        nr.fail("seed: merged output does NOT reproduce the workspace "
                "v1.7 results.json")

    # ---- Trust completeness vs provenance, through the staged run ------
    comp_diffs = []
    for t in all_tickers:
        prov_t = "BRK.B" if t == "BRK-B" else t
        got = (merged["tickers"][t]["pillars"]["trust"]["detail"]
               ["subscores"]["completeness"])
        want = prov[prov_t]["completeness"]
        if got != want:
            comp_diffs.append((t, got, want))
    print(f"completeness vs provenance: {len(comp_diffs)} mismatches / "
          f"{len(all_tickers)}")
    for t, got, want in comp_diffs[:10]:
        print(f"  {t}: staged {got} vs provenance {want}")
    if comp_diffs:
        nr.fail("seed: staged Trust completeness does not match provenance")

    # ---- spot checks -----------------------------------------------------
    spot = {"APP": (318.59, "Avoid"), "SO": (56.28, "Avoid"),
            "SNDK": (4103.60, "Growth"), "NFLX": (62.79, "Watch"),
            "TSM": (450.84, "Growth"), "HOOD": (61.80, "Avoid"),
            "SOFI": (12.35, "Avoid"), "IONQ": (1.13, "Avoid"),
            "NET": (29.21, "Avoid"), "NVO": (None, None), "JPM": (None, None)}
    for t, (fv, verdict) in spot.items():
        rec = merged["tickers"][t]
        if fv is not None:
            assert rec["triangulated_fv"] == fv, (
                f"{t}: FV {rec['triangulated_fv']} != {fv}")
            assert rec["verdict"] == verdict, (
                f"{t}: verdict {rec['verdict']} != {verdict}")
        print(f"  spot {t}: FV ${rec['triangulated_fv']:,.2f} "
              f"{rec['verdict']} overall {rec['overall_score']}")
    n_2leg = sum(1 for t in all_tickers
                 if sum(1 for v in merged["tickers"][t]["pillars"]
                        ["valuation"]["detail"]["legs"].values()
                        if v["value"] is not None) == 2)
    print(f"  2-leg cards in the seed: {n_2leg} "
          f"(workspace: 95 of 400 scored, 382 publishable)")

    # ---- write ------------------------------------------------------------
    bak = RESULTS + ".pre-v17-bak"
    if not os.path.exists(bak):
        with open(bak, "w") as f:
            json.dump(stored, f, indent=2)
        print(f"backed up the v1.6 results to {bak}")
    before = hashlib.md5(open(RESULTS, "rb").read()).hexdigest()
    nr.write_json(RESULTS, merged)
    after = hashlib.md5(open(RESULTS, "rb").read()).hexdigest()
    print(f"results.json md5: {before} -> {after}")
    print(f"wrote lib/data/results.json: 382 tickers, as_of 2026-11-18, "
          f"price_date 2026-11-13, engine v1.7")
    print("seed: OK — merged output reproduces the workspace v1.7 run "
          "exactly (382/382)")


if __name__ == "__main__":
    main()
