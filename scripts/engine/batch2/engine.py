#!/usr/bin/env python3
"""Scoring engine v1.3-batch2 — The Stock Check.
BATCH-2 ADAPTATIONS (v1.3 logic unchanged; see METHOD-batch2.md):
  (a) TICKERS = the 8 batch-2 names; TRUST COMPLETENESS generalised from
      the v1.3 hardcoded {NVDA/AAPL/MSFT: 100, GOOGL: 80, NVO: 65} by the
      same precedents — 80 where a ONEOFF-v1 adjustment was applied
      (AMZN/META/TSLA/AVGO/BRK-B), 100 where all inputs are present with
      no adjustment (LLY, V), 90 for JPM (exactly one documented gap:
      DCF leg skipped for a definitional bank-FCF reason; no adjustment).
  (b) DCF DISCOUNT TIER generalised from the v1.3 hardcoded 12% NVDA /
      10% rest: 12% if raw beta >= 2.0, else 10%. No batch-2 ticker
      triggers 12% (max raw beta TSLA 1.743) — all eight use 10%; the
      tier is implemented in the decision DCF leg, the CAPM grid spread,
      and the grid note (which no longer names v1.3 tickers).
  (c) DCF SKIP REASON generalised from the v1.3 hardcoded DKK text:
      JPM skips the DCF leg for a documented bank-FCF reason (see
      DCF_SKIP_REASONS) and uses the existing NVO skip path (FV = mean
      of PEGY + Forward legs). JPM debt/equity computed from the FY2025
      annual balance sheet (see inputs.json / JPM SOURCES).
  Everything else is v1.3 verbatim, including the frozen locked set,
  weights, gates, ladder ratios, PEGY/DCF/Forward-sector legs, ONEOFF-v1,
  CAPM cross-check and sensitivity grid (display only).

Scoring engine v1.3 — The Stock Check.
SPEC v1.1 FINAL (2026-11-16). Deterministic: reads inputs.json only
(verified snapshot as of 2026-11-16, prices at 2026-11-13 close).
No live calls, no invented numbers. Writes results.json.
Run:  python3 engine.py

CHANGES vs v1.2 (display / cross-check ONLY — no decision leg changes):
  (1) CAPM CROSS-CHECK DCF leg: the DCF leg is computed a second time with
      a CAPM discount (live 10Y Treasury 5.10% as of 2026-11-12, FRED DGS10;
      adjusted beta 0.67 x raw Yahoo beta + 0.33; Damodaran implied ERP
      4.41% as of 2026-11-01). Same base FCF/share, same growth, same
      terminal growth 2.5%, same 5y horizon as the decision DCF leg.
      Stored per ticker as dcf_capm_crosscheck in results.json. It does
      NOT enter the triangulated fair value, any pillar score, or any
      verdict — the flat 10.0%/12.0% discounts remain the decision legs
      until the CAPM leg's backtest effect is measured (SPEC v1.1 §3(a)).
  (2) SENSITIVITY GRID: the decision DCF leg is also shown as a grid
      across FCF growth 0/5/10/15/20% x risk-free rate 4.0/4.5/5.0/5.5/6.0%,
      stored per ticker as dcf_sensitivity_grid in results.json. Grid
      construction: discount = rf + locked spread (locked discount minus
      locked rf 5.00%: 5.0pp low-beta, 7.0pp NVDA), so the rf 5.0% column
      at the base growth reproduces the decision DCF leg exactly.
      Growth capped at 20% (no 40% rows); base FCF/share unchanged
      (NVDA normalised $4.80; others own TTM FCF/share; NVO skipped —
      DKK basis unverified, same as the decision DCF leg).
Everything else is FROZEN from v1.2: weights, gates, hysteresis, locked
DCF set, ladder ratios, PEGY/DCF/Forward-sector legs, ONEOFF-v1.
The triangulated fair values, pillar scores, overall scores and verdicts
are therefore IDENTICAL to v1.2 — verified in SUMMARY-v1.3.md.
Borrowed from the USA Economy Now comparison (see
../../research_notes/usaeconomynow-fairvalue-dcf-model-20261116-0402/report.md):
only the CAPM discount construction (as a cross-check) and the
growth x rate grid presentation. NOT adopted: reported-only base FCF
(normalisation kept), uncapped 40% growth rows, any debt-bridge inference.

CHANGES vs v1.1 (v1.2, carried forward):
  (1) FORWARD-SECTOR leg replaces Forward-22: next-year EPS x the ticker's
      GICS sector forward P/E (FactSet Earnings Insight, 13 Nov 2026; cap
      35x / floor 10x, neither binds) / 1.10. The old Forward-22 value is
      still computed and shown in the method note for traceability.
  (2) ONEOFF-v1 generalises the GOOGL special case: the Quality pillar now
      uses adjusted NI for OCF/NI and FCF conversion whenever
      net_income_ttm_adjusted is set (GOOGL and NVO in v1.2), and the PEGY
      leg uses trailing_pe_adjusted whenever set. GOOGL's adjustment is now
      the after-tax removal across all three 2026 quarters (net +$99.1B),
      not the Q2-only pre-tax removal of v1.1 — the numbers almost exactly
      coincide (see RECALIBRATION.md §2.2).
Everything else is FROZEN from v1.1: weights, gates, hysteresis, locked DCF
set, ladder ratios, PEGY/DCF legs.

FIVE PILLARS (weights in OVERALL_WEIGHTS) and verdict gates are the v1 spec;
every threshold is stated here and in METHOD.md. A score of None means the
leg could not be computed from verified inputs — it is excluded and flagged,
never filled in with a guess.

PILLAR 1 — CONVICTION (25%): Story + Financials from our Story-Tracker,
    reused as published, NOT recomputed. Score = mean(Story, Financials).
    GOOGL uses GOOG (class C, same company) as proxy — flagged in inputs.
PILLAR 2 — VALUATION (30%): triangulated fair value from three legs; the
    spread is shown, not hidden. Median of available legs = triangulated FV.
    (a) DCF — LOCKED SET v1.1 (adopted 2026-11-15, per Google AI Mode audit
        of the v1 provisional assumptions, user-approved): rf 5.00% (10y
        Treasury ~5.10-5.15%); tiered discount rates, NOT a flat 9% —
        10.0% for low-beta mega-caps (AAPL/MSFT/GOOGL/NVO), 12.0% for
        high-beta NVDA; terminal growth 2.5%; 5y FCF growth capped at 20%.
        NVDA: own 5y DCF on NORMALISED base FCF/share $4.80 (blend of
        FY26 actuals ~$4.01 and TTM $5.21, smoothing working-capital
        swings), g=20%, discount 12%, tg 2.5% -> $102.78. The user's grid
        ($83.00 at rf 4.00%, 20% growth) is kept in code as an audit
        reference only — its implied discount (rf + 8-10pp) is consistent
        with the locked 12% once rf is updated to 5%. Other tickers use
        an equivalent 5y DCF on their OWN TTM FCF/share at 10.0% / tg 2.5%.
        NVO: DCF leg SKIPPED (FCF in DKK, USD per-share basis not verified)
        — triangulated FV is the mean of its 2 legs.
    (b) Lynch PEGY: PEGY = (EPS growth% + div yield%) / P/E; growth is the
        implied 5y EPS growth (trailing P/E / Yahoo PEG) CAPPED at 30%
        (Lynch's own caution: >30% growth rarely sustains; uncapped value
        shown in notes). Earnings basis is NON-GAAP consistently (matches
        how Yahoo's PEG is built): where a material one-off distorts GAAP
        earnings, adjusted EPS/P/E is used for that ticker — ONEOFF-v1:
        GOOGL uses adjusted trailing P/E 26.65x (equity-security marks in
        all three 2026 quarters removed, after-tax), NVO uses adjusted
        trailing P/E 12.64x (Q1 2026 provision reversal removed).
        Fair price = price x PEGY.
    (c) Forward-sector (v1.2 — replaces Forward-22): next-year analyst
        EPS x the ticker's GICS sector forward P/E (FactSet Earnings
        Insight, 13 Nov 2026; cap 35x / floor 10x, neither binds),
        discounted 10% for 1 year. The old Forward-22 value (x 22x) is
        still computed and shown in the method note for traceability.
    Ladder from OUR triangulated FV: Heavy 0.60x / Buy 0.80x / Fair 1.00x /
        Exit 1.20x (explicit; fixed for all names).
    Valuation score from upside (FV/price - 1), piecewise-linear:
        -40%->10, -25%->25, -10%->40, 0%->55, +10%->70, +25%->85, +50%->100.
        Uncertainty cap: if (max leg - min leg)/median FV > 0.75, cap at 65;
        if > 1.00, cap at 55.
PILLAR 3 — QUALITY/FORENSICS (20%): sub-scores, weighted:
    OCF/NI 25% | accruals (Sloan) 20% | receivables trend 15% |
    FCF conversion 20% | ROA 10% | leverage (D/E) 10%.
    OCF/NI and FCF conversion use ADJUSTED NI whenever
    net_income_ttm_adjusted is set (ONEOFF-v1 — GOOGL and NVO in v1.2;
    v1.1 hard-coded this for GOOGL only).
PILLAR 4 — TECHNICAL/TIMING (10%): trend 35% | price vs 200d 25% |
    RSI 20% | MACD 20%. Labelled TIMING, not conviction.
PILLAR 5 — RISK/TRUST (15%): completeness 30% | analyst coverage 25% |
    target dispersion 25% | insider 20%.
VERDICT GATES (absolute, v1 proposal):
    AVOID if overall < 45, or valuation score < 30, or quality < 40,
        or price >= our Exit level.
    GROWTH if overall >= 60 and upside >= 0% and quality >= 55 and
        conviction >= 50 and 3y revenue CAGR >= 10%.
    VALUE if overall >= 60 and upside >= +25% and quality >= 60 and
        conviction >= 50 and 3y revenue CAGR < 15%. (Growth checked first
        when both could apply; Value requires the higher upside and slower
        growth.) The conviction >= 50 requirement was added during
        verification: without it, NVO scored Growth on valuation alone while
        its Story-Tracker quadrant is Out (Story 38.3) — a verdict should
        not call a name Growth when our own conviction pillar says Out.
    WATCH otherwise.
    HYSTERESIS (spec): a verdict changes only if the overall score moves
        >= 5 points across a threshold, or a gate flips on 2 consecutive
        runs. Single snapshot here, so no hysteresis trigger applies.
"""
import json, os, math

BASE = os.path.dirname(os.path.abspath(__file__))
IN = json.load(open(os.path.join(BASE, "inputs.json")))
TICKERS = ["AMZN", "META", "TSLA", "AVGO", "BRK-B", "LLY", "JPM", "V"]

OVERALL_WEIGHTS = {"conviction": 0.25, "valuation": 0.30, "quality": 0.20,
                   "technical": 0.10, "trust": 0.15}
LADDER_RATIOS = {"heavy": 0.60, "buy": 0.80, "fair": 1.00, "exit": 1.20}
RF = 0.05            # Treasury risk-free rate, LOCKED v1.1 (10y ~5.10-5.15% Nov 2026)
DISCOUNT_LOW = 0.10  # low-beta mega-caps (AAPL/MSFT/GOOGL/NVO) — LOCKED v1.1
DISCOUNT_HIGH = 0.12 # high-beta tier — LOCKED v1.1 (v1.3: NVDA only, CAPM ~14.4% at beta 2.21; 12% is the conservative tier)
def discount_for(beta_raw):
    """Batch-2 tier rule: 12% if raw beta >= 2.0, else 10% (generalises the v1.3 NVDA 12% tier)."""
    return DISCOUNT_HIGH if beta_raw >= 2.0 else DISCOUNT_LOW
# Trust completeness, batch-2 (same precedents as v1.3: 100 complete/no
# adjustment; 80 ONEOFF-v1 adjustment applied; 65 NVO-like triple gap —
# none here; 90 JPM single documented gap, justified in METHOD-batch2.md).
COMPLETENESS = {"AMZN": 80, "META": 80, "TSLA": 80, "AVGO": 80, "BRK-B": 80,
                "LLY": 100, "JPM": 90, "V": 100}
# DCF skip reasons by ticker (generalises the v1.3 hardcoded DKK text).
DCF_SKIP_REASONS = {
    "JPM": "bank FCF undefined under the v1.3 Yahoo-row definition \u2014 Yahoo's Free Cash Flow row for JPM equals operating cash flow, which includes deposit/trading flows; StockAnalysis publishes no FCF for JPM",
}
def dcf_skip_reason(t):
    return DCF_SKIP_REASONS.get(t, "FCF in DKK, USD per-share basis not verified")
TERMINAL_G = 0.025
PEGS_CAP = 0.30      # PEGY growth cap (30%)
DCF_GROWTH_CAP = 0.20  # LOCKED v1.1 (was 25%)
NVDA_BASE_FCF_NORM = 4.80  # LOCKED v1.1: normalised FCF/share, blend of FY26 ~$4.01 and TTM $5.21
# --- v1.3 additions: CAPM cross-check + sensitivity grid (DISPLAY ONLY) ---
RF_CAPM = 0.051            # live 10Y Treasury, 5.10% as of 2026-11-12 (FRED DGS10) — cross-check only; locked rf 5.00% still drives the decision leg
ERP_DAMODARAN = 0.0441     # Damodaran implied ERP, 4.41% as of 2026-11-01 (Trailing 12 month, with adjusted payout)
BETA_ADJ_A, BETA_ADJ_B = 0.67, 0.33  # adjusted beta = 0.67 x raw + 0.33 (Bloomberg-style, as used by USA Economy Now)
GRID_GROWTHS = [0.00, 0.05, 0.10, 0.15, 0.20]  # capped at 20% — no 40% rows
GRID_RFS = [0.040, 0.045, 0.050, 0.055, 0.060]  # risk-free rates for the grid
def capm_discount(beta_raw):
    """CAPM discount: live 10Y + adjusted beta x Damodaran implied ERP."""
    return RF_CAPM + (BETA_ADJ_A * beta_raw + BETA_ADJ_B) * ERP_DAMODARAN
def grid_discount(rf, spread):
    """Grid discount: rf + locked spread (locked discount - locked rf 5.00%)."""
    return rf + spread
USER_GRID_4PCT = {0.0: 38.50, 0.05: 46.90, 0.10: 57.10, 0.15: 69.20, 0.20: 83.00,
                  0.25: 99.20, 0.30: 118.10, 0.35: 139.90, 0.40: 165.00}  # audit reference only in v1.1
USER_GRID_BASE_GROWTH = 0.20  # base scenario for NVDA DCF leg (see METHOD.md)

def dcf(f0, g, r=DISCOUNT_LOW, tg=TERMINAL_G, n=5):
    pv = sum(f0 * (1 + g) ** t / (1 + r) ** t for t in range(1, n + 1))
    term = f0 * (1 + g) ** n * (1 + tg) / (r - tg)
    return pv + term / (1 + r) ** n

def interp(x, pts):
    """Piecewise-linear interpolation through (x, y) points, clamped at ends."""
    pts = sorted(pts)
    if x <= pts[0][0]:
        return pts[0][1]
    if x >= pts[-1][0]:
        return pts[-1][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if x0 <= x <= x1:
            return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
    return pts[-1][1]

def band(x, bands):
    """bands: list of (upper_inclusive, score) in ascending x; returns score."""
    for hi, s in bands:
        if x <= hi:
            return s
    return bands[-1][1]

# ---------------- Pillar 1: Conviction ----------------
def pillar_conviction(d):
    st, fi = d["story_tracker"]["story"], d["story_tracker"]["financials"]
    return round((st + fi) / 2, 1), {"story": st, "financials": fi}

# ---------------- Pillar 2: Valuation ----------------
def pillar_valuation(t, d):
    price = d["price"]
    legs = {}
    # (a) DCF — LOCKED SET v1.1
    if t == "NVDA":
        legs["dcf"] = {"value": round(dcf(NVDA_BASE_FCF_NORM, USER_GRID_BASE_GROWTH, r=DISCOUNT_HIGH), 2),
                       "method": "LOCKED v1.1: own 5y DCF on normalised base FCF/share $4.80, "
                                 "g=20% (capped), discount 12.0%, terminal g 2.5%. "
                                 "User's grid at rf 4.00% gave $83.00 for the same growth — "
                                 "difference is the higher base ($4.80 vs grid-implied ~$4.61) "
                                 "partly offset by the higher discount.",
                       "growth_scenario": USER_GRID_BASE_GROWTH}
    elif d["fcf_per_share_ttm"] is not None:
        g = min(d["implied_5y_eps_growth"], DCF_GROWTH_CAP)
        disc = discount_for(d["beta"])
        legs["dcf"] = {"value": round(dcf(d["fcf_per_share_ttm"], g, r=disc), 2),
                       "method": f"LOCKED v1.1: own 5y DCF on TTM FCF/share ${d['fcf_per_share_ttm']}, "
                                 f"g={g:.1%} (implied 5y EPS growth, capped 20%), "
                                 f"discount {disc:.1%} ({'high-beta tier, raw beta >= 2.0' if disc == DISCOUNT_HIGH else 'low-beta tier'}), terminal g 2.5%",
                       "growth_scenario": round(g, 4)}
    else:
        legs["dcf"] = {"value": None,
                       "method": f"SKIPPED — {dcf_skip_reason(t)}",
                       "growth_scenario": None}
    # (a2) v1.3 — CAPM cross-check DCF leg + sensitivity grid (DISPLAY ONLY).
    # Same base FCF/share and growth as the decision leg; never enters the
    # triangulation, any pillar score, or any verdict (SPEC v1.1 §3(a)).
    beta_adj = round(BETA_ADJ_A * d["beta"] + BETA_ADJ_B, 5)
    r_capm = capm_discount(d["beta"])
    if legs["dcf"]["value"] is not None:
        if t == "NVDA":
            dcf_f0, dcf_g, dcf_spread = NVDA_BASE_FCF_NORM, USER_GRID_BASE_GROWTH, DISCOUNT_HIGH - RF
        else:
            dcf_f0 = d["fcf_per_share_ttm"]
            dcf_g = min(d["implied_5y_eps_growth"], DCF_GROWTH_CAP)
            dcf_spread = discount_for(d["beta"]) - RF
        capm_leg = {"value": round(dcf(dcf_f0, dcf_g, r=r_capm), 2),
                    "discount_capm": round(r_capm, 4),
                    "beta_raw": d["beta"], "beta_adjusted": beta_adj,
                    "rf_live": RF_CAPM, "rf_live_asof": "2026-11-12",
                    "erp": ERP_DAMODARAN, "erp_asof": "2026-11-01",
                    "method": f"v1.3 CAPM cross-check (SPEC v1.1 §3(a)): same base FCF/share ${dcf_f0} and growth {dcf_g:.1%} as the decision DCF leg, "
                              f"discount = 10Y 5.10% (2026-11-12, FRED DGS10) + adjusted beta {beta_adj:.3f} x Damodaran implied ERP 4.41% (2026-11-01) = {r_capm:.2%}. "
                              "Cross-check only — does not change the fair value, score or verdict."}
        grid = {}
        for g in GRID_GROWTHS:
            row = {}
            for rf in GRID_RFS:
                row[f"{rf:.1%}"] = round(dcf(dcf_f0, g, r=grid_discount(rf, dcf_spread)), 2)
            grid[f"{g:.0%}"] = row
        grid_note = ("v1.3 sensitivity grid (SPEC v1.1 §3(a)): decision DCF leg across FCF growth 0–20% x rf 4.0–6.0%. "
                     f"Discount = rf + locked spread {dcf_spread:.1%} (locked discount {DISCOUNT_HIGH if t == 'NVDA' else DISCOUNT_LOW:.1%} - locked rf 5.00%). "
                     "The rf 5.0% column reproduces the decision DCF leg exactly where the base growth is a grid row "
                     "(NVDA, 20% in v1.3); otherwise the decision leg sits between two grid rows. "
                     f"Base FCF/share ${dcf_f0}, terminal growth 2.5%, 5y horizon.")
    else:
        capm_leg = {"value": None, "discount_capm": round(r_capm, 4),
                    "beta_raw": d["beta"], "beta_adjusted": beta_adj,
                    "rf_live": RF_CAPM, "rf_live_asof": "2026-11-12",
                    "erp": ERP_DAMODARAN, "erp_asof": "2026-11-01",
                    "method": f"SKIPPED — same reason as the decision DCF leg ({dcf_skip_reason(t)}); CAPM discount still recorded for transparency."}
        grid, grid_note = None, f"SKIPPED — same reason as the decision DCF leg ({dcf_skip_reason(t)})."
    # (b) Lynch PEGY
    g_cap = min(d["implied_5y_eps_growth"], PEGS_CAP)
    pe = d["trailing_pe_adjusted"] if d["trailing_pe_adjusted"] else d["trailing_pe"]
    pegy = ((g_cap * 100) + (d["dividend_yield"] * 100)) / pe
    legs["pegy"] = {"value": round(price * pegy, 2),
                    "method": f"PEGT = ({g_cap:.1%} growth capped at 30% + {d['dividend_yield']:.2%} div) / "
                              f"P/E {pe:.2f} = {pegy:.3f}; fair = price x PEGY",
                    "pegy": round(pegy, 3), "growth_used": round(g_cap, 4),
                    "pe_used": pe,
                    "uncapped_pegy": round(((d["implied_5y_eps_growth"] * 100) + (d["dividend_yield"] * 100)) / pe, 3)}
    # (c) Forward-sector — v1.2: sector multiple replaces the fixed 22x
    mult = d["sector_multiple"]
    mult_capped = min(max(mult, 10.0), 35.0)
    fwd_sector = d["forward_eps"] * mult_capped / 1.10
    fwd22 = d["forward_eps"] * 22 / 1.10  # kept for traceability only
    legs["forward_sector"] = {"value": round(fwd_sector, 2),
                         "method": f"v1.2 Forward-sector: next-year EPS ${d['forward_eps']:.2f} x "
                                   f"{d['gics_sector']} forward P/E {mult:.1f} "
                                   f"(FactSet Earnings Insight, {d['sector_multiple_asof']}; "
                                   f"cap 35x / floor 10x, {'BINDS' if mult_capped != mult else 'not binding'}) "
                                   f"/ 1.10. Old Forward-22 value was ${fwd22:,.2f} (x 22x).",
                         "sector_multiple": mult, "sector_multiple_asof": d["sector_multiple_asof"],
                         "forward22_value": round(fwd22, 2)}
    vals = [v["value"] for v in legs.values() if v["value"] is not None]
    if len(vals) >= 3:
        vals_sorted = sorted(vals)
        fv = vals_sorted[1]  # median
        fv_method = "median of 3 legs"
    elif len(vals) == 2:
        fv = round(sum(vals) / 2, 2)
        fv_method = "mean of 2 available legs (DCF skipped) — flagged"
    else:
        fv, fv_method = None, "insufficient legs"
    upside = (fv / price - 1) if fv else None
    spread = ((max(vals) - min(vals)) / fv) if (fv and len(vals) >= 2) else None
    score = None
    if upside is not None:
        score = interp(upside, [(-0.40, 10), (-0.25, 25), (-0.10, 40), (0.0, 55),
                                (0.10, 70), (0.25, 85), (0.50, 100)])
        if spread is not None and spread > 1.00:
            score = min(score, 55)
        elif spread is not None and spread > 0.75:
            score = min(score, 65)
        score = round(score, 1)
    ladder = {k: round(fv * r, 2) for k, r in LADDER_RATIOS.items()} if fv else None
    return score, {"legs": legs, "triangulated_fv": fv, "fv_method": fv_method,
                   "upside_pct": round(upside, 3) if upside is not None else None,
                   "leg_spread_div_fv": round(spread, 3) if spread is not None else None,
                   "ladder": ladder, "ladder_ratios": LADDER_RATIOS,
                   "dcf_capm_crosscheck": capm_leg,
                   "dcf_sensitivity_grid": {"values": grid, "note": grid_note}}

# ---------------- Pillar 3: Quality ----------------
def pillar_quality(d):
    ocf_pct = d["ocf_pct_net_income_adjusted"] if d["ocf_pct_net_income_adjusted"] else d["ocf_pct_net_income_ttm"]
    s_ocf = band(ocf_pct, [(0.40, 20), (0.60, 40), (0.80, 60), (1.00, 80), (999, 100)])
    acc = d["accruals_sloan_latest_annual"]
    s_acc = band(acc, [(0.0, 100), (0.05, 75), (0.10, 50), (999, 25)])
    dpp = d["receivables_ratio_change_pp"]
    s_recv = band(dpp, [(1.0, 100), (3.0, 70), (5.0, 40), (999, 20)])
    fcf_conv = d["fcf_conversion_fcf_div_ni_ttm"]
    if d["net_income_ttm_adjusted"]:  # ONEOFF-v1: use adjusted NI whenever set (GOOGL, NVO in v1.2)
        fcf_conv = d["fcf_ttm"] / d["net_income_ttm_adjusted"]
    s_fcf = band(fcf_conv, [(0.20, 20), (0.40, 45), (0.60, 65), (0.80, 85), (999, 100)])
    s_roa = band(d["roa"], [(0.10, 35), (0.15, 55), (0.20, 70), (0.30, 85), (999, 100)])
    s_lev = band(d["debt_to_equity_ratio"], [(0.30, 100), (0.60, 80), (1.00, 60), (2.00, 40), (999, 20)])
    subs = {"ocf_vs_ni": s_ocf, "accruals": s_acc, "receivables_trend": s_recv,
            "fcf_conversion": s_fcf, "roa": s_roa, "leverage": s_lev}
    score = round(0.25 * s_ocf + 0.20 * s_acc + 0.15 * s_recv + 0.20 * s_fcf + 0.10 * s_roa + 0.10 * s_lev, 1)
    return score, {"subscores": subs,
                   "inputs": {"ocf_pct_ni_used": round(ocf_pct, 3), "accruals_sloan": d["accruals_sloan_latest_annual"],
                              "receivables_change_pp": d["receivables_ratio_change_pp"],
                              "fcf_conversion_used": round(fcf_conv, 3), "roa": d["roa"],
                              "debt_to_equity": d["debt_to_equity_ratio"]}}

# ---------------- Pillar 4: Technical ----------------
def pillar_technical(d):
    tc = d["technicals"]; price = d["price"]
    ema20, ema50, ema200 = tc["ema20"], tc["ema50"], tc["ema200"]
    if price > ema20 > ema50 > ema200:
        s_trend = 100
    elif price > ema50 > ema200:
        s_trend = 75
    elif price > ema50 or price > ema200:
        s_trend = 60
    elif price < ema20 < ema50 and price < ema200:
        s_trend = 15
    else:
        s_trend = 35
    vs200 = tc["price_vs_200d_pct"]
    s_vs = band(vs200, [(-0.10, 20), (0.0, 45), (0.10, 75), (999, 100)])
    rsi = tc["rsi14"]
    if 45 <= rsi <= 60:
        s_rsi = 80
    elif 60 < rsi <= 70:
        s_rsi = 70
    elif 30 <= rsi < 45:
        s_rsi = 55
    elif rsi > 70:
        s_rsi = 40
    else:
        s_rsi = 35
    s_macd = 75 if tc["macd_hist"] > 0 else 40
    score = round(0.35 * s_trend + 0.25 * s_vs + 0.20 * s_rsi + 0.20 * s_macd, 1)
    return score, {"subscores": {"trend_ema": s_trend, "price_vs_200d": s_vs, "rsi": s_rsi, "macd": s_macd},
                   "inputs": {"ema20": ema20, "ema50": ema50, "ema200": ema200,
                              "rsi14": tc["rsi14"], "macd_hist": tc["macd_hist"],
                              "price_vs_200d_pct": vs200}}

# ---------------- Pillar 5: Risk/Trust ----------------
def pillar_trust(t, d):
    comp = COMPLETENESS[t]  # batch-2: precedents from v1.3, see COMPLETENESS above
    n = d["analysts"]["n_opinions"]
    s_cov = 100 if n >= 30 else (80 if n >= 10 else 50)
    disp = d["analysts"]["target_spread_div_mean"]
    s_disp = band(disp, [(0.30, 100), (0.60, 80), (1.00, 60), (999, 40)])
    ins = d["insider_90d"]
    if ins["n_rows"] == 0:
        s_ins, ins_note = 50, "no insider data in Yahoo feed — neutral, not 'no selling'"
    elif ins["sales_90d"] > 0 and ins["buys_90d"] == 0:
        val = ins["sale_value_90d_usd"]
        s_ins = 35 if val >= 500_000_000 else 45
        ins_note = f"{ins['sales_90d']} sales, {ins['sale_shares_90d']:,} shares, ${val/1e6:,.0f}M, 0 buys in 90d"
    else:
        s_ins, ins_note = 60, "mixed insider activity"
    score = round(0.30 * comp + 0.25 * s_cov + 0.25 * s_disp + 0.20 * s_ins, 1)
    return score, {"subscores": {"completeness": comp, "analyst_coverage": s_cov,
                                 "target_dispersion": s_disp, "insider": s_ins},
                   "inputs": {"n_analysts": n, "target_spread_div_mean": disp, "insider_note": ins_note}}

# ---------------- Verdict ----------------
def verdict(t, d, overall, pillars):
    price = d["price"]
    val = pillars["valuation"]["detail"]; qual_score = pillars["quality"]["score"]
    val_score = pillars["valuation"]["score"]
    upside = val["upside_pct"]
    ladder = val["ladder"]
    rev_cagr = d["revenue_cagr_3y_annual"]
    reasons = []
    if overall < 45:
        reasons.append(f"overall {overall} < 45")
    if val_score < 30:
        reasons.append(f"valuation score {val_score} < 30")
    if qual_score < 40:
        reasons.append(f"quality {qual_score} < 40")
    if ladder and price >= ladder["exit"]:
        reasons.append(f"price ${price} at/above our Exit ${ladder['exit']}")
    if reasons:
        return "Avoid", "Avoid gate: " + "; ".join(reasons)
    conv_score = pillars["conviction"]["score"]
    if overall >= 60 and upside is not None and upside >= 0 and qual_score >= 55 and conv_score >= 50 and rev_cagr is not None and rev_cagr >= 0.10:
        return "Growth", f"overall {overall} ≥ 60, upside {upside:+.0%}, quality {qual_score} ≥ 55, conviction {conv_score} ≥ 50, 3y rev CAGR {rev_cagr:.0%} ≥ 10%"
    if overall >= 60 and upside is not None and upside >= 0.25 and qual_score >= 60 and conv_score >= 50 and (rev_cagr is None or rev_cagr < 0.15):
        return "Value", f"overall {overall} ≥ 60, upside {upside:+.0%} ≥ +25%, quality {qual_score} ≥ 60, conviction {conv_score} ≥ 50, slower growth"
    return "Watch", f"overall {overall} — no Growth/Value gate met, no Avoid gate tripped"

# ---------------- Pros / cons (rule-based, from the numbers) ----------------
def pros_cons(t, d, pillars, overall, vdt):
    p, c = [], []
    price = d["price"]; val = pillars["valuation"]["detail"]; q = pillars["quality"]["detail"]; tc = pillars["technical"]["detail"]
    fv = val["triangulated_fv"]
    if val["upside_pct"] is not None and val["upside_pct"] > 0:
        p.append(f"Triangulated fair value ${fv:,.2f} is {val['upside_pct']:+.0%} above the ${price:,.2f} price — the DCF/PEGY/Forward-sector legs span "
                 f"${min(v['value'] for v in val['legs'].values() if v['value'] is not None):,.2f}–"
                 f"${max(v['value'] for v in val['legs'].values() if v['value'] is not None):,.2f}, so treat the midpoint, not any single leg, as the anchor.")
    if val["upside_pct"] is not None and val["upside_pct"] < 0:
        c.append(f"Triangulated fair value ${fv:,.2f} is {val['upside_pct']:.0%} below the ${price:,.2f} price — even the most generous leg "
                 f"(${max(v['value'] for v in val['legs'].values() if v['value'] is not None):,.2f}) sits below the price.")
    if d["revenue_cagr_3y_annual"] is not None and d["revenue_cagr_3y_annual"] >= 0.15:
        p.append(f"Revenue compounded {d['revenue_cagr_3y_annual']:.0%} a year over the last 3 fiscal years.")
    if d["revenue_cagr_3y_annual"] is not None and d["revenue_cagr_3y_annual"] < 0.10:
        c.append(f"Revenue compounded only {d['revenue_cagr_3y_annual']:.0%} a year over the last 3 fiscal years — growth is no longer the story.")
    if q["inputs"]["ocf_pct_ni_used"] >= 1.0:
        p.append(f"Operating cash flow is {q['inputs']['ocf_pct_ni_used']:.0%} of net income — profit is backed by more cash than earnings.")
    elif q["inputs"]["ocf_pct_ni_used"] < 0.80:
        c.append(f"Operating cash flow is only {q['inputs']['ocf_pct_ni_used']:.0%} of net income — a large slice of profit is not cash yet.")
    if q["subscores"]["accruals"] >= 75:
        p.append("Accruals are low/negative (Sloan) — earnings quality looks clean on that check.")
    if q["subscores"]["fcf_conversion"] <= 45:
        c.append(f"Free-cash-flow conversion is weak: FCF is only {q['inputs']['fcf_conversion_used']:.0%} of net income — capex is eating the cash the business earns.")
    if q["subscores"]["fcf_conversion"] >= 85:
        p.append(f"Free-cash-flow conversion is strong: FCF is {q['inputs']['fcf_conversion_used']:.0%} of net income.")
    if tc["subscores"]["trend_ema"] >= 75:
        p.append("Uptrend: price sits above its 20-, 50- and 200-day averages.")
    if tc["subscores"]["trend_ema"] <= 35:
        c.append(f"Downtrend: price ${price:,.2f} sits below its 20-day EMA (${tc['inputs']['ema20']:,.2f}) and 200-day EMA (${tc['inputs']['ema200']:,.2f}); RSI {tc['inputs']['rsi14']} — timing is poor even if the business is fine.")
    ins = pillars["trust"]["detail"]["inputs"]["insider_note"]
    if "sales" in ins and "0 buys" in ins:
        c.append(f"Insiders are net sellers — {ins}.")
    if d["story_tracker"]["quadrant"] in ("Out",):
        c.append(f"Our Story-Tracker rates it '{d['story_tracker']['quadrant']}' (Story {d['story_tracker']['story']}, Financials {d['story_tracker']['financials']}).")
    if d["story_tracker"]["quadrant"] in ("Full position", "Hold, don't add"):
        p.append(f"Our Story-Tracker rates it '{d['story_tracker']['quadrant']}' (Story {d['story_tracker']['story']}, Financials {d['story_tracker']['financials']}).")
    return p, c

# ---------------- Run ----------------
results = {"as_of": "2026-11-16", "price_date": "2026-11-13",
           "engine": "scoring-engine-v1.3-batch2 (v1.3 logic, SPEC v1.1 FINAL)",
           "locked_set": {"rf": 0.05, "discount_low_beta": 0.10, "discount_high_beta": 0.12,
                          "discount_tier_rule": "12% if raw beta >= 2.0, else 10% (batch-2 generalisation of the v1.3 NVDA 12% tier; no batch-2 ticker triggers 12% — max raw beta TSLA 1.743)",
                          "terminal_growth": 0.025, "dcf_growth_cap": 0.20,
                          "nvda_base_fcf_share_normalised": 4.80, "pegy_basis": "non-GAAP consistently",
                          "forward_sector": "next-year EPS x GICS sector forward P/E (FactSet, 13 Nov 2026), discounted 10% for 1y; cap 35x / floor 10x",
                          "oneoff_rule": "ONEOFF-v1 — see ../recalibration/RECALIBRATION.md §2"},
           "capm_crosscheck": {"ten_year_treasury_pct": 5.10, "ten_year_treasury_asof": "2026-11-12",
                               "ten_year_treasury_source": "FRED series DGS10",
                               "ten_year_treasury_url": "https://fred.stlouisfed.org/series/dgs10",
                               "damodaran_implied_erp_pct": 4.41, "damodaran_implied_erp_asof": "2026-11-01",
                               "damodaran_implied_erp_variant": "Trailing 12 month, with adjusted payout",
                               "damodaran_implied_erp_source": "Aswath Damodaran, NYU Stern (monthly implied ERP update)",
                               "damodaran_implied_erp_url": "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/home.htm",
                               "beta_adjustment": "beta_adjusted = 0.67 x raw Yahoo beta + 0.33",
                               "beta_source": "Yahoo Finance info.beta, fetched 2026-11-15 (data/betas_yahoo_2026-11-15.json)",
                               "formula": "r_capm = 10Y Treasury + beta_adjusted x Damodaran implied ERP",
                               "status": "CROSS-CHECK ONLY (SPEC v1.1 §3(a)) — does not change any fair value, score or verdict.",
                               "sensitivity_grid": "Decision DCF leg across FCF growth 0/5/10/15/20% x rf 4.0/4.5/5.0/5.5/6.0%; discount = rf + locked spread (5.0pp at the 10% discount tier, 7.0pp at the 12% tier). The rf 5.0% column reproduces the decision DCF leg exactly where the base growth is a grid row; otherwise the decision leg sits between two grid rows. Growth capped at 20%; no 40% rows."},
           "weights": OVERALL_WEIGHTS,
           "ladder_ratios": LADDER_RATIOS, "tickers": {}}
for t in TICKERS:
    d = dict(IN["tickers"][t]); d["ticker"] = t
    conv, conv_d = pillar_conviction(d)
    val_s, val_d = pillar_valuation(t, d)
    qual_s, qual_d = pillar_quality(d)
    tech_s, tech_d = pillar_technical(d)
    trust_s, trust_d = pillar_trust(t, d)
    pillars = {"conviction": {"score": conv, "detail": conv_d},
               "valuation": {"score": val_s, "detail": val_d},
               "quality": {"score": qual_s, "detail": qual_d},
               "technical": {"score": tech_s, "detail": tech_d},
               "trust": {"score": trust_s, "detail": trust_d}}
    overall = round(sum(OVERALL_WEIGHTS[k] * pillars[k]["score"] for k in OVERALL_WEIGHTS), 1)
    vdt, v_reason = verdict(t, d, overall, pillars)
    pros, cons = pros_cons(t, d, pillars, overall, vdt)
    our_ladder = val_d["ladder"]
    results["tickers"][t] = {
        "name": d["name"], "sector": d["sector"], "price": d["price"],
        "pillars": pillars, "overall_score": overall, "verdict": vdt, "verdict_reason": v_reason,
        "triangulated_fv": val_d["triangulated_fv"], "ladder": our_ladder,
        "pros": pros, "cons": cons,
        "flags": d.get("flags", []),
    }
    dcf_v = val_d['legs']['dcf']['value']
    capm_v = val_d['dcf_capm_crosscheck']['value']
    dcf_s = f"DCF ${dcf_v:>7.2f}" if dcf_v is not None else "DCF skipped"
    capm_s = (f"CAPM-xcheck ${capm_v:>7.2f} @ {val_d['dcf_capm_crosscheck']['discount_capm']:.2%}"
              if capm_v is not None else
              f"CAPM-xcheck skipped @ {val_d['dcf_capm_crosscheck']['discount_capm']:.2%}")
    print(f"{t:6s} price ${d['price']:>7.2f} | Conv {conv:>5.1f} Val {val_s:>5.1f} Qual {qual_s:>5.1f} "
          f"Tech {tech_s:>5.1f} Trust {trust_s:>5.1f} | OVERALL {overall:>5.1f} {vdt:6s} | "
          f"FV ${val_d['triangulated_fv']:>7.2f} (upside {val_d['upside_pct']:+.0%}) | "
          f"{dcf_s} | {capm_s}")

json.dump(results, open(os.path.join(BASE, "results.json"), "w"), indent=2)
print("wrote results.json")
