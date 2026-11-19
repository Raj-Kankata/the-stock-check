#!/usr/bin/env python3
"""Derive the site engine copies from the frozen workspace v1.7 engine.
Run: python3 scripts/adapt_engine_v17_site.py

The workspace engine (scoring-engine-v1.7/engine.py) is frozen and is
never edited. The site copies (scripts/engine/v13/engine.py and
scripts/engine/batch2/engine.py) are the SITE-ADAPTED variant of it —
the same adaptation the v1.6 site copies carried (verified by diffing
the committed v1.6 site copies against the workspace v1.6 engine):
the Run section drops the stock_verdicts / vs_stock_verdicts record
keys and the SV print tail, because the site base carries no
stock_verdicts input. Without the adaptation the staged engine crashes
on the first ticker: the record emission tolerates a missing
stock_verdicts (vs_stock_verdicts is then None) but the per-ticker
print subscripts sv unconditionally (engine.py line ~853).

The adaptation is exactly three changes, each asserted to apply once:
  1. Run section: remove the sv / sv_ladder lines and the
     "stock_verdicts" / "vs_stock_verdicts" record keys.
  2. Run section print: drop the " | SV: ... / Fair $..." tail.
  3. Docstring: a SITE COPY note after the "tolerates" paragraph.
Scores, legs, FV, verdicts, pillar details and the locked set are
identical to the workspace engine. Both site copies are byte-identical
(the v1.6 copies differed only in their docstring headers; the v1.7
engine is one file used for both roles, TICKERS/COMPLETENESS patched
at stage time by _stage_engine).
"""
import hashlib
import os

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WS_ENGINE = "/home/hatch/workspace/stock-verdicts-better/scoring-engine-v1.7/engine.py"
COPIES = [os.path.join(SITE, "scripts", "engine", "v13", "engine.py"),
          os.path.join(SITE, "scripts", "engine", "batch2", "engine.py")]

OLD_SV_BLOCK = '''    sv = d.get("stock_verdicts")  # v1.4: refresh fragments carry none — tolerated
    sv_ladder = sv["ladder"] if sv else None
    our_ladder = val_d["ladder"]
    results["tickers"][t] = {
        "name": d["name"], "sector": d["sector"], "price": d["price"],
        "pillars": pillars, "overall_score": overall, "verdict": vdt, "verdict_reason": v_reason,
        "triangulated_fv": val_d["triangulated_fv"], "ladder": our_ladder,
        "pros": pros, "cons": cons,
        "stock_verdicts": sv,
        "vs_stock_verdicts": {
            "verdict_agree": (vdt == sv["verdict"]) if sv else None,  # strict: Watch is NOT agreement with Growth (fixed 2026-11-15; was True for NVO Watch vs Growth)
            "our_fv_vs_their_fair": round(val_d["triangulated_fv"] - sv_ladder[2], 2) if (val_d["triangulated_fv"] and sv_ladder) else None,
            "ladder_diff": {k: round(our_ladder[k] - sv_ladder[i], 2) for i, k in enumerate(["heavy", "buy", "fair", "exit"])} if (our_ladder and sv_ladder) else None,
        },
        "flags": d.get("flags", []),
    }
'''
NEW_SV_BLOCK = '''    our_ladder = val_d["ladder"]
    results["tickers"][t] = {
        "name": d["name"], "sector": d["sector"], "price": d["price"],
        "pillars": pillars, "overall_score": overall, "verdict": vdt, "verdict_reason": v_reason,
        "triangulated_fv": val_d["triangulated_fv"], "ladder": our_ladder,
        "pros": pros, "cons": cons,
        "flags": d.get("flags", []),
    }
'''

OLD_PRINT_TAIL = '''          f"{dcf_s} | {capm_s} | SV: {sv['verdict']} / Fair ${sv_ladder[2]:,.2f}")'''
NEW_PRINT_TAIL = '''          f"{dcf_s} | {capm_s}")'''

OLD_DOC = ("  The run section tolerates inputs without a stock_verdicts block\n"
           "  (refresh fragments carry none); vs_stock_verdicts is then None.\n")
NEW_DOC = (OLD_DOC +
           "  SITE COPY: the Run section drops the stock_verdicts /\n"
           "  vs_stock_verdicts record keys and the SV print tail (the site\n"
           "  base carries no stock_verdicts input — the same adaptation\n"
           "  the v1.6 site copies carried). Scores, legs, FV, verdicts\n"
           "  and pillar details are identical to the workspace engine.\n")


def adapt(src):
    assert src.count(OLD_SV_BLOCK) == 1, "sv block not found exactly once"
    out = src.replace(OLD_SV_BLOCK, NEW_SV_BLOCK)
    assert out.count(OLD_PRINT_TAIL) == 1, "print tail not found exactly once"
    out = out.replace(OLD_PRINT_TAIL, NEW_PRINT_TAIL)
    assert out.count(OLD_DOC) == 1, "doc paragraph not found exactly once"
    out = out.replace(OLD_DOC, NEW_DOC)
    # No CODE reference to stock_verdicts may survive (the docstring
    # legitimately documents the adaptation).
    for pat in ('d.get("stock_verdicts")', "sv_ladder", "sv['verdict']",
                'sv["verdict"]', '"stock_verdicts": sv'):
        assert pat not in out, f"code reference survives: {pat}"
    return out


def main():
    with open(WS_ENGINE, encoding="utf-8") as f:
        src = f.read()
    adapted = adapt(src)
    # The only differences from the workspace engine are the 3 changes.
    import difflib
    diff = [l for l in difflib.unified_diff(
        src.splitlines(), adapted.splitlines(), lineterm="")]
    removed = [l for l in diff if l.startswith("-") and not l.startswith("---")]
    added = [l for l in diff if l.startswith("+") and not l.startswith("+++")]
    print(f"diff vs workspace engine: {len(removed)} removed / "
          f"{len(added)} added lines (Run section + doc note only)")
    for p in COPIES:
        with open(p, "w", encoding="utf-8") as f:
            f.write(adapted)
        print(f"wrote {p} "
              f"(md5 {hashlib.md5(open(p, 'rb').read()).hexdigest()})")
    assert (hashlib.md5(open(COPIES[0], 'rb').read()).hexdigest()
            == hashlib.md5(open(COPIES[1], 'rb').read()).hexdigest())
    print("site engine copies are byte-identical to each other")
    print("adapted engine: v1.7 site variant (Run section without "
          "stock_verdicts); scoring code untouched")


if __name__ == "__main__":
    main()
