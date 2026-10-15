#!/usr/bin/env bash
# Reset the LOCAL D1 database to an empty, freshly migrated state.
#
# Local D1 persists and accumulates rows across runs, so every check started
# from whatever the previous run happened to leave behind. That is not
# theoretical: a test that identified a user by scraping "the first profile
# link" off /people picked up an account from an earlier session, and looked
# like a product bug. Starting each run from the same place removes the whole
# class of problem.
#
# DESTRUCTIVE. Refuses any non-loopback host, so it cannot be pointed at a
# deployed database by a typo or a copied command.
#
# Usage: scripts/reset-local-db.sh [base-url]
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${1:-http://127.0.0.1:8787}"

case "$BASE" in
  http://localhost:* | http://127.0.0.1:*) ;;
  *)
    echo "refusing to reset a non-local database: $BASE" >&2
    exit 1
    ;;
esac

API="$BASE/cdn-cgi/local/explorer/api"

UUID=$(curl -sf -m 15 "$API/d1/database" \
  | python3 -c "import json,sys; rows=json.load(sys.stdin)['result']; print(rows[0]['uuid'] if rows else '')")

if [[ -z "$UUID" ]]; then
  echo "no local D1 database found at $API/d1/database" >&2
  exit 1
fi

python3 - "$API" "$UUID" <<'PY'
import json, sys, urllib.error, urllib.request

api, uuid = sys.argv[1], sys.argv[2]


def raw(batch):
    body = json.dumps({"batch": batch}).encode()
    req = urllib.request.Request(
        f"{api}/d1/database/{uuid}/raw",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as err:
        try:
            return json.loads(err.read().decode(errors="replace"))
        except json.JSONDecodeError:
            return {"success": False, "errors": [f"HTTP {err.code}"]}


listed = raw([{"sql": "SELECT name FROM sqlite_master WHERE type='table'"}])
if not listed.get("success"):
    print(f"could not list tables: {json.dumps(listed.get('errors'))[:300]}", file=sys.stderr)
    sys.exit(1)

rows = listed["result"][0]["results"]["rows"]
# Keep D1's own bookkeeping tables; drop everything the app owns.
names = [
    r[0]
    for r in rows
    if not r[0].startswith(("sqlite_", "_cf_", "d1_"))
]

if not names:
    print("no application tables to drop")
    sys.exit(0)

# One batch, so the pragma and the drops share a connection: with foreign keys
# enabled, dropping a parent before its children can fail.
statements = [{"sql": "PRAGMA foreign_keys=OFF"}]
statements += [{"sql": f'DROP TABLE IF EXISTS "{n}"'} for n in names]

dropped = raw(statements)
if not dropped.get("success"):
    print(f"drop failed: {json.dumps(dropped.get('errors'))[:400]}", file=sys.stderr)
    sys.exit(1)

print(f"dropped {len(names)} table(s)")
PY

# The migrations recreate everything the app expects.
bash scripts/init-local-db.sh "$BASE"
