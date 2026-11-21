#!/usr/bin/env python3
"""Apply engine-v1.9 (SPEC v1.7) to scripts/engine/base_inputs.json.
Run once: python3 scripts/apply_engine_v19_base.py

SPEC v1.7 changes NO scoring rule (engine v1.9 is v1.8's code except the
docstring + version string; run_v19.py Control A proved 0 diffs on the
400 carried names). The base change is exactly two records:

  ARM  — was blocked NO_OCF_PCT (20-F filer, no EDGAR TTM series).
         Completed under the R8 method (SPEC v1.7 §2): Yahoo-quarterly
         TTM + FY2026 annual accruals/receivables. 3-leg, FV $28.41 at
         the vintage, publish.
  CLOV — was blocked NO_DEBT_TO_EQUITY only. Completed under the
         documented EDGAR D/E fallback + the SPEC v1.7 §3 zero-debt
         clarification (no borrowings reported: total debt $0, D/E 0.0;
         equity incl. NCI $308,704,000 @2025-12-31). 3-leg, FV $3.27 at
         the vintage, publish.

Publishable set — exactly the v1.9 results' publish:true names (384);
the base set is that set MINUS IONQ (383): IONQ stays out per the
live-price §7 fact (RULEBOOK §20) — at the 2026-11-20 close ($20.72)
its refreshed FV is negative (DCF leg -$54.39; PEGY leg scales with
price; breakeven ~$27.72). It returns only when a refresh prices
FV > 0, by deliberate re-add. The 18 FV <= 0 names are unchanged
(BYND + AAOI, ALK, ALTI, AORT, BUR, CPNG, IREN, KLAR, KRUS, MNKD, MUX,
OUST, RKLB, UUUU, UWMC, VITL, WGS).

Records — carried 381: scoring fields verified equal to the v1.9 inputs
(they are the v1.8 records verbatim); display text kept verbatim.
ARM/CLOV: the v1.9 workspace records with flags translated to public
copy by apply_engine_v17_base.public_flag (RULEBOOK §16 rule 1 — no
leak tokens), debt_fcf / market_cap / rel_vol = None (the refresh
computes market cap and rel vol; debt_fcf stays null like 178 live
names), indexes from scripts/engine/index_lists.json (ARM is a
Nasdaq-100 member -> ['NASDAQ100']; CLOV is in no tracked index ->
None). BA/GME curations asserted intact.
"""
import copy
import hashlib
import json
import os
import sys

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(SITE, "scripts"))
from apply_engine_v17_base import public_flag, LEAK_TOKENS  # noqa: E402

BASE = os.path.join(SITE, "scripts", "engine", "base_inputs.json")
REPORT = os.path.join(SITE, "scripts", "apply_engine_v19_base_report.json")
PIPE = "/home/hatch/workspace/stock-verdicts-better"
WS_INPUTS = os.path.join(PIPE, "scoring-engine-v1.9", "inputs.json")
WS_RESULTS = os.path.join(PIPE, "scoring-engine-v1.9", "results.json")

UNPUBLISHED = {
    "BYND", "AAOI", "ALK", "ALTI", "AORT", "BUR", "CPNG", "IREN",
    "KLAR", "KRUS", "MNKD", "MUX", "OUST", "RKLB", "UUUU", "UWMC",
    "VITL", "WGS",
}
DISPLAY_FIELDS = ("flags", "name", "oneoff_adjustments", "debt_fcf",
                  "indexes", "market_cap", "rel_vol")
NEW_INDEXES = {"ARM": ["NASDAQ100"], "CLOV": None}


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
    assert len(ws) == 402 and len(res) == 402
    assert set(res) == set(ws)

    publishable = {site_key(t) for t, r in res.items() if r["publish"]}
    assert len(publishable) == 384, len(publishable)
    assert {site_key(t) for t, r in res.items()
            if not r["publish"]} == UNPUBLISHED
    assert "ARM" in publishable and "CLOV" in publishable
    assert "IONQ" in publishable  # engine-publishable; site-excluded below

    old_tickers = base["tickers"]
    assert len(old_tickers) == 381, len(old_tickers)
    assert set(old_tickers) == publishable - {"IONQ", "ARM", "CLOV"}, (
        f"base set mismatch: extra {sorted(set(old_tickers) - publishable)}, "
        f"missing {sorted(publishable - {'IONQ', 'ARM', 'CLOV'} - set(old_tickers))}")
    print("publishable 384 = current base 381 + ARM + CLOV + IONQ "
          "(IONQ site-excluded, live-price FV <= 0)")

    new_tickers = {}
    # ---- carried 381: verbatim, scoring fields verified ------------------
    # One documented exception: SNDK's base record was rescaled in place
    # by the 2026-11-20 refresh for its 8-for-1 split (the refresh's own
    # split write-back, RULEBOOK §30) — its scoring fields equal the
    # v1.9 input record run through nightly_refresh.rescale_for_split
    # with factor 8.0, and its price_date advanced to the split bar date.
    import nightly_refresh as nr
    for st in sorted(old_tickers):
        wt = "BRK.B" if st == "BRK-B" else st
        rec = copy.deepcopy(ws[wt])
        rec.pop("stock_verdicts", None)
        rec.pop("revenue_ttm_adjusted", None)
        if st == "SNDK":
            rec = nr.rescale_for_split(rec, 8.0)
        site_rec = old_tickers[st]
        for k, v in rec.items():
            if k in DISPLAY_FIELDS:
                continue
            if st == "SNDK" and k == "price_date":
                assert site_rec.get(k) == "2026-11-20", site_rec.get(k)
                continue
            assert site_rec.get(k) == v, f"{st}: base field {k} differs " \
                f"from v1.9 inputs ({site_rec.get(k)!r} vs {v!r})"
        new_tickers[st] = copy.deepcopy(site_rec)
    print("all 381 carried records' scoring fields equal the v1.9 inputs "
          "(SNDK via the refresh's own 8-for-1 split rescale); "
          "site records kept verbatim")

    # ---- ARM + CLOV: new site records ------------------------------------
    for st in ("ARM", "CLOV"):
        rec = copy.deepcopy(ws[st])
        rec.pop("stock_verdicts", None)
        rec.pop("revenue_ttm_adjusted", None)
        translated = []
        for f in rec.get("flags") or []:
            tf, _template = public_flag(f)
            for tok in LEAK_TOKENS:
                assert tok not in tf, f"{st}: leak token {tok!r} in flag {tf!r}"
            translated.append(tf)
        rec["flags"] = translated
        assert rec.get("name"), f"{st}: no name"
        assert rec.get("price") is not None, f"{st}: no price"
        rec["debt_fcf"] = None
        rec["indexes"] = copy.deepcopy(NEW_INDEXES[st])
        rec["market_cap"] = None
        rec["rel_vol"] = None
        new_tickers[st] = rec
        print(f"{st}: new base record (name {rec['name']!r}, "
              f"indexes {rec['indexes']}, {len(translated)} flags translated)")

    # ---- curations intact --------------------------------------------------
    ba = new_tickers["BA"]
    assert ba["trailing_eps_adjusted"] == 0.02
    assert ba["net_income_ttm_adjusted"] == 15100000
    assert ba["trailing_pe_adjusted"] == 8575.0
    assert ba["ocf_pct_net_income_adjusted"] == 265.695
    assert len(ba["oneoff_adjustments"]) == 1
    gme = new_tickers["GME"]
    assert gme["trailing_eps_adjusted"] == 1.24
    assert gme["trailing_pe_adjusted"] == 20.8
    assert gme["net_income_ttm_adjusted"] == 719600000
    assert gme["ocf_pct_net_income_adjusted"] == 0.979
    assert len(gme["oneoff_adjustments"]) == 4
    print("BA/GME curations intact")

    # ---- audit trail + write ------------------------------------------------
    assert base["as_of"] == "2026-11-16" and base["price_date"] == "2026-11-13"
    base["tickers"] = new_tickers
    base["merged_from"] = base["merged_from"] + [
        "Engine v1.9 base apply 2026-11-21 (SPEC v1.7): base grows "
        "381 -> 383 — ARM and CLOV added on completed data (ARM: R8 "
        "Yahoo-quarterly TTM for a 20-F filer, FV $28.41 vintage, Avoid; "
        "CLOV: EDGAR D/E fallback + zero-debt clarification — no "
        "borrowings reported, total debt $0, D/E 0.0, FV $3.27 vintage, "
        "Avoid). No rule changed; all 381 carried records verified "
        "field-for-field against the v1.9 inputs. IONQ stays out: at "
        "the 2026-11-20 close ($20.72) its refreshed FV is negative "
        "(SPEC v1.5 §7 / RULEBOOK §20). The 18 FV <= 0 names unchanged.",
    ]
    base["note"] = base["note"] + (
        " Engine v1.9 applied 2026-11-21 (SPEC v1.7): 383 tickers "
        "(ARM + CLOV added on completed data; IONQ still out — live "
        "FV <= 0 at the Nov 20 close).")
    assert len(base["tickers"]) == 383

    bak = BASE + ".pre-v19-bak"
    if not os.path.exists(bak):
        with open(bak, "w") as f:
            json.dump(load(BASE), f, indent=2)
        print(f"backed up the v1.8 base to {bak}")
    json.dump(base, open(BASE, "w"), indent=2)
    after = hashlib.md5(open(BASE, "rb").read()).hexdigest()
    bak_base = load(bak)
    assert bak_base["tickers"].keys() < base["tickers"].keys()
    for t in bak_base["tickers"]:
        assert bak_base["tickers"][t] == base["tickers"][t], f"{t} changed!"
    report = {
        "as_of": base["as_of"], "price_date": base["price_date"],
        "tickers": 383, "added": ["ARM", "CLOV"],
        "ionq_excluded": "live-price FV <= 0 at the 2026-11-20 close ($20.72); engine-publishable (seed FV +$1.13)",
        "unpublished_excluded": sorted(UNPUBLISHED),
        "base_md5_before": before, "base_md5_after": after,
    }
    json.dump(report, open(REPORT, "w"), indent=2)
    print(f"base_inputs.json md5: {before} -> {after} (381 carried verbatim + ARM + CLOV)")
    print(f"report: {REPORT}")


if __name__ == "__main__":
    main()
