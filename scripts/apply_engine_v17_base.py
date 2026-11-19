#!/usr/bin/env python3
"""Apply the engine-v1.7 base-input expansion to scripts/engine/base_inputs.json
(SPEC v1.5). Run once: python3 scripts/apply_engine_v17_base.py

Builds the new 382-ticker base from the workspace v1.7 inputs
(scoring-engine-v1.7/inputs.json, 400 scored, 382 publishable), replacing
the 227-ticker v1.6 base. Applies, programmatically and with assertions
(no hand edits):

  Publishable set — exactly the v1.7 results' publish:true names (382).
  The 18 FV <= 0 names are excluded: BYND + AAOI, ALK, ALTI, AORT, BUR,
  CPNG, IREN, KLAR, KRUS, MNKD, MUX, OUST, RKLB, UUUU, UWMC, VITL, WGS.
  SO is included (3-leg, FV $56.28). The 15 two-leg names that were
  unpublished under Option A (APP, ASX, CCJ, JPM, NOK, NVO, ONON, SAP,
  SLF, SPOT, TAC, TD, TSM, VEEV, WIT) enter the base now.
  Records are the v1.7 workspace records (all scoring fields), keyed by
  the site ticker (workspace BRK.B -> site BRK-B). `stock_verdicts` is
  DROPPED: the site never carried it and no page reads
  vs_stock_verdicts (the engine tolerates its absence).
  Carried names (226) — the site base's display text is kept verbatim:
  `flags` (plain-language, per RULEBOOK §16), `name` where the workspace
  record has none (EFOR, OLED), and `oneoff_adjustments` where the site
  record has one (BA/GME curations, AMZN note wording). The 4 site
  extras (debt_fcf, indexes, market_cap, rel_vol) are carried over.
  Their scoring fields must equal the v1.7 inputs exactly otherwise
  (asserted key-by-key).
  New names (156) — flags are translated to public copy by
  public_flags() (RULEBOOK §16 rule 1: no internal spec or rule names;
  the site base's 299 flags contain zero "SPEC" / "ONEOFF" / "Stock
  Verdicts" references). Four deterministic templates + the 5 curated
  NVO/JPM rewrites; everything else is copied verbatim. The T1 template
  is verified against all 169 carried examples before use. ELPC's name
  ("Companhia Paranaense de Energia", Yahoo shortName — the workspace
  record has name None) is filled in. New names get debt_fcf / indexes /
  market_cap / rel_vol = None; shares_implied_total and trailing_eps
  come from the workspace records (present for every publishable new
  name that has a trailing P/E).

Why base_inputs.json carries these: the nightly refresh never recomputes
fundamentals or ONEOFF adjustments — it copies them from base_inputs.json
on every run — so the v1.7 inputs survive each nightly refresh by
construction. A refresh rebuild must never be sourced from a bare
fragment rebuild (see apply_engine_v16_base.py).
"""
import copy
import hashlib
import json
import os
import re

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(SITE, "scripts", "engine", "base_inputs.json")
REPORT = os.path.join(SITE, "scripts", "apply_engine_v17_base_report.json")
PIPE = "/home/hatch/workspace/stock-verdicts-better"
WS_INPUTS = os.path.join(PIPE, "scoring-engine-v1.7", "inputs.json")
WS_RESULTS = os.path.join(PIPE, "scoring-engine-v1.7", "results.json")
WS_V16 = os.path.join(PIPE, "scoring-engine-v1.6", "inputs.json")

# The 18 FV <= 0 names, excluded from the base (SPEC v1.5 §7 / engine R6).
UNPUBLISHED = {
    "BYND", "AAOI", "ALK", "ALTI", "AORT", "BUR", "CPNG", "IREN",
    "KLAR", "KRUS", "MNKD", "MUX", "OUST", "RKLB", "UUUU", "UWMC",
    "VITL", "WGS",
}

# Workspace name -> site name for the one name the workspace records lack
# (Yahoo longName None; shortName verified 2026-11-19).
NAME_OVERRIDES = {"ELPC": "Companhia Paranaense de Energia"}

# Leak tokens that must not appear in any translated (new-name) flag.
LEAK_TOKENS = ("SPEC", "ONEOFF", "Stock Verdicts", "ENGINE DECISION",
               "T1 fired", "T1 did not fire", "T1: NO quarter")

T1_RE = re.compile(
    r"^ONEOFF-v1: T1 fired on ([1-4]) of 4 TTM quarters \(flag-only; no "
    r"curated T2 attribution exists for this ticker — no adjustment "
    r"applied\)\.$")
GROWTH_RE = re.compile(
    r"^Growth: Yahoo publishes no PEG/trailing P/E — EDGAR 3y revenue "
    r"CAGR ([\d.]+)% used as the growth input \(SPEC v1\.5 §3 fallback; "
    r"leg caps still apply\)\.$")
BETA_RE = re.compile(
    r"^Beta: Yahoo publishes none — computed ([\d.]+) by 1y daily-return "
    r"OLS regression vs SPY \((\d+) bars, SPEC v1\.5 §5\)\.$")
FCFSHARE_WS = ("FCF/share: Yahoo quarterly 'Free Cash Flow' direct row ÷ "
               "shares (EDGAR capex concept ends before the TTM window; "
               "the row is a credible FCF for this non-financial company "
               "— SPEC v1.5 §9).")
FCFSHARE_SITE = ("FCF/share: Yahoo's quarterly 'Free Cash Flow' row ÷ "
                 "shares (the filing's capex figures end before the TTM "
                 "window; the row is a credible FCF for this non-financial "
                 "company).")


def _sub_once(flag, old, new, label):
    """One surgical substitution, asserted to apply exactly once."""
    assert flag.count(old) == 1, f"{label}: expected exactly one {old!r}"
    return flag.replace(old, new)


def public_flag(flag):
    """Translate one workspace flag to public copy. Returns
    (translated_flag, template_name_or_None)."""
    m = T1_RE.match(flag)
    if m:
        return (f"One-off check: {m.group(1)} of 4 TTM quarters showed "
                f"unusually large earnings moves (flag only — no "
                f"adjustment applied)."), "t1_template"
    m = GROWTH_RE.match(flag)
    if m:
        return (f"Growth: Yahoo publishes no PEG or trailing P/E — the "
                f"3-year revenue growth rate ({m.group(1)}%) from the "
                f"company's filings is used as the growth input instead."
                ), "growth_fallback"
    m = BETA_RE.match(flag)
    if m:
        return (f"Beta: Yahoo publishes none — computed {m.group(1)} from "
                f"1 year of daily returns against the S&P 500 "
                f"({m.group(2)} bars)."), "beta_computed"
    if flag == FCFSHARE_WS:
        return FCFSHARE_SITE, "fcf_share"
    # Curated NVO/JPM rewrites (frozen-13 records entering the site base
    # for the first time). Every figure is kept; only the recipe language
    # goes. Each rewrite is a surgical substitution on the exact string.
    if flag.startswith("ONEOFF-v1: Q1 2026 net profit DKK 48,557M"):
        f = _sub_once(flag, "ONEOFF-v1: ", "One-off check: ", "NVO oneoff")
        f = _sub_once(
            f, " used for Quality/PEGT (see RECALIBRATION.md §2.2).",
            " used for Quality and the PEGY leg.", "NVO oneoff")
        return f, "nvo_oneoff"
    if flag.startswith("ONEOFF-v1 T1: NO quarter fires."):
        f = _sub_once(flag, "ONEOFF-v1 T1: NO quarter fires.",
                      "One-off check: no quarter flagged.", "JPM t1")
        f = _sub_once(
            f, "Same conclusion on StockAnalysis net-income-to-common "
               "series. NO ADJUSTMENT made.",
            "Same conclusion on the StockAnalysis net-income-to-common "
            "series. No adjustment made.", "JPM t1")
        return f, "jpm_t1"
    if flag.startswith(
            "Q2 2026 disclosed significant items NOT adjusted "
            "(T1 did not fire):"):
        f = _sub_once(
            flag, "Q2 2026 disclosed significant items NOT adjusted "
                  "(T1 did not fire):",
            "Q2 2026 disclosed significant items not adjusted:", "JPM q2")
        f = _sub_once(
            f, " Rule edge case: a disclosed $4.2B one-off sits inside "
               "TTM NI/EPS/P/E because T1's 50% / 10%-of-TTM gates were "
               "both narrowly missed. Flagged for engine-owner review; "
               "no adjustment per ONEOFF-v1 as written.",
            " A disclosed $4.2B one-off sits inside TTM NI/EPS/P/E — the "
            "one-off check's gates were both narrowly missed, so no "
            "adjustment was made.", "JPM q2")
        return f, "jpm_q2_items"
    if flag.startswith("FCF TTM -$84.16B is Yahoo's 'Free Cash Flow'"):
        f = _sub_once(
            flag, " FCF/share -$30.41 and any DCF leg built on it are not "
               "meaningful for a bank; JPM is possibly unscorable on the "
               "DCF leg as specified — engine decision required. OCF "
               "-127.6% of NI (Stock Verdicts: -128%).",
            " FCF/share -$30.41 and any DCF leg built on it are not "
            "meaningful for a bank — the DCF leg is skipped. OCF "
            "-127.6% of NI.", "JPM fcf")
        return f, "jpm_fcf"
    if flag.startswith("EMA200 computed 330.01 vs Stock Verdicts"):
        return ("Technicals: EMA200 330.01 (1y-window method, sliced to "
                "2026-11-13); RSI 56.1, EMA20 340.31, EMA50 340.58."
                ), "jpm_technicals"
    if flag.startswith("ENGINE DECISION (batch-2 assembly, 2026-11-16):"):
        f = _sub_once(
            flag, "ENGINE DECISION (batch-2 assembly, 2026-11-16): DCF "
                  "leg SKIPPED — bank FCF undefined under the v1.3 "
                  "Yahoo-row definition",
            "DCF leg skipped — bank FCF is not meaningful", "JPM dcf")
        f = _sub_once(
            f, " The recorded Yahoo-row FCF/share -$30.41 is NOT used. "
               "Triangulated FV is the mean of the PEGY + Forward legs "
               "(the engine's existing NVO skip path).",
            " The recorded Yahoo-row FCF/share -$30.41 is not used. Fair "
            "value is the mean of the PEGY + Forward legs.", "JPM dcf")
        return f, "jpm_dcf_skip"
    return flag, None


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
    v16 = load(WS_V16)["tickers"]
    assert len(ws) == 400 and len(res) == 400 and len(v16) == 242
    assert set(res) == set(ws)

    publishable = {site_key(t) for t, r in res.items() if r["publish"]}
    assert len(publishable) == 382, len(publishable)
    assert set(UNPUBLISHED) == {site_key(t) for t, r in res.items()
                                 if not r["publish"]}
    assert "BYND" not in publishable and "SO" in publishable

    old_tickers = base["tickers"]
    assert len(old_tickers) == 227
    assert set(old_tickers) <= {site_key(t) for t in ws}
    carried = sorted(set(old_tickers) & publishable)
    new = sorted(publishable - set(old_tickers))
    assert len(carried) == 226 and len(new) == 156, (len(carried), len(new))
    assert set(old_tickers) - publishable == {"BYND"}

    # ---- verify the flag translation against the carried names first ----
    # Every carried T1 flag in the workspace inputs must translate to the
    # exact flag the site base already carries (168 examples; the 169th
    # T1 flag belongs to BYND, which is unpublished and not carried).
    t1_checked = 0
    for t in carried:
        site_flags = old_tickers[t].get("flags") or []
        for f in ws[site_key(t) if t != "BRK-B" else "BRK.B"].get("flags") or []:
            if T1_RE.match(f):
                translated, _ = public_flag(f)
                assert translated in site_flags, (
                    f"T1 translation mismatch for {t}: {translated!r} "
                    f"not in site flags")
                t1_checked += 1
    assert t1_checked == 168, f"expected 168 carried T1 flags, got {t1_checked}"
    print(f"flag translation verified against {t1_checked} carried T1 flags")

    # ---- build the new base ---------------------------------------------
    counts = {"t1_template": 0, "growth_fallback": 0, "beta_computed": 0,
              "fcf_share": 0, "nvo_oneoff": 0, "jpm_t1": 0,
              "jpm_q2_items": 0, "jpm_fcf": 0, "jpm_technicals": 0,
              "jpm_dcf_skip": 0}
    new_tickers = {}
    for st in sorted(publishable):
        wt = "BRK.B" if st == "BRK-B" else st
        rec = copy.deepcopy(ws[wt])
        rec.pop("stock_verdicts", None)  # site never carried it
        rec.pop("revenue_ttm_adjusted", None)  # engine never reads it
        if st in old_tickers:
            # Carried: keep the site base's display text verbatim.
            site_rec = old_tickers[st]
            rec["flags"] = list(site_rec["flags"])
            if rec.get("name") is None:
                assert site_rec.get("name"), f"{st}: no name anywhere"
                rec["name"] = site_rec["name"]
            if site_rec.get("oneoff_adjustments") is not None:
                # Site list kept (BA/GME curations, AMZN note wording);
                # values must match the workspace list item by item
                # (note text excluded — that is the display difference).
                ws_list = rec.get("oneoff_adjustments") or []
                site_list = site_rec["oneoff_adjustments"]
                assert len(ws_list) == len(site_list), (
                    f"{st}: oneoff list length {len(ws_list)} vs "
                    f"{len(site_list)}")
                for a, b in zip(ws_list, site_list):
                    aa = {k: v for k, v in a.items() if k != "note"}
                    bb = {k: v for k, v in b.items() if k != "note"}
                    assert aa == bb, f"{st}: oneoff item differs: {aa} vs {bb}"
                rec["oneoff_adjustments"] = copy.deepcopy(site_list)
            for k in ("debt_fcf", "indexes", "market_cap", "rel_vol"):
                rec[k] = site_rec[k]
            # Scoring fields must equal the v1.7 inputs exactly, apart
            # from the enumerated display fields above.
            for k, v in rec.items():
                if k in ("flags", "name", "oneoff_adjustments", "debt_fcf",
                         "indexes", "market_cap", "rel_vol"):
                    continue
                assert ws[wt].get(k) == v, f"{st}: carried field {k} changed"
        else:
            # New to the site: translate flags to public copy.
            translated = []
            for f in rec.get("flags") or []:
                tf, template = public_flag(f)
                if template:
                    counts[template] += 1
                for tok in LEAK_TOKENS:
                    assert tok not in tf, (
                        f"{st}: leak token {tok!r} survives in flag: {tf!r}")
                translated.append(tf)
            rec["flags"] = translated
            if rec.get("name") is None:
                assert st in NAME_OVERRIDES, f"{st}: no name and no override"
                rec["name"] = NAME_OVERRIDES[st]
            for k in ("debt_fcf", "indexes", "market_cap", "rel_vol"):
                rec[k] = None
        assert rec.get("name"), f"{st}: empty name"
        assert rec.get("price") is not None, f"{st}: no price"
        if rec.get("trailing_pe") is not None:
            assert rec.get("trailing_eps") is not None, (
                f"{st}: trailing P/E without trailing EPS")
        new_tickers[st] = rec

    # ---- curations intact -------------------------------------------------
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
    # SO present with its validated FV inputs (median of the 3 legs).
    so = new_tickers["SO"]
    assert so["price"] == 93.59

    # ---- top level ---------------------------------------------------------
    assert base["as_of"] == "2026-11-16" and base["price_date"] == "2026-11-13"
    base["merged_from"] = base["merged_from"] + [
        "Engine v1.7 expansion 2026-11-19 (SPEC v1.5): 382 publishable "
        "tickers from scoring-engine-v1.7/inputs.json (400 scored minus "
        "the 18 FV <= 0 names). 226 carried from the v1.6 base (site "
        "display text kept verbatim); 156 new (15 two-leg names "
        "unpublished under Option A + 141 brand-new). Flags on new names "
        "translated to public copy (RULEBOOK §16); stock_verdicts dropped.",
    ]
    base["note"] = base["note"] + (
        " Engine v1.7 expansion 2026-11-19 (SPEC v1.5): 382 publishable "
        "tickers at the 2026-11-13 close (400 scored minus the 18 FV <= 0 "
        "names). The 15 two-leg names unpublished under Option A are live "
        "now; BYND stays out (FV -$16.22).")
    base["tickers"] = new_tickers
    assert len(base["tickers"]) == 382

    # ---- write --------------------------------------------------------------
    bak = BASE + ".pre-v17-bak"
    if not os.path.exists(bak):
        with open(bak, "w") as f:
            json.dump(load(BASE), f, indent=2)
        print(f"backed up the v1.6 base to {bak}")
    json.dump(base, open(BASE, "w"), indent=2)
    after = hashlib.md5(open(BASE, "rb").read()).hexdigest()
    report = {
        "as_of": base["as_of"], "price_date": base["price_date"],
        "tickers": 382, "carried": len(carried), "new": len(new),
        "unpublished_excluded": sorted(UNPUBLISHED),
        "t1_flags_verified_against_carried": t1_checked,
        "flag_translations_on_new_names": counts,
        "name_overrides": NAME_OVERRIDES,
        "base_md5_before": before, "base_md5_after": after,
    }
    json.dump(report, open(REPORT, "w"), indent=2)
    print(f"base_inputs.json md5: {before} -> {after}")
    print(f"wrote scripts/engine/base_inputs.json: 382 tickers "
          f"(226 carried, 156 new); flag translations {counts}")
    print(f"report: {REPORT}")


if __name__ == "__main__":
    main()
