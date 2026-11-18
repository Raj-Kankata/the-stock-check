#!/usr/bin/env python3
"""Snapshot the Alpha Vantage earnings-pull coverage into this repo.

Reads ~/workspace/stock-verdicts-better/recalibration/av-pull/data/coverage.json
(the rollup output, rewritten after each daily pull) and writes the small
counts-only snapshot lib/data/av_coverage.json in this repo, so the nightly
refresh (GitHub Actions — it cannot see the private workspace) can carry
the counts into lib/data/results.json for the homepage tile.

as_of is the coverage.json file's mtime date (UTC): the rollup rewrites
the file at the end of each pull, so mtime is the pull date.

Pushes via ~/workspace/push_via_api.py when the snapshot changed — but
ONLY when the working tree is otherwise clean: that script builds its
tree from `git ls-files`, so any unrelated uncommitted change would be
swept into the commit. On a dirty tree, exit non-zero without pushing
(the AV pull cron reports the error; the next day's run retries).

Usage: python3 scripts/av_coverage_snapshot.py [--no-push]
  --no-push: write the file but do not commit/push (for the initial deploy).
"""
import datetime
import json
import os
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
COVERAGE = Path("/home/hatch/workspace/stock-verdicts-better/recalibration"
                "/av-pull/data/coverage.json")
OUT = REPO / "lib" / "data" / "av_coverage.json"
PUSH = Path("/home/hatch/workspace/push_via_api.py")

FIELDS = ("pulled", "universe", "remaining", "skipped_no_data",
          "total_quarterly_rows", "tickers_covering_all_12_quarters")


def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)


def run(cmd, **kw):
    print(f"$ {' '.join(cmd)}")
    r = subprocess.run(cmd, cwd=REPO, **kw)
    if r.returncode != 0:
        fail(f"command failed ({r.returncode}): {' '.join(cmd)}")
    return r


def main():
    no_push = "--no-push" in sys.argv
    if not COVERAGE.exists():
        fail(f"coverage.json not found: {COVERAGE}")
    raw = json.loads(COVERAGE.read_text())
    snap = {f: raw[f] for f in FIELDS}
    if not all(isinstance(snap[f], int) for f in FIELDS):
        fail(f"non-int coverage field in {COVERAGE}")
    if snap["pulled"] + snap["remaining"] + snap["skipped_no_data"] != snap["universe"]:
        fail("pulled + remaining + skipped != universe in coverage.json")
    if not 0 <= snap["pulled"] <= snap["universe"]:
        fail("pulled out of range in coverage.json")
    mtime = datetime.datetime.fromtimestamp(
        COVERAGE.stat().st_mtime, tz=datetime.timezone.utc).date()
    snap["as_of"] = mtime.isoformat()
    text = json.dumps(snap, indent=2) + "\n"
    if OUT.exists() and OUT.read_text() == text:
        print(f"unchanged: {snap['pulled']}/{snap['universe']} as of {snap['as_of']}")
        return 0
    OUT.write_text(text)
    print(f"wrote {OUT}: {snap['pulled']}/{snap['universe']} as of {snap['as_of']}")
    if no_push:
        return 0

    # Push only from a clean tree (other than this file): push_via_api.py
    # builds its tree from git ls-files, so any other uncommitted change
    # would be swept into the commit. Untracked files are ignored — the
    # push only ever sees tracked files.
    run(["git", "fetch", "origin"])
    status = subprocess.run(["git", "status", "--porcelain"], cwd=REPO,
                            capture_output=True, text=True).stdout
    for line in status.splitlines():
        if line.startswith("??"):
            continue  # untracked: never pushed
        path = line[3:].split(" -> ")[-1]
        if path != "lib/data/av_coverage.json":
            fail(f"working tree dirty ({line.strip()}); refusing to push")
    run(["git", "reset", "--hard", "origin/main"])
    # The reset above restores the committed snapshot; rewrite ours.
    OUT.write_text(text)
    run(["git", "add", "lib/data/av_coverage.json"])
    run(["python3", str(PUSH),
         f"AV earnings coverage: {snap['pulled']} of {snap['universe']} "
         f"tickers (as of {snap['as_of']})"])
    run(["git", "fetch", "origin"])
    run(["git", "reset", "--hard", "origin/main"])
    print("pushed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
