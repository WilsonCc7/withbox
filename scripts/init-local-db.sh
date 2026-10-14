#!/usr/bin/env bash
# Apply the Drizzle migrations to the local development D1 database.
#
# Local D1 does not persist across server restarts (see `.omp/AGENTS.md`), so
# this runs before any local check that touches the database. It goes through
# the Cloudflare Vite plugin's Local Explorer API, which executes SQL against
# the same database the Worker sees.
#
# Usage: scripts/init-local-db.sh [base-url]
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${1:-http://127.0.0.1:8787}"
API="$BASE/cdn-cgi/local/explorer/api"

UUID=$(curl -sf -m 15 "$API/d1/database" \
  | python3 -c "import json,sys; rows=json.load(sys.stdin)['result']; print(rows[0]['uuid'] if rows else '')")

if [[ -z "$UUID" ]]; then
  echo "no local D1 database found at $API/d1/database" >&2
  exit 1
fi

python3 - "$API" "$UUID" <<'PY'
import glob, json, sys, urllib.error, urllib.request

api, uuid = sys.argv[1], sys.argv[2]
stmts = []
for path in sorted(glob.glob("drizzle/*.sql")):
    for chunk in open(path).read().split("--> statement-breakpoint"):
        sql = chunk.strip().rstrip(";").strip()
        if sql:
            stmts.append({"sql": sql})

body = json.dumps({"batch": stmts}).encode()
req = urllib.request.Request(
    f"{api}/d1/database/{uuid}/raw",
    data=body,
    headers={"Content-Type": "application/json"},
    method="POST",
)
payload = None
try:
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.load(resp)
except urllib.error.HTTPError as err:
    # The batch endpoint reports statement failures as HTTP 500 with a JSON body.
    try:
        payload = json.loads(err.read().decode(errors="replace"))
    except json.JSONDecodeError:
        print(f"migration request failed: HTTP {err.code}", file=sys.stderr)
        sys.exit(1)

if not payload.get("success"):
    text = json.dumps(payload.get("errors") or [])
    if "already exists" in text:
        print("local D1 already migrated")
        sys.exit(0)
    print("migration failed:", text[:500], file=sys.stderr)
    sys.exit(1)

print(f"applied {len(stmts)} statements to local D1 {uuid[:8]}")
PY
