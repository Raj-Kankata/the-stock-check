#!/usr/bin/env python3
"""Nightly Congress-trading refresh — The Stock Check (/congress board,
the per-card Congress panel, and the member pages).

Source: the Bargo free Congress API (https://www.bargo.ai/free-apis/
congress/v1), which is built from the official STOCK Act filings —
House Clerk financial disclosures + Senate eFD periodic transaction
reports. Free, no key, no account. Bargo's terms require a visible
credit linking back to Bargo wherever the data is displayed; every
surface that renders this file carries one.

What this script does:
  1. Pulls /stats (verbatim — totals + most-traded-90d), the global
     /trades feed (newest 100), and /members (to rank who to pull
     deep), then /members/{slug} for the top 15 members by trade
     count — all inside Bargo's keyless rate budget (see below).
  2. Pulls the congress-legislators current file (unitedstates
     project, public domain) and matches each member to a party:
     exact slug, then a suffix/middle-stripped slug, then last name +
     state + first initial, then a UNIQUE last name + state. A member
     who matches nothing gets party null and displays as "—". A party
     is never guessed.
  3. Merges every pulled trade into the persistent store — this file
     is its own store: lib/data/congress.json is read, merged,
     deduped on member_slug|ticker|transaction_date|type|amount_low|
     amount_high|disclosure_date, and capped at 5,000 trades (oldest
     by disclosure date dropped first). The store therefore grows
     nightly inside Bargo's rolling 3-month window.
  4. Recomputes per-member aggregates and the Party Money Map from
     the store (see RULEBOOK §31).

Rate-limit discipline (Bargo keyless: X-RateLimit-Limit 30 requests,
X-RateLimit-Rows-Limit 100 rows per window; the Remaining counters
ride on every response): the pull reads the Remaining headers after
every response, stops pulling member pages when rows-remaining drops
below 20, and on HTTP 429 stops pulling immediately. A 429 or any
other failure on a core fetch (stats / feed / members index /
legislators) aborts the run with the existing store untouched. A
failure on one member's deep pull skips that member (their feed
trades are still merged); a 429 stops the deep pulls and the run
proceeds with what it has. This step NEVER fails the nightly run
over Bargo: failures print a WARN line and exit 0. The one exit-1
case is a corrupt existing store (unreadable or wrong shape) — that
is a local data problem a human should see, not a Bargo problem.

Honesty rules baked into the data (RULEBOOK §31): STOCK Act amounts
are disclosed RANGES (amount_low/amount_high are the filing's band,
never an exact figure); filings lag trades by up to ~45 days, so
every trade carries both dates and a computed lag; a member's
"portfolio" downstream is a reconstruction from captured filings
only, never a live portfolio.

Usage:
  python3 scripts/congress_refresh.py
"""
import datetime
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STORE = os.path.join(REPO, "lib", "data", "congress.json")

BARGO = "https://www.bargo.ai/free-apis/congress/v1"
LEGISLATORS_URL = ("https://unitedstates.github.io/congress-legislators/"
                   "legislators-current.json")
UA = {"User-Agent": "Mozilla/5.0 (compatible; TheStockCheck/1.0)"}

CAPTURE_START = "2026-11-20"   # first capture date; shown on the site
STORE_CAP = 5000               # trades kept in the store
ROWS_FLOOR = 20                # stop deep pulls below this rows-remaining
TOP_MEMBERS = 15               # deep pulls per run
FEED_LIMIT = 100               # global feed page size
PARTY_WINDOW_DAYS = 90         # Party Money Map window (by disclosure)

TRADE_KEYS = ("member", "member_slug", "chamber", "state", "ticker",
              "asset", "type", "amount_low", "amount_high",
              "amount_range", "transaction_date", "disclosure_date",
              "est_price", "recent_price", "recent_price_date",
              "perf_pct", "filing_portal")
# The identity/display keys a row must carry to enter the store; the
# price fields may legitimately be null on some rows.
TRADE_REQUIRED = ("member", "member_slug", "chamber", "state",
                  "ticker", "type", "amount_low", "amount_high",
                  "transaction_date", "disclosure_date")


class FetchFail(Exception):
    pass


class RateLimited(Exception):
    pass


class Budget:
    """Bargo rate budget, read off the X-RateLimit-*-Remaining
    response headers after every call."""

    def __init__(self):
        self.requests_remaining = None
        self.rows_remaining = None

    def update(self, headers):
        try:
            r = headers.get("X-RateLimit-Remaining")
            if r is not None:
                self.requests_remaining = int(r)
            w = headers.get("X-RateLimit-Rows-Remaining")
            if w is not None:
                self.rows_remaining = int(w)
        except (TypeError, ValueError):
            pass

    def __str__(self):
        return (f"requests_remaining={self.requests_remaining}, "
                f"rows_remaining={self.rows_remaining}")


def fetch_json(url, budget=None):
    """GET a JSON document. Returns the parsed body. Raises
    RateLimited on HTTP 429, FetchFail on anything else."""
    req = urllib.request.Request(url, headers=UA)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            if budget is not None:
                budget.update(r.headers)
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise RateLimited(f"HTTP 429 from {url}")
        raise FetchFail(f"HTTP {e.code} from {url}")
    except Exception as e:
        raise FetchFail(f"fetch failed for {url}: {e}")


def warn(msg):
    print(f"CONGRESS REFRESH WARNING: {msg}", file=sys.stderr)


# ------------------------------------------------------------------
# Party matching (congress-legislators, last term wins)
# ------------------------------------------------------------------

_SUFFIXES = {"jr", "sr", "ii", "iii", "iv"}


def _norm(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")


def _slugify(first, last):
    return _norm(f"{first}-{last}")


class PartyIndex:
    """Members of the current Congress with their party, indexed for
    the tiered match described in the module docstring."""

    def __init__(self, legislators):
        self.people = []
        for p in legislators:
            name = p.get("name") or {}
            terms = p.get("terms") or []
            if not terms or not name.get("last"):
                continue
            t = terms[-1]
            self.people.append({
                "first": name.get("first") or "",
                "last": name.get("last") or "",
                "official": name.get("official_full") or "",
                "party": t.get("party"),
                "type": t.get("type"),
                "state": t.get("state"),
            })
        self.by_slug = {}
        for p in self.people:
            self.by_slug.setdefault(_slugify(p["first"], p["last"]), p)
            toks = _norm(p["official"]).split("-")
            if len(toks) >= 2:
                self.by_slug.setdefault(_slugify(toks[0], toks[-1]), p)

    def match(self, slug, name, state_raw):
        """-> (party or None, tier). Tiers: 1 exact slug; 2 slug with
        suffix/middle tokens stripped; 3 last + state + first
        initial; 4 last + state when unique. No tier = no match."""
        if slug in self.by_slug:
            return self.by_slug[slug]["party"], 1
        toks = [t for t in slug.split("-") if t and t not in _SUFFIXES]
        if len(toks) >= 2:
            cand = _slugify(toks[0], toks[-1])
            if cand in self.by_slug:
                return self.by_slug[cand]["party"], 2
        if not toks:
            return None, 0
        last = toks[-1]
        state2 = (state_raw or "")[:2].upper()
        initial = (name or slug)[:1].lower()
        cands = [p for p in self.people
                 if _norm(p["last"]) == last and p["state"] == state2
                 and p["first"][:1].lower() == initial]
        if len(cands) == 1:
            return cands[0]["party"], 3
        cands = [p for p in self.people
                 if _norm(p["last"]) == last and p["state"] == state2]
        if len(cands) == 1:
            return cands[0]["party"], 4
        return None, 0


# ------------------------------------------------------------------
# Store shaping
# ------------------------------------------------------------------

def dedupe_key(t):
    return "|".join(str(t.get(k)) for k in
                    ("member_slug", "ticker", "transaction_date",
                     "type", "amount_low", "amount_high",
                     "disclosure_date"))


def lag_days(t):
    try:
        tx = datetime.date.fromisoformat(t["transaction_date"])
        dx = datetime.date.fromisoformat(t["disclosure_date"])
        return (dx - tx).days
    except Exception:
        return None


def clean_trade(raw):
    """Project a Bargo row onto the stored shape (display fields
    only). Assumes the required keys were validated upstream."""
    out = {k: raw.get(k) for k in TRADE_KEYS}
    return out


def member_aggregates(trades):
    """Per-member aggregates computed FROM THE STORE: counts, last
    trade, mean filing lag, late filings (lag > 45 days)."""
    by_member = {}
    for t in trades:
        by_member.setdefault(t["member_slug"], []).append(t)
    members = []
    for slug, rows in by_member.items():
        rows_sorted = sorted(rows, key=lambda r: r["disclosure_date"],
                             reverse=True)
        head = rows_sorted[0]
        lags = [lag_days(r) for r in rows]
        lags = [x for x in lags if x is not None]
        parties = [r.get("party") for r in rows if r.get("party")]
        members.append({
            "slug": slug,
            "name": head["member"],
            "chamber": head["chamber"],
            "state": head["state"],
            "party": parties[0] if parties else None,
            "trades": len(rows),
            "buys": sum(1 for r in rows if r["type"] == "purchase"),
            "sells": sum(1 for r in rows if r["type"] == "sale"),
            "last_trade": max(r["transaction_date"] for r in rows),
            "last_disclosure": max(r["disclosure_date"] for r in rows),
            "avg_lag_days": (round(sum(lags) / len(lags), 1)
                             if lags else None),
            "late_filings": sum(1 for x in lags if x > 45),
        })
    members.sort(key=lambda m: (-m["trades"], m["name"]))
    return members


def party_money_map(trades, as_of):
    """Tickers by net-buying party group, from store trades disclosed
    in the 90 days up to as_of. A ticker is 'Democratic' when only
    Democrats net-bought it (buys > sells) and Republicans did not,
    'Republican' mirrored, 'Bipartisan' when both parties net-bought.
    Needs >= 2 counted trades. Party-null and non-D/R trades are not
    counted."""
    try:
        end = datetime.date.fromisoformat(as_of)
    except Exception:
        return []
    start = (end - datetime.timedelta(days=PARTY_WINDOW_DAYS)).isoformat()
    per = {}
    for t in trades:
        if not (start <= t["disclosure_date"] <= as_of):
            continue
        party = t.get("party")
        if party not in ("Democrat", "Republican"):
            continue
        side = "dem" if party == "Democrat" else "rep"
        if t["type"] == "purchase":
            key = f"{side}_buys"
        elif t["type"] == "sale":
            key = f"{side}_sells"
        else:
            continue
        row = per.setdefault(t["ticker"], {
            "ticker": t["ticker"], "dem_buys": 0, "dem_sells": 0,
            "rep_buys": 0, "rep_sells": 0})
        row[key] += 1
    out = []
    for row in per.values():
        total = (row["dem_buys"] + row["dem_sells"]
                 + row["rep_buys"] + row["rep_sells"])
        if total < 2:
            continue
        dem_net = row["dem_buys"] > row["dem_sells"]
        rep_net = row["rep_buys"] > row["rep_sells"]
        if dem_net and rep_net:
            group = "Bipartisan"
        elif dem_net:
            group = "Democratic"
        elif rep_net:
            group = "Republican"
        else:
            continue
        row = dict(row)
        row["group"] = group
        row["total"] = total
        out.append(row)
    out.sort(key=lambda r: (-r["total"], r["ticker"]))
    return out


def validate_trades(rows, where):
    for r in rows:
        if not isinstance(r, dict) or any(
                r.get(k) is None for k in TRADE_REQUIRED):
            raise FetchFail(f"{where}: a trade row is missing a "
                            f"required key (schema surprise)")


# ------------------------------------------------------------------

def main():
    # Load the existing store. A missing file is a fresh seed; a
    # corrupt one is exit 1 (a local problem, not a Bargo problem).
    existing = None
    if os.path.exists(STORE):
        try:
            with open(STORE) as f:
                existing = json.load(f)
            if not isinstance(existing, dict) \
                    or not isinstance(existing.get("trades"), list):
                raise ValueError("store is not the expected shape")
        except Exception as e:
            print(f"CONGRESS REFRESH FAILED: existing store is "
                  f"corrupt: {e}", file=sys.stderr)
            return 1

    budget = Budget()
    try:
        stats = fetch_json(f"{BARGO}/stats", budget)
        if not isinstance(stats, dict) \
                or not isinstance(stats.get("totals"), dict) \
                or not isinstance(stats.get("most_traded_90d"), list) \
                or not stats.get("latest_disclosure"):
            raise FetchFail("/stats: unexpected shape (schema "
                            "surprise)")
        print(f"  /stats: {stats['totals']} (budget: {budget})")

        feed = fetch_json(f"{BARGO}/trades?limit={FEED_LIMIT}", budget)
        if not isinstance(feed, dict) \
                or not isinstance(feed.get("trades"), list):
            raise FetchFail("/trades: unexpected shape (schema "
                            "surprise)")
        validate_trades(feed["trades"], "/trades")
        print(f"  /trades: {len(feed['trades'])} rows "
              f"(budget: {budget})")

        members_idx = fetch_json(f"{BARGO}/members", budget)
        if not isinstance(members_idx, dict) \
                or not isinstance(members_idx.get("members"), list):
            raise FetchFail("/members: unexpected shape (schema "
                            "surprise)")
        print(f"  /members: {len(members_idx['members'])} members "
              f"(budget: {budget})")

        legislators = fetch_json(LEGISLATORS_URL)
        if not isinstance(legislators, list) or not legislators:
            raise FetchFail("legislators-current.json: unexpected "
                            "shape")
        print(f"  legislators: {len(legislators)} current members")
    except RateLimited as e:
        warn(f"{e} — keeping the existing store untouched.")
        return 0
    except FetchFail as e:
        warn(f"{e} — keeping the existing store untouched.")
        return 0

    # Deep pulls: the top members by Bargo's own trade counts, inside
    # whatever budget is left. A 429 stops the pulls; a plain failure
    # skips that one member. Either way the run proceeds with what it
    # has — the feed trades are already in hand.
    deep_rows = []
    ranked = sorted(members_idx["members"],
                    key=lambda m: -(m.get("trades") or 0))
    pulled = 0
    for m in ranked[:TOP_MEMBERS]:
        slug = m.get("member_slug")
        if not slug:
            continue
        if budget.rows_remaining is not None \
                and budget.rows_remaining < ROWS_FLOOR:
            print(f"  deep pulls stopped: rows-remaining "
                  f"{budget.rows_remaining} < {ROWS_FLOOR}")
            break
        if budget.requests_remaining is not None \
                and budget.requests_remaining <= 1:
            print("  deep pulls stopped: request budget exhausted")
            break
        try:
            page = fetch_json(f"{BARGO}/members/{slug}", budget)
            if not isinstance(page, dict) \
                    or not isinstance(page.get("trades"), list):
                print(f"  /members/{slug}: unexpected shape — skipped")
                continue
            validate_trades(page["trades"], f"/members/{slug}")
            deep_rows.extend(page["trades"])
            pulled += 1
            print(f"  /members/{slug}: {len(page['trades'])} rows "
                  f"(budget: {budget})")
        except RateLimited:
            print("  deep pulls stopped: HTTP 429")
            break
        except FetchFail as e:
            print(f"  /members/{slug}: {e} — skipped")
            continue
        time.sleep(0.3)

    # Merge into the store and dedupe.
    store = {}
    for t in (existing or {}).get("trades", []):
        store[dedupe_key(t)] = t
    before = len(store)
    for raw in feed["trades"] + deep_rows:
        t = clean_trade(raw)
        store[dedupe_key(t)] = t
    merged = list(store.values())
    print(f"  merge: {before} stored + "
          f"{len(feed['trades']) + len(deep_rows)} pulled -> "
          f"{len(merged)} unique")

    # Party enrichment for every stored trade (recomputed each run so
    # a matcher improvement repairs old rows).
    parties = PartyIndex(legislators)
    tier_counts = {}
    for t in merged:
        party, tier = parties.match(t["member_slug"], t["member"],
                                    t["state"])
        t["party"] = party
        t["lag_days"] = lag_days(t)
        tier_counts[tier] = tier_counts.get(tier, 0) + 1

    # Newest first: disclosure date, then transaction date.
    merged.sort(key=lambda t: (t["disclosure_date"],
                               t["transaction_date"]), reverse=True)
    if len(merged) > STORE_CAP:
        print(f"  store cap: dropping {len(merged) - STORE_CAP} "
              f"oldest trades (cap {STORE_CAP})")
        merged = merged[:STORE_CAP]

    as_of = max(t["disclosure_date"] for t in merged)
    members = member_aggregates(merged)
    matched = sum(1 for m in members if m["party"])
    tickers = sorted({t["ticker"] for t in merged})
    pmap = party_money_map(merged, as_of)

    out = {
        "as_of": as_of,
        "updated_at": datetime.datetime.now(
            datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "capture_start": CAPTURE_START,
        "source": "Bargo — built from official House & Senate filings",
        "source_url": "https://www.bargo.ai/free-apis/congress",
        "stats": stats,
        "trades": merged,
        "members": members,
        "party_map": pmap,
    }

    if existing is not None:
        old = dict(existing)
        new = dict(out)
        old.pop("updated_at", None)
        new.pop("updated_at", None)
        if old == new:
            print("No changes — nothing to write.")
            return 0

    with open(STORE, "w") as f:
        json.dump(out, f, indent=1)
        f.write("\n")
    print(f"Wrote {STORE}: {len(merged)} trades, {len(members)} "
          f"members ({matched} with party matched; tiers "
          f"{tier_counts}), {len(tickers)} tickers covered, "
          f"{len(pmap)} party-map tickers, as of {as_of}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
