#!/usr/bin/env python3
"""Apply the engine-v1.4 base-input updates to scripts/engine/base_inputs.json
(SPEC v1.2). Run once: python3 scripts/apply_engine_v14_base.py

Applies, programmatically and with assertions (no hand edits):
  (1) GME T2 one-off curation — the adjusted fields, curated flag and
      oneoff_adjustments list are copied from the pipeline fragment
      (full-universe-pipeline/refresh/fragments/GME.json, itself built
      from backtest-wide-full/data/oneoff_adjustments.json and verified
      by scoring-engine-v1.4/build_inputs_v14.py) and asserted equal
      to the curation's stored values. One wording alignment:
      "Adjusted NI" -> "Adjusted TTM NI" (the phrase the stock-card
      one-off callout matches; all other adjusted names use it).
  (2) ABBV revenue anchor — stored -0.3410 is wrong (quarterly-frame
      row bug, SPEC v1.2 §6); corrected +0.0175 from the annual-frame
      EDGAR recompute (refresh/revenue_cagr_recompute_v14.json).

Why base_inputs.json carries these (and not just the pipeline):
the nightly refresh never recomputes fundamentals or ONEOFF
adjustments — it copies them from base_inputs.json on every run
(_update_price_fields only scales price-derived fields) — so the
curated values survive each nightly refresh by construction. The
fragment builders set adjusted fields to None and do NOT apply
curations, so a refresh rebuild must never be sourced from a bare
fragment rebuild; this file is the durable site-side record.
"""
import json
import os
import sys

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(SITE, "scripts", "engine", "base_inputs.json")
PIPE = "/home/hatch/workspace/stock-verdicts-better"
FRAG_GME = os.path.join(PIPE, "full-universe-pipeline/refresh/fragments/GME.json")
RECOMP = os.path.join(PIPE, "full-universe-pipeline/refresh/revenue_cagr_recompute_v14.json")


def load(p):
    with open(p) as f:
        return json.load(f)


def main():
    import hashlib
    before = hashlib.md5(open(BASE, "rb").read()).hexdigest()
    base = load(BASE)
    frag = load(FRAG_GME)
    recomp = load(RECOMP)

    # ---- (1) GME T2 -------------------------------------------------------
    g = base["tickers"]["GME"]
    assert g["trailing_eps_adjusted"] is None, "GME T2 already applied?"
    assert g["net_income_ttm_adjusted"] is None
    assert g["trailing_pe_adjusted"] is None
    assert g["ocf_pct_net_income_adjusted"] is None
    assert g.get("oneoff_adjustments") is None
    assert frag["trailing_eps_adjusted"] == 0.95
    assert frag["trailing_pe_adjusted"] == 27.2
    assert frag["net_income_ttm_adjusted"] == 551300000.0
    assert frag["ocf_pct_net_income_adjusted"] == 1.278
    assert len(frag["flags"]) == 1 and "Adjusted TTM NI $551.3M" in frag["flags"][0]
    assert len(frag["oneoff_adjustments"]) == 2
    g["trailing_eps_adjusted"] = frag["trailing_eps_adjusted"]
    g["trailing_pe_adjusted"] = frag["trailing_pe_adjusted"]
    g["net_income_ttm_adjusted"] = frag["net_income_ttm_adjusted"]
    g["ocf_pct_net_income_adjusted"] = frag["ocf_pct_net_income_adjusted"]
    g["flags"] = list(frag["flags"])
    g["oneoff_adjustments"] = frag["oneoff_adjustments"]
    print("GME T2 applied to base_inputs.json "
          "(adj NI $551.3M, EPS $0.95, P/E 27.2, OCF/NI 1.278; "
          "flag carries 'Adjusted TTM NI')")

    # ---- (2) ABBV anchor ---------------------------------------------------
    a = base["tickers"]["ABBV"]
    assert a["revenue_cagr_3y_annual"] == -0.341, \
        f"ABBV stored anchor is not -0.341: {a['revenue_cagr_3y_annual']}"
    assert recomp["rows"]["ABBV"]["recomputed"] == 0.0175
    a["revenue_cagr_3y_annual"] = 0.0175
    print("ABBV anchor: -0.3410 -> +0.0175 in base_inputs.json")

    json.dump(base, open(BASE, "w"), indent=2)
    after = hashlib.md5(open(BASE, "rb").read()).hexdigest()
    print(f"base_inputs.json md5: {before} -> {after}")
    print("wrote scripts/engine/base_inputs.json (GME T2 + ABBV anchor only)")


if __name__ == "__main__":
    main()
