#!/usr/bin/env python3
"""Rebuild lib/data/exchanges.json for the published ticker set from the
free NASDAQ Trader symdir files (nasdaqlisted.txt + otherlisted.txt).

Usage: python3 scripts/build_exchanges.py [--nasdaq FILE] [--other FILE]
Defaults fetch nothing — pass the two symdir files (downloaded from
https://www.nasdaqtrader.com/dynamic/symdir/). The exchange-prefix
mapping is DERIVED from the existing exchanges.json (each carried
ticker's symdir row -> its stored prefix), so a regeneration can never
silently change a carried ticker's exchange; the script asserts the
carried 226 mappings are byte-identical to the old file. Two
hand-corrections are kept (see the code): CBOE -> "CBOE:CBOE" and
BRK-B -> "NYSE:BRK.B". Unpublished names (e.g. BYND) are dropped.
A name missing from both symdir files is a hard failure — never guess
an exchange, never silently drop a name.
"""
import argparse
import json
import os
import sys

SITE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXCHANGES = os.path.join(SITE, "lib", "data", "exchanges.json")
RESULTS = os.path.join(SITE, "lib", "data", "results.json")

HAND_CORRECTIONS = {"CBOE": "CBOE:CBOE", "BRK-B": "NYSE:BRK.B"}


def parse_nasdaq(path):
    out = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        header = f.readline().rstrip("\n").split("|")
        sym_i = header.index("Symbol")
        for line in f:
            parts = line.rstrip("\n").split("|")
            if len(parts) <= sym_i or not parts[sym_i]:
                continue
            if parts[sym_i].startswith("File Creation Time"):
                continue
            out[parts[sym_i]] = "NASDAQ"
    return out


def parse_other(path):
    out = {}
    with open(path, encoding="utf-8", errors="replace") as f:
        header = f.readline().rstrip("\n").split("|")
        sym_i = header.index("ACT Symbol")
        ex_i = header.index("Exchange")
        for line in f:
            parts = line.rstrip("\n").split("|")
            if len(parts) <= max(sym_i, ex_i) or not parts[sym_i]:
                continue
            if parts[sym_i].startswith("File Creation Time"):
                continue
            out[parts[sym_i]] = parts[ex_i]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nasdaq", default="/tmp/nasdaqlisted.txt")
    ap.add_argument("--other", default="/tmp/otherlisted.txt")
    args = ap.parse_args()

    old = json.load(open(EXCHANGES))
    tickers = sorted(json.load(open(RESULTS))["tickers"])
    assert len(tickers) == len(set(tickers))

    nasdaq = parse_nasdaq(args.nasdaq)
    other = parse_other(args.other)

    def symdir_lookup(t):
        # BRK-B is listed as BRK/B in otherlisted.txt.
        if t == "BRK-B":
            return other.get("BRK/B")
        if t in nasdaq:
            return ("NASDAQ", nasdaq[t])
        if t in other:
            return ("OTHER", other[t])
        return None

    # Derive the prefix mapping from the carried tickers: each carried
    # ticker's symdir row -> its stored TradingView prefix.
    mapping = {}
    for t, tv in old.items():
        if t not in tickers:
            continue  # dropped name (e.g. BYND): no mapping needed
        if t in HAND_CORRECTIONS:
            assert tv == HAND_CORRECTIONS[t], f"{t}: stored {tv}"
            continue
        row = symdir_lookup(t)
        assert row is not None, f"{t}: not in either symdir file"
        prefix = tv.split(":")[0]
        key = row
        if key in mapping and mapping[key] != prefix:
            print(f"WARNING: {key} maps to both {mapping[key]} and "
                  f"{prefix} (ticker {t})", file=sys.stderr)
        mapping[key] = prefix
    print("derived prefix mapping (symdir -> TradingView):")
    for k in sorted(mapping, key=str):
        print(f"  {k!r} -> {mapping[k]}")

    new = {}
    missing = []
    for t in tickers:
        if t in HAND_CORRECTIONS:
            new[t] = HAND_CORRECTIONS[t]
            continue
        row = symdir_lookup(t)
        if row is None:
            missing.append(t)
            continue
        prefix = mapping.get(row)
        assert prefix is not None, f"{t}: no prefix mapping for {row}"
        # TradingView uses a dot for share-class separators (BRK.B).
        tv_sym = t.replace("-", ".") if t in ("BRK-B",) else t
        new[t] = f"{prefix}:{tv_sym}"
    assert not missing, f"missing from both symdir files: {missing}"

    # Carried mappings must be byte-identical to the old file.
    for t in tickers:
        if t in old:
            assert new[t] == old[t], f"{t}: {old[t]} -> {new[t]}"
    dropped = sorted(set(old) - set(new))
    added = sorted(set(new) - set(old))
    print(f"carried: {len(tickers) - len(added)} unchanged; "
          f"added: {len(added)}; dropped: {dropped}")

    bak = EXCHANGES + ".pre-v17-bak"
    if not os.path.exists(bak):
        with open(bak, "w") as f:
            json.dump(old, f, indent=2)
        print(f"backed up the old map to {bak}")
    with open(EXCHANGES, "w") as f:
        json.dump(new, f, indent=2, sort_keys=True)
        f.write("\n")
    print(f"wrote {EXCHANGES}: {len(new)} entries")


if __name__ == "__main__":
    main()
