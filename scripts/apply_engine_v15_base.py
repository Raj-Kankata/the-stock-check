#!/usr/bin/env python3
"""Apply the engine-v1.5 base-input updates to scripts/engine/base_inputs.json
(SPEC v1.3). Run once: python3 scripts/apply_engine_v15_base.py

Applies, programmatically and with assertions (no hand edits):
  GME symmetric one-off curation — the adjusted fields, curated flag and
  oneoff_adjustments list are copied from the pipeline fragment
  (full-universe-pipeline/refresh/fragments/GME.json, itself built from
  backtest-wide-full/data/oneoff_adjustments.json and verified by
  scoring-engine-v1.5/build_inputs_v15.py) and asserted equal to the
  curation's stored values. Pre-state is the frozen v1.4 gains-only T2
  (adj NI $551.3M, EPS $0.95, P/E 27.2, OCF/NI 1.278); post-state is the
  symmetric curation (adj NI $719.6M, EPS $1.24, P/E 20.8, OCF/NI 0.979).

Why base_inputs.json carries these (and not just the pipeline): the
nightly refresh never recomputes fundamentals or ONEOFF adjustments — it
copies them from base_inputs.json on every run (_update_price_fields
only scales price-derived fields) — so the curated values survive each
nightly refresh by construction. The fragment builders set adjusted
fields to None and do NOT apply curations, so a refresh rebuild must
never be sourced from a bare fragment rebuild; this file is the durable
site-side record.
"""
import hashlib
import json
import os

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(SITE, "scripts", "engine", "base_inputs.json")
PIPE = "/home/hatch/workspace/stock-verdicts-better"
FRAG_GME = os.path.join(PIPE, "full-universe-pipeline/refresh/fragments/GME.json")


def load(p):
    with open(p) as f:
        return json.load(f)


def main():
    before = hashlib.md5(open(BASE, "rb").read()).hexdigest()
    base = load(BASE)
    frag = load(FRAG_GME)

    g = base["tickers"]["GME"]
    # Pre-state: either the frozen v1.4 gains-only T2, or the symmetric
    # state already applied (re-runs, e.g. a flag-text fix, update the flag
    # only and re-verify the values).
    v14_state = (g["trailing_eps_adjusted"] == 0.95
                 and g["net_income_ttm_adjusted"] == 551300000.0
                 and g["trailing_pe_adjusted"] == 27.2
                 and g["ocf_pct_net_income_adjusted"] == 1.278
                 and len(g["oneoff_adjustments"]) == 2
                 and "Adjusted TTM NI $551.3M" in g["flags"][0])
    v15_state = (g["trailing_eps_adjusted"] == 1.24
                 and g["net_income_ttm_adjusted"] == 719600000
                 and g["trailing_pe_adjusted"] == 20.8
                 and g["ocf_pct_net_income_adjusted"] == 0.979
                 and len(g["oneoff_adjustments"]) == 4)
    assert v14_state or v15_state, "GME base is in an unexpected state"
    assert frag["trailing_eps_adjusted"] == 1.24
    assert frag["trailing_pe_adjusted"] == 20.8
    assert frag["net_income_ttm_adjusted"] == 719600000.0
    assert frag["ocf_pct_net_income_adjusted"] == 0.979
    assert len(frag["flags"]) == 1 and "Adjusted TTM NI $719.6M" in frag["flags"][0]
    assert len(frag["oneoff_adjustments"]) == 4
    assert frag["oneoff_adjustments"][0]["quarter"] == "2025-11-01"
    assert frag["oneoff_adjustments"][1]["quarter"] == "2026-01-31"
    g["trailing_eps_adjusted"] = frag["trailing_eps_adjusted"]
    g["trailing_pe_adjusted"] = frag["trailing_pe_adjusted"]
    g["net_income_ttm_adjusted"] = frag["net_income_ttm_adjusted"]
    g["ocf_pct_net_income_adjusted"] = frag["ocf_pct_net_income_adjusted"]
    g["flags"] = list(frag["flags"])
    g["oneoff_adjustments"] = frag["oneoff_adjustments"]
    print("GME symmetric applied to base_inputs.json "
          "(adj NI $719.6M, EPS $1.24, P/E 20.8, OCF/NI 0.979; "
          "flag carries 'Adjusted TTM NI')")

    json.dump(base, open(BASE, "w"), indent=2)
    after = hashlib.md5(open(BASE, "rb").read()).hexdigest()
    print(f"base_inputs.json md5: {before} -> {after}")
    print("wrote scripts/engine/base_inputs.json (GME symmetric only)")


if __name__ == "__main__":
    main()
