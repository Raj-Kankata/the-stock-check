#!/usr/bin/env python3
"""Weekly ETF fund-facts refresh — The Stock Check (ETF board).

Pulls slow-moving fund facts for the 55-ETF universe from
stockanalysis.com (no key, no account) into lib/data/etf_facts.json:
expense ratio, AUM (the ETF's own net assets), dividend yield,
holdings count, inception date, top-10 holdings by weight.

AUM source (ETF_BOARD.md): stockanalysis.com "Assets" is the ETF's
own net assets. Yahoo's totalAssets is the WHOLE FUND across all
share classes and overstates Vanguard funds (VOO $1.74T whole-fund
vs $1.05T ETF-only; BND $401B vs $165B). The ETF-only figures match
the independent Nov 13/16, 2026 rankings.

GLD holds physical gold bullion: stockanalysis.com has no holdings
page for it (404, expected) — its facts carry top_holdings [] with
note "physical_gold". Any other fetch failure aborts the run with
NOTHING written (fail-closed, same rule as the stock refresh).

Usage: python3 scripts/etf_facts_refresh.py [--as-of YYYY-MM-DD]
Runs weekly (Sundays 06:00 UTC, .github/workflows/etf-facts-weekly.yml).
"""
import datetime
import gzip
import json
import os
import re
import sys
import time
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UNIVERSE = os.path.join(REPO, "lib", "data", "etf_universe.json")
FACTS = os.path.join(REPO, "lib", "data", "etf_facts.json")

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
      "AppleWebKit/537.36 Chrome/120.0 Safari/537.36",
      # REQUIRED: stockanalysis.com (Cloudflare) caches the gzip and
      # identity encodings separately and they refresh at different
      # times — without Accept-Encoding: gzip the page serves a stale
      # AUM snapshot (IEMG $145.53B / SOXX $38.06B vs the fresh
      # $140.73B / $35.50B, verified 2026-11-19). Always request gzip.
      "Accept-Encoding": "gzip"}


def fail(msg):
    print(f"ETF FACTS REFRESH FAILED: {msg}", file=sys.stderr)
    sys.exit(1)


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    raw = urllib.request.urlopen(req, timeout=60).read()
    try:
        raw = gzip.decompress(raw)
    except Exception:
        pass
    return raw.decode("utf-8", "ignore")


def parse_money(s):
    s = s.replace("$", "").replace(",", "").strip()
    mult = 1
    if s.endswith("T"):
        mult, s = 1e12, s[:-1]
    elif s.endswith("B"):
        mult, s = 1e9, s[:-1]
    elif s.endswith("M"):
        mult, s = 1e6, s[:-1]
    elif s.endswith("K"):
        mult, s = 1e3, s[:-1]
    try:
        return round(float(s) * mult, 2)
    except ValueError:
        return None


def main():
    as_of = None
    if "--as-of" in sys.argv:
        as_of = sys.argv[sys.argv.index("--as-of") + 1]
    as_of = as_of or datetime.date.today().isoformat()

    universe = json.load(open(UNIVERSE))["universe"]
    tickers = [u["ticker"] for u in universe]
    print(f"ETF facts refresh: as_of={as_of}; {len(tickers)} tickers")

    facts = {}
    for t in tickers:
        tl = t.lower()
        try:
            h = fetch(f"https://stockanalysis.com/etf/{tl}/")
        except Exception as e:
            fail(f"{t}: overview fetch failed: {e}")
        rows = re.findall(
            r'<td[^>]*>([^<]{1,60})</td>\s*<td[^>]*>([^<]{1,80})</td>', h)
        kv = {k.strip(): re.sub(r"<[^>]+>", "", v).strip()
              for k, v in rows}
        dy = None
        m = re.search(r"\(([\d.]+)%\)", kv.get("Dividend", ""))
        if m:
            dy = round(float(m.group(1)) / 100, 4)
        rec = {
            "expense_ratio": (round(float(kv["Expense Ratio"].rstrip("%")) / 100, 4)
                              if "Expense Ratio" in kv else None),
            "aum_usd": parse_money(kv["Assets"]) if "Assets" in kv else None,
            "dividend_yield": dy,
            "holdings_count": (int(kv["Holdings"].replace(",", ""))
                               if "Holdings" in kv and
                               kv["Holdings"].replace(",", "").isdigit()
                               else None),
            "inception": kv.get("Inception Date"),
            "top_holdings": [],
        }
        if rec["expense_ratio"] is None or rec["aum_usd"] is None:
            fail(f"{t}: overview page missing expense ratio or AUM")
        if t == "GLD":
            # Physical gold bullion — no holdings page exists (404).
            rec["note"] = "physical_gold"
        else:
            try:
                hh = fetch(f"https://stockanalysis.com/etf/{tl}/holdings/")
            except Exception as e:
                fail(f"{t}: holdings fetch failed: {e}")
            trs = re.findall(r"<tr[^>]*>(.*?)</tr>", hh, re.S)
            for tr in trs:
                cells = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
                clean = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
                if len(clean) >= 4 and clean[0].isdigit() \
                        and int(clean[0]) <= 10:
                    try:
                        w = round(float(clean[3].rstrip("%")) / 100, 4)
                    except ValueError:
                        w = None
                    rec["top_holdings"].append({
                        "rank": int(clean[0]), "symbol": clean[1],
                        "name": clean[2], "weight": w})
            if len(rec["top_holdings"]) == 0:
                fail(f"{t}: holdings page parsed to zero rows")
        facts[t] = rec
        print(f"    {t}: exp={rec['expense_ratio']} "
              f"aum={rec['aum_usd']} yld={rec['dividend_yield']} "
              f"n={rec['holdings_count']} top={len(rec['top_holdings'])}")
        time.sleep(0.4)

    new = {"as_of": as_of, "source": "stockanalysis.com", "facts": facts}
    stored = None
    if os.path.exists(FACTS):
        stored = json.load(open(FACTS))
    if stored is not None and stored.get("facts") == facts:
        print("No changes — nothing to write.")
        return
    with open(FACTS, "w") as f:
        json.dump(new, f, indent=1)
        f.write("\n")
    print(f"Wrote {FACTS} (as_of {as_of}).")


if __name__ == "__main__":
    main()
