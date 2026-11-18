#!/usr/bin/env python3
"""Apply the engine-v1.6 base-input updates to scripts/engine/base_inputs.json
(SPEC v1.4). Run once: python3 scripts/apply_engine_v16_base.py

Applies, programmatically and with assertions (no hand edits):
  BA T2 curation — the adjusted fields, curated flag and
  oneoff_adjustments list are copied from the pipeline fragment
  (full-universe-pipeline/refresh/fragments/BA.json, itself built from
  backtest-wide-full/data/oneoff_adjustments.json and verified by
  scoring-engine-v1.6/build_inputs_v16.py) and asserted equal to the
  curation's stored values. Pre-state is the frozen v1.5 BA record (no
  adjustment: adj fields None, oneoff_adjustments absent, T1-only flag);
  post-state is the v1.6 curation (adj NI $15.1M, EPS $0.02, P/E 8,575,
  OCF/NI 265.695). BA's fcf_per_share_note wording is fixed at the same
  time (SPEC v1.4 §4a).
  GME flag text fix (copy only): the cleaned flag is copied from the
  pipeline fragment; values are asserted unchanged (adj NI $719.6M, EPS
  $1.24, P/E 20.8, OCF/NI 0.979, 4 oneoff items).

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
FRAG_BA = os.path.join(PIPE, "full-universe-pipeline/refresh/fragments/BA.json")
FRAG_GME = os.path.join(PIPE, "full-universe-pipeline/refresh/fragments/GME.json")

NEW_SHARES_NOTE = ("USD per share; shares = EDGAR TTM net income ÷ EDGAR "
                   "TTM diluted EPS (implied shares).")
OLD_SHARES_NOTE = "USD per share; shares = NI_TTM/trailing EPS (total shares)."


def load(p):
    with open(p) as f:
        return json.load(f)


def main():
    before = hashlib.md5(open(BASE, "rb").read()).hexdigest()
    base = load(BASE)

    # ---- BA ---------------------------------------------------------------
    frag_ba = load(FRAG_BA)
    b = base["tickers"]["BA"]
    # Pre-state: either the frozen v1.5 record (no adjustment), or the
    # v1.6 state already applied (re-runs update the flag only and
    # re-verify the values).
    v15_state = (b["trailing_eps_adjusted"] is None
                 and b["net_income_ttm_adjusted"] is None
                 and b["trailing_pe_adjusted"] is None
                 and b["ocf_pct_net_income_adjusted"] is None
                 and b.get("oneoff_adjustments") is None
                 and "no adjustment applied" in b["flags"][0])
    v16_state = (b["trailing_eps_adjusted"] == 0.02
                 and b["net_income_ttm_adjusted"] == 15100000
                 and b["trailing_pe_adjusted"] == 8575.0
                 and b["ocf_pct_net_income_adjusted"] == 265.695
                 and len(b["oneoff_adjustments"]) == 1)
    assert v15_state or v16_state, "BA base is in an unexpected state"
    assert frag_ba["trailing_eps_adjusted"] == 0.02
    assert frag_ba["trailing_pe_adjusted"] == 8575.0
    assert frag_ba["net_income_ttm_adjusted"] == 15100000
    assert frag_ba["ocf_pct_net_income_adjusted"] == 265.695
    assert len(frag_ba["flags"]) == 1 and frag_ba["flags"][0].startswith(
        "Recent earnings include a large one-time gain from selling a business.")
    assert "Figures are rounded." in frag_ba["flags"][0]
    assert "ONEOFF-v1" not in frag_ba["flags"][0] and "SPEC" not in frag_ba["flags"][0]
    assert len(frag_ba["oneoff_adjustments"]) == 1
    assert frag_ba["oneoff_adjustments"][0]["quarter"] == "2025-12-31"
    assert frag_ba["oneoff_adjustments"][0]["amount_after_tax_usd_m"] == 7640.9
    assert frag_ba["oneoff_adjustments"][0]["amount_pre_tax_usd_m"] == 9672.0
    b["trailing_eps_adjusted"] = frag_ba["trailing_eps_adjusted"]
    b["trailing_pe_adjusted"] = frag_ba["trailing_pe_adjusted"]
    b["net_income_ttm_adjusted"] = frag_ba["net_income_ttm_adjusted"]
    b["ocf_pct_net_income_adjusted"] = frag_ba["ocf_pct_net_income_adjusted"]
    b["flags"] = list(frag_ba["flags"])
    b["oneoff_adjustments"] = frag_ba["oneoff_adjustments"]
    assert b["fcf_per_share_note"] in (OLD_SHARES_NOTE, NEW_SHARES_NOTE)
    b["fcf_per_share_note"] = NEW_SHARES_NOTE
    print("BA T2 applied to base_inputs.json "
          "(adj NI $15.1M, EPS $0.02, P/E 8575, OCF/NI 265.695; "
          "flag carries the plain-language note)")

    # ---- GME flag text fix (copy only) -------------------------------------
    frag_gme = load(FRAG_GME)
    g = base["tickers"]["GME"]
    assert g["trailing_eps_adjusted"] == 1.24
    assert g["trailing_pe_adjusted"] == 20.8
    assert g["net_income_ttm_adjusted"] == 719600000
    assert g["ocf_pct_net_income_adjusted"] == 0.979
    assert len(g["oneoff_adjustments"]) == 4
    assert frag_gme["trailing_eps_adjusted"] == 1.24
    assert frag_gme["trailing_pe_adjusted"] == 20.8
    assert frag_gme["net_income_ttm_adjusted"] == 719600000
    assert frag_gme["ocf_pct_net_income_adjusted"] == 0.979
    assert len(frag_gme["flags"]) == 1
    assert "ONEOFF-v1" not in frag_gme["flags"][0]
    assert "SPEC v1.3" not in frag_gme["flags"][0]
    assert frag_gme["flags"][0].endswith("Figures are rounded.")
    assert "Adjusted TTM NI $719.6M" in frag_gme["flags"][0]
    g["flags"] = list(frag_gme["flags"])
    print("GME flag text fix applied to base_inputs.json "
          "(values unchanged; recipe language removed)")

    json.dump(base, open(BASE, "w"), indent=2)
    after = hashlib.md5(open(BASE, "rb").read()).hexdigest()
    print(f"base_inputs.json md5: {before} -> {after}")
    print("wrote scripts/engine/base_inputs.json (BA T2 + GME flag text)")


if __name__ == "__main__":
    main()
