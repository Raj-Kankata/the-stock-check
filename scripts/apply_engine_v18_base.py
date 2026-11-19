#!/usr/bin/env python3
"""Verify scripts/engine/base_inputs.json against engine-v1.8 (SPEC v1.6).
Run once: python3 scripts/apply_engine_v18_base.py

Unlike apply_engine_v17_base.py (an expansion: 227 -> 382 tickers),
v1.8 changes NOTHING in the base: the v1.8 publishable set is exactly
the v1.7 set (382 tickers; the same 18 FV <= 0 names excluded — NBIS
and CRWV are both 1-leg ONE_LEG_ONLY, SPEC v1.6 §6, and never enter
inputs.json), and the v1.8 inputs are the v1.7 inputs carried verbatim.
So this script REBUILDS the base from the workspace v1.8 inputs and
asserts the result is identical to the current base in every ticker —
the only permitted change is the merged_from / note audit-trail entry
for v1.8. If any ticker's scoring fields differ, the script fails and
nothing is written.

Checks (programmatically, with assertions, no hand edits):
  Publishable set — exactly the v1.8 results' publish:true names (382);
  the current base's ticker set is that set MINUS IONQ (381): IONQ was
  removed from the base on 2026-11-18 by fix_indexes_ionq_nov18.py —
  the first v1.7 live refresh priced it at FV -$1.24 (Nov 18 close),
  so the §7 gate drops it, and it stays out until a refresh shows
  FV > 0. At the Nov 13 workspace close IONQ is FV +$1.13 publishable;
  the exclusion is a live-price fact, not a v1.8 change.
  The 18 FV <= 0 names are the same 18 as v1.7 (BYND + AAOI, ALK,
  ALTI, AORT, BUR, CPNG, IREN, KLAR, KRUS, MNKD, MUX, OUST, RKLB,
  UUUU, UWMC, VITL, WGS).
  Records — for every base ticker, the v1.8 workspace record's scoring
  fields equal the base record's scoring fields (the site display text
  — flags, name, oneoff_adjustments, debt_fcf, indexes, market_cap,
  rel_vol — is kept verbatim, as in v1.7).
  Curations intact — BA (adj EPS $0.02, adj NI $15.1M, P/E 8,575) and
  GME (adj EPS $1.24, P/E 20.8, adj NI $719.6M) as in v1.7.
  No leak tokens in any flag (RULEBOOK §16 rule 1).
"""
import copy
import hashlib
import json
import os

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(SITE, "scripts", "engine", "base_inputs.json")
REPORT = os.path.join(SITE, "scripts", "apply_engine_v18_base_report.json")
PIPE = "/home/hatch/workspace/stock-verdicts-better"
WS_INPUTS = os.path.join(PIPE, "scoring-engine-v1.8", "inputs.json")
WS_RESULTS = os.path.join(PIPE, "scoring-engine-v1.8", "results.json")
WS_V17_INPUTS = os.path.join(PIPE, "scoring-engine-v1.7", "inputs.json")
WS_V17_RESULTS = os.path.join(PIPE, "scoring-engine-v1.7", "results.json")

# The 18 FV <= 0 names, excluded from the base (SPEC v1.5 §7 / engine R6,
# unchanged in v1.6).
UNPUBLISHED = {
    "BYND", "AAOI", "ALK", "ALTI", "AORT", "BUR", "CPNG", "IREN",
    "KLAR", "KRUS", "MNKD", "MUX", "OUST", "RKLB", "UUUU", "UWMC",
    "VITL", "WGS",
}

LEAK_TOKENS = ("SPEC", "ONEOFF", "Stock Verdicts", "ENGINE DECISION",
               "T1 fired", "T1 did not fire", "T1: NO quarter")

DISPLAY_FIELDS = ("flags", "name", "oneoff_adjustments", "debt_fcf",
                  "indexes", "market_cap", "rel_vol")


def load(p):
    with open(p) as f:
        return json.load(f)


def site_key(t):
    return "BRK-B" if t == "BRK.B" else t


def main():
    before = hashlib.md5(open(BASE, "rb").read()).hexdigest()
    base = load(BASE)
    ws = load(WS_INPUTS)["tickers"]
    res = load(WS_RESULTS)["tickers"]
    v17_inputs = load(WS_V17_INPUTS)["tickers"]
    v17_results = load(WS_V17_RESULTS)["tickers"]
    assert len(ws) == 400 and len(res) == 400
    assert set(res) == set(ws)
    assert ws == v17_inputs, "v1.8 inputs != frozen v1.7 inputs"
    assert set(res) == set(v17_results)

    publishable = {site_key(t) for t, r in res.items() if r["publish"]}
    assert len(publishable) == 382, len(publishable)
    assert set(UNPUBLISHED) == {site_key(t) for t, r in res.items()
                                 if not r["publish"]}
    assert "BYND" not in publishable and "SO" in publishable
    assert "NBIS" not in publishable and "CRWV" not in publishable
    assert "NBIS" not in ws and "CRWV" not in ws

    old_tickers = base["tickers"]
    assert len(old_tickers) == 381, len(old_tickers)
    assert set(old_tickers) == publishable - {"IONQ"}, (
        f"base set != v1.8 publishable set minus IONQ: "
        f"extra {sorted(set(old_tickers) - publishable)}, "
        f"missing {sorted(publishable - {'IONQ'} - set(old_tickers))}")
    print(f"publishable set (382) minus IONQ == current base set (381); "
          f"unpublished 18 == v1.7's 18; NBIS/CRWV not in inputs")

    # ---- every base ticker's scoring fields equal the v1.8 inputs --------
    for st in sorted(old_tickers):
        wt = "BRK.B" if st == "BRK-B" else st
        rec = copy.deepcopy(ws[wt])
        rec.pop("stock_verdicts", None)
        rec.pop("revenue_ttm_adjusted", None)
        site_rec = old_tickers[st]
        for k, v in rec.items():
            if k in DISPLAY_FIELDS:
                continue
            assert site_rec.get(k) == v, f"{st}: base field {k} differs " \
                f"from v1.8 inputs ({site_rec.get(k)!r} vs {v!r})"
        for f in site_rec.get("flags") or []:
            for tok in LEAK_TOKENS:
                assert tok not in f, f"{st}: leak token {tok!r} in flag"
    print("all 381 base records' scoring fields equal the v1.8 inputs")

    # ---- curations intact -------------------------------------------------
    ba = old_tickers["BA"]
    assert ba["trailing_eps_adjusted"] == 0.02
    assert ba["net_income_ttm_adjusted"] == 15100000
    assert ba["trailing_pe_adjusted"] == 8575.0
    assert ba["ocf_pct_net_income_adjusted"] == 265.695
    assert len(ba["oneoff_adjustments"]) == 1
    gme = old_tickers["GME"]
    assert gme["trailing_eps_adjusted"] == 1.24
    assert gme["trailing_pe_adjusted"] == 20.8
    assert gme["net_income_ttm_adjusted"] == 719600000
    assert gme["ocf_pct_net_income_adjusted"] == 0.979
    assert len(gme["oneoff_adjustments"]) == 4
    so = old_tickers["SO"]
    assert so["price"] == 93.59
    print("BA/GME curations intact; SO present")

    # ---- audit trail only ---------------------------------------------------
    assert base["as_of"] == "2026-11-16" and base["price_date"] == "2026-11-13"
    base["merged_from"] = base["merged_from"] + [
        "Engine v1.8 verification 2026-11-19 (SPEC v1.6): base UNCHANGED "
        "— the v1.8 publishable set is exactly the v1.7 set (382 tickers; "
        "the same 18 FV <= 0 names excluded; IONQ stays out per the "
        "2026-11-18 fix, FV -$1.24 at the Nov 18 close). NBIS and CRWV "
        "do not enter the base: both are 1-leg ONE_LEG_ONLY (NBIS DCF "
        "-$1,172.90 only, PEGY skipped by the §4 guard; CRWV DCF -$820.12 "
        "only), no FV. All 381 records' scoring fields verified equal to "
        "the v1.8 inputs.",
    ]
    base["note"] = base["note"] + (
        " Engine v1.8 verified 2026-11-19 (SPEC v1.6): base unchanged "
        "(381 tickers); NBIS and CRWV stay out — both 1-leg, no fair value.")
    assert len(base["tickers"]) == 381

    bak = BASE + ".pre-v18-bak"
    if not os.path.exists(bak):
        with open(bak, "w") as f:
            json.dump(load(BASE), f, indent=2)
        print(f"backed up the v1.7 base to {bak}")
    json.dump(base, open(BASE, "w"), indent=2)
    after = hashlib.md5(open(BASE, "rb").read()).hexdigest()
    # The only permitted change vs the backup: merged_from + note.
    bak_base = load(bak)
    assert bak_base["tickers"] == base["tickers"], "tickers changed!"
    assert bak_base["as_of"] == base["as_of"]
    assert bak_base["price_date"] == base["price_date"]
    report = {
        "as_of": base["as_of"], "price_date": base["price_date"],
        "tickers": 381, "tickers_changed": 0,
        "ionq_excluded": "2026-11-18 fix (live FV -$1.24); publishable at the Nov 13 workspace close (FV +$1.13)",
        "unpublished_excluded": sorted(UNPUBLISHED),
        "nbis_crwv": "not in inputs (1-leg ONE_LEG_ONLY, no FV)",
        "base_md5_before": before, "base_md5_after": after,
    }
    json.dump(report, open(REPORT, "w"), indent=2)
    print(f"base_inputs.json md5: {before} -> {after} "
          f"(merged_from + note only; 0 tickers changed)")
    print(f"report: {REPORT}")


if __name__ == "__main__":
    main()
