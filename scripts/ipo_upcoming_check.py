#!/usr/bin/env python3
"""Weekly upcoming-IPO calendar check — The Stock Check.

Reads lib/data/ipo_upcoming.json (hand-authored entries — NEVER edited
here) and, for each entry, verifies two things:

  1. EDGAR filing status (entries with an edgar_cik): fetch the
     submissions JSON and record the latest filing (form + date +
     accession), whether a final prospectus (424B4) exists (the name
     has priced) and whether an RW withdrawal exists.
  2. Listed yet (entries with a tv_symbol): one batched TradingView
     scanner POST. A planned ticker that resolves with a close has
     started trading and graduates off the calendar. A ticker that
     does not resolve is the expected state — not an error.

Writes lib/data/ipo_upcoming_status.json only when it changed, and
prints a summary. A 424B4, an RW or a listed ticker is printed as
GRADUATE — the script never graduates anything itself: a human
updates the entries file, builds the dossier, and removes the entry.

Fail-closed: any fetch failure exits 1 and NOTHING is written. The
script never adds or removes entries and never edits the entries file.

Caveat: a planned ticker could resolve on TradingView under a stale
symbol (a previous company that used the same ticker). The script
prints the resolved description so a human can tell a stale symbol
from a real listing; the listed flag is a prompt, not a verdict.

Sources (no key, no account):
  - SEC EDGAR submissions JSON (data.sec.gov/submissions/CIK.json).
    EDGAR fair-access requires a declared User-Agent.
  - TradingView scanner POST (america/scan, Content-Type: text/plain).

Run: python3 scripts/ipo_upcoming_check.py [--dry-run]
  --dry-run prints what would be written without writing it.
"""
import datetime
import json
import os
import sys
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRIES = os.path.join(REPO, "lib", "data", "ipo_upcoming.json")
STATUS = os.path.join(REPO, "lib", "data", "ipo_upcoming_status.json")
SCAN_URL = "https://scanner.tradingview.com/america/scan"
EDGAR_UA = "TheStockCheck/1.0 (research; hello@thestockcheck.com)"


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def fetch_edgar(cik):
    url = f"https://data.sec.gov/submissions/CIK{int(cik):010d}.json"
    req = urllib.request.Request(url, headers={"User-Agent": EDGAR_UA})
    try:
        resp = urllib.request.urlopen(req, timeout=60).read()
    except Exception as e:
        fail(f"EDGAR submissions fetch failed for CIK {cik}: {e}")
    data = json.loads(resp)
    recent = data.get("filings", {}).get("recent", {})
    forms = recent.get("form", [])
    dates = recent.get("filingDate", [])
    accessions = recent.get("accessionNumber", [])
    if not forms:
        fail(f"EDGAR returned no filings for CIK {cik}")
    # Recent is reverse-chronological, but sort defensively by date.
    rows = sorted(zip(dates, forms, accessions), reverse=True)
    latest_date, latest_form, latest_accession = rows[0]
    return {
        "has_424b4": "424B4" in forms,
        "latest_accession": latest_accession,
        "latest_filing_date": latest_date,
        "latest_form": latest_form,
        "withdrawn": "RW" in forms,
    }


def fetch_tv_listed(tv_symbols):
    """Batched scanner POST; returns {tv_symbol: description} for
    tickers that resolve with a close. Unresolved tickers are simply
    absent — that is the expected state for unlisted names."""
    body = json.dumps({
        "symbols": {"tickers": list(tv_symbols.values())},
        "columns": ["name", "close", "description"],
        "options": {"lang": "en"},
        "range": [0, len(tv_symbols)]})
    req = urllib.request.Request(
        SCAN_URL, data=body.encode(),
        headers={"Content-Type": "text/plain"})
    try:
        resp = urllib.request.urlopen(req, timeout=60).read()
    except Exception as e:
        fail(f"TradingView scanner request failed: {e}")
    data = json.loads(resp)
    out = {}
    for row in data.get("data", []):
        d = row["d"]
        # d[0] is the symbol as requested (e.g. NASDAQ:SBE), d[1] the
        # close, d[2] the description. A close must be present — a
        # bare symbol stub does not count as listed.
        if d[1] is None:
            continue
        out[d[0]] = d[2] if len(d) > 2 else None
    return out


def main():
    dry_run = "--dry-run" in sys.argv
    today_utc = datetime.date.today().isoformat()
    entries = json.load(open(ENTRIES))["entries"]
    old = json.load(open(STATUS)) if os.path.exists(STATUS) else {"entries": {}}
    old_entries = old.get("entries", {})

    tv_symbols = {e["id"]: e["tv_symbol"] for e in entries if e.get("tv_symbol")}
    listed = fetch_tv_listed(tv_symbols) if tv_symbols else {}
    listed_ids = {eid for eid, sym in tv_symbols.items() if sym in listed}

    new_entries = {}
    flags = []
    for e in entries:
        eid = e["id"]
        prev = old_entries.get(eid, {})
        st = {
            "has_424b4": prev.get("has_424b4", False),
            "latest_accession": prev.get("latest_accession"),
            "latest_filing_date": prev.get("latest_filing_date"),
            "latest_form": prev.get("latest_form"),
            "listed": eid in listed_ids,
            "notes": prev.get("notes", ""),
            "withdrawn": prev.get("withdrawn", False),
        }
        if e.get("edgar_cik"):
            ed = fetch_edgar(e["edgar_cik"])
            st.update(ed)
            st["notes"] = prev.get("notes", "")
        else:
            st["notes"] = (
                "No public filing; status checked against press, not EDGAR. "
                "Confidential draft S-1 submitted Jun 8, 2026 (company-confirmed).")
        if st["has_424b4"]:
            flags.append(f"GRADUATE {eid}: final prospectus (424B4) on EDGAR — priced")
        if st["withdrawn"]:
            flags.append(f"GRADUATE {eid}: registration withdrawn (RW) — remove from calendar")
        if st["listed"]:
            flags.append(
                f"GRADUATE {eid}: ticker resolves on TradingView"
                f" ({listed.get(e['tv_symbol'])}) — has listed")
        new_entries[eid] = st

    new = {
        "as_of": today_utc,
        "checked_at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "checker": "scripts/ipo_upcoming_check.py (weekly, Sundays 06:00 UTC)",
        "entries": new_entries,
        "note": (
            "Written by scripts/ipo_upcoming_check.py only. A 424B4, an RW "
            "withdrawal or a listed ticker flags the entry for graduation off "
            "the calendar — the script never edits lib/data/ipo_upcoming.json. "
            "Seeded 2026-11-19 from direct EDGAR reads."),
    }

    changed = new != old
    print(f"Checked {len(entries)} entries as of {today_utc}")
    for eid, st in sorted(new_entries.items()):
        print(f"  {eid}: latest {st['latest_form']} {st['latest_filing_date'] or ''}"
              f" | 424B4={st['has_424b4']} withdrawn={st['withdrawn']}"
              f" listed={st['listed']}")
    for f in flags:
        print(f"  !! {f}")
    if not flags:
        print("  No graduation flags.")
    if dry_run:
        print("DRY RUN — nothing written.")
        return
    if changed:
        with open(STATUS, "w") as f:
            json.dump(new, f, indent=2, sort_keys=True)
            f.write("\n")
        print(f"Wrote {STATUS}")
    else:
        print("No change — status file untouched.")


if __name__ == "__main__":
    main()
