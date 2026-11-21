#!/usr/bin/env python3
"""Seed the v1.9 (SPEC v1.7) additions into lib/data/results.json.
Run once: python3 scripts/seed_engine_v19_results.py

Delta driver on the fix_indexes_ionq_nov18.py pattern: it reproduces
cmd_live steps 1-2 and 4-5 EXACTLY, using nightly_refresh's own
functions, for the one purpose the nightly cannot serve — growing the
live set. live_tickers() requires base == results, so new names are
seeded here first; from tonight the nightly refresh maintains them
like any other card.

Universe for the computation: the new 383-name base (381 carried +
ARM + CLOV, from apply_engine_v19_base.py) PLUS IONQ, whose base
record is recovered from base_inputs.json.pre-indexfix-bak (the
382-name base of 2026-11-18) and included IN MEMORY ONLY. IONQ's fate
is decided by the pipeline's own §7 gate at the 2026-11-20 close:
drop_nonpositive_fv() must drop exactly IONQ (its DCF leg is -$54.39
and its PEGY leg scales with price; at the $20.72 close the mean FV
is negative). The written base never contains IONQ.

Gates (all fail-closed; nothing is written unless every one passes):
  * every ticker's last bar is the 2026-11-20 close;
  * no split factor fires anywhere (SNDK's 8-for-1 was already
    written back to the base by the 2026-11-20 refresh);
  * drop_nonpositive_fv drops exactly ['IONQ'];
  * BLAST RADIUS: for all 381 carried names the merged record's
    triangulated_fv / overall_score / verdict, all five pillar
    scores and all three leg values equal the stored results.json
    exactly (the same assertion style as the v1.7 seed);
  * the final results diff vs stored is EXACTLY the ARM + CLOV
    additions, plus the engine version string (v1.8 -> v1.9);
  * `npm run build` passes after the writes (run separately).

Writes (mirroring cmd_live step 4): scripts/engine/{v13,batch2}/
inputs.json + results.json (the staged engine files for the 383-name
set — IONQ removed from the batch2 copies after the gate, exactly as
cmd_live's own drop write-back would leave them), lib/data/
results.json, and the sitemap via sync_sitemap. market.json /
macro.json are NOT touched (same close; already current).
A JSON report is written to seed_engine_v19_report.json.
"""
import copy
import datetime
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nightly_refresh as nr  # noqa: E402

AS_OF = "2026-11-21"          # the stored results' as_of (Nov 20 close,
END = None                    # landed by the 2026-11-21 re-run, which ran
PRICE_DATE = "2026-11-20"     # cmd_live with the default as_of -> end=None;
                              # fetching with end=2026-11-22 shifted the 1y
                              # window one bar and moved EMA200 (HPE 45.47 vs
                              # stored 45.42) — so this driver fetches with
                              # end=None on the same UTC day, exactly as the
                              # stored run did.
REPORT = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      "seed_engine_v19_report.json")


def main():
    base = nr.load_json(nr.BASE_INPUTS)          # 383, post-v19-apply
    stored = nr.load_json(nr.SITE_RESULTS)       # 381 @ 2026-11-20
    assert len(base["tickers"]) == 383 and len(stored["tickers"]) == 381
    assert stored["as_of"] == AS_OF and stored["price_date"] == PRICE_DATE

    # In-memory 384-name base: disk base + IONQ recovered from the
    # pre-indexfix backup. BASE_INPUTS is redirected to a temp copy so
    # split_inputs / merge_results (which load it themselves) see the
    # same 384-name universe cmd_live would have seen.
    bak = nr.load_json(nr.BASE_INPUTS + ".pre-indexfix-bak")
    assert "IONQ" in bak["tickers"] and len(bak["tickers"]) == 382
    full_base = copy.deepcopy(base)
    full_base["tickers"]["IONQ"] = copy.deepcopy(bak["tickers"]["IONQ"])
    tmp_base = "/tmp/base_inputs_v19_seed.json"
    nr.write_json(tmp_base, full_base)
    nr.BASE_INPUTS = tmp_base
    all_base = full_base["tickers"]
    tickers = sorted(all_base)
    assert len(tickers) == 384

    # ---- step 1: fetch + refresh every ticker in memory ------------------
    tv_symbols = nr.load_json(nr.EXCHANGES_JSON)
    new_tickers, bar_dates = {}, set()
    for t in tickers:
        hist = nr.fetch_history(t, end=END)
        hist = nr.drop_intraday_bar(hist)
        if nr._is_null(float(hist["Close"].iloc[-1])):
            price, refetched = nr.recover_null_close(
                t, tv_symbols.get(t), END)
            if refetched is not None:
                hist = refetched
            else:
                hist = hist.copy()
                hist.iloc[-1, hist.columns.get_loc("Close")] = price
        rec, bar_date, split_factor = nr.refresh_ticker(
            all_base[t], hist, symbol=t, tv_symbol=tv_symbols.get(t))
        assert split_factor == 1.0, f"{t}: unexpected split factor {split_factor}"
        new_tickers[t] = rec
        bar_dates.add(bar_date)
    assert bar_dates == {PRICE_DATE}, bar_dates
    print(f"step 1: refreshed 384 tickers at the {PRICE_DATE} close")

    # ---- step 2: engines + merge + the §7 gate ----------------------------
    inputs = nr.split_inputs(new_tickers, AS_OF, PRICE_DATE)
    results = nr.run_engines_staged(inputs, tickers)
    for key in ("v13", "batch2"):
        for t in inputs[key]["tickers"]:
            assert t in results[key]["tickers"], f"{key} output missing {t}"
            fv = results[key]["tickers"][t]["triangulated_fv"]
            if t in stored["tickers"]:
                assert fv is not None, f"{key}: {t} FV null (stored non-null)"
    merged = nr.merge_results(results["v13"], results["batch2"],
                              AS_OF, PRICE_DATE, refreshed=new_tickers)
    merged["av_earnings_coverage"] = nr.load_av_coverage(stored)
    ionq_fv = merged["tickers"]["IONQ"]["triangulated_fv"]
    dropped = nr.drop_nonpositive_fv(merged, tickers)
    print(f"step 2: IONQ refreshed FV at the {PRICE_DATE} close: "
          f"${ionq_fv:.2f} -> dropped by the §7 gate: {dropped}")
    assert dropped == ["IONQ"], dropped

    # ---- step 3: blast radius — carried 381 unchanged ----------------------
    for t in stored["tickers"]:
        a, b = stored["tickers"][t], merged["tickers"][t]
        for f in ("triangulated_fv", "overall_score", "verdict"):
            assert a[f] == b[f], (t, f, a[f], b[f])
        for pil in ("conviction", "valuation", "quality", "technical", "trust"):
            assert a["pillars"][pil]["score"] == b["pillars"][pil]["score"], (t, pil)
        la = a["pillars"]["valuation"]["detail"]["legs"]
        lb = b["pillars"]["valuation"]["detail"]["legs"]
        for k in la:
            assert la[k]["value"] == lb[k]["value"], (t, k)
    assert merged["as_of"] == stored["as_of"]
    assert merged["price_date"] == stored["price_date"]
    assert merged["engine"] == "scoring-engine-v1.9 (SPEC v1.7 FINAL)"
    assert stored["engine"] == "scoring-engine-v1.8 (SPEC v1.6 FINAL)"
    assert set(merged["tickers"]) == set(stored["tickers"]) | {"ARM", "CLOV"}
    print("step 3: blast radius 0 — all 381 carried records reproduce the "
          "stored FV / overall / verdict / pillar scores / leg values exactly")

    # ---- step 4: write (cmd_live step 4 mirror, 383-name set) -------------
    # The staged engine files are written for the PUBLISHED set: IONQ is
    # removed from the batch2 inputs/results, exactly the state cmd_live's
    # own §7 drop write-back leaves behind.
    for key in ("v13", "batch2"):
        inp = copy.deepcopy(inputs[key])
        res = copy.deepcopy(results[key])
        inp["tickers"].pop("IONQ", None)
        res["tickers"].pop("IONQ", None)
        nr.write_json(os.path.join(nr.ENGINE_DIR, key, "inputs.json"), inp)
        nr.write_json(os.path.join(nr.ENGINE_DIR, key, "results.json"), res)
    nr.write_json(nr.SITE_RESULTS, merged)
    ts = (datetime.datetime.now(datetime.timezone.utc)
          .strftime("%Y-%m-%dT%H:%M:%SZ"))
    n_stock, n_other = nr.sync_sitemap(sorted(merged["tickers"]), ts)
    print(f"step 4: wrote engine files + results.json (383 tickers); "
          f"sitemap {n_stock} stock + {n_other} other urls")

    report = {"as_of": AS_OF, "price_date": PRICE_DATE,
              "tickers_before": 381, "tickers_after": len(merged["tickers"]),
              "dropped_by_fv_gate": dropped, "ionq_fv_at_close": ionq_fv,
              "blast_radius_carried_381": 0,
              "added": {}}
    for t in ("ARM", "CLOV"):
        r = merged["tickers"][t]
        legs = {k: v["value"] for k, v in
                r["pillars"]["valuation"]["detail"]["legs"].items()}
        report["added"][t] = {
            "price": r["price"], "triangulated_fv": r["triangulated_fv"],
            "overall_score": r["overall_score"], "verdict": r["verdict"],
            "legs": legs}
        print(f"  {t}: ${r['price']:.2f} FV ${r['triangulated_fv']:.2f} "
              f"overall {r['overall_score']} {r['verdict']} legs {legs}")
    nr.write_json(REPORT, report)
    print(f"report: {REPORT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
